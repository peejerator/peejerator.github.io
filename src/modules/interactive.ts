/**
 * Pointer-reactive polish (no dependencies):
 *  - project cards / panels tilt toward the cursor and carry a tracking spotlight
 *  - a soft amber glow follows the cursor through the hero
 *  - the fixed engineering grid drifts slightly opposite the cursor
 *
 * No-ops when the user prefers reduced motion.
 */

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export function initInteractive(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  initTilt();
  initPointerAmbient();
}

/* ---- tilt + spotlight on cards and panels ---- */
function initTilt(): void {
  const targets = document.querySelectorAll<HTMLElement>(
    '.card, .edu-grid .panel, .stack .panel'
  );
  const MAX_DEG = 2.5; // subtle; keep text readable

  targets.forEach((el) => {
    let raf = 0;
    let nx = 0;
    let ny = 0;

    const apply = (): void => {
      raf = 0;
      const rx = (+(MAX_DEG * -ny)).toFixed(2);
      const ry = (+(MAX_DEG * nx)).toFixed(2);
      el.style.transform = `perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-3px)`;
    };

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width; // 0..1
      const py = (e.clientY - r.top) / r.height; // 0..1
      nx = clamp(px * 2 - 1, -1, 1);
      ny = clamp(py * 2 - 1, -1, 1);
      el.style.setProperty('--sx', (px * 100).toFixed(1) + '%');
      el.style.setProperty('--sy', (py * 100).toFixed(1) + '%');
      if (!raf) raf = requestAnimationFrame(apply);
    });

    el.addEventListener('pointerleave', () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      el.style.transform = '';
    });
  });
}

/* ---- cursor glow + grid parallax ---- */
function initPointerAmbient(): void {
  const body = document.body;

  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  glow.setAttribute('aria-hidden', 'true');
  body.appendChild(glow);

  let cx = 0;
  let cy = 0;
  let ticking = false;

  const update = (): void => {
    ticking = false;

    // cursor glow follows the pointer
    glow.style.setProperty('--cgx', cx + 'px');
    glow.style.setProperty('--cgy', cy + 'px');

    // grid drifts a few px opposite the cursor for parallax depth
    const nx = (cx / window.innerWidth) * 2 - 1;
    const ny = (cy / window.innerHeight) * 2 - 1;
    body.style.setProperty('--gx', (-nx * 10).toFixed(1) + 'px');
    body.style.setProperty('--gy', (-ny * 10).toFixed(1) + 'px');
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      cx = e.clientX;
      cy = e.clientY;
      if (!body.classList.contains('cg-on')) body.classList.add('cg-on');
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true }
  );

  window.addEventListener('pointerleave', () => body.classList.remove('cg-on'));
}
