/**
 * Count-up on the hero readout stats. Each `.readout .v` has its first numeric
 * token wrapped and animated from 0 to its value when it scrolls into view,
 * preserving surrounding text (prefixes like ~ or ×, the "/ 4.00", etc.).
 *
 * No-ops when the user prefers reduced motion.
 */

const NUM = /(\d+(?:\.\d+)?)/;

export function initCountUp(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const values = document.querySelectorAll<HTMLElement>('.readout .v');
  const spans: HTMLElement[] = [];

  values.forEach((v) => {
    const m = v.innerHTML.match(NUM);
    if (!m) return;
    const raw = m[1];
    const dec = raw.includes('.') ? raw.split('.')[1].length : 0;
    const start = dec > 0 ? (0).toFixed(dec) : '0';
    // replace only the first numeric token, keep everything around it intact
    v.innerHTML = v.innerHTML.replace(
      NUM,
      `<span class="cu" data-to="${raw}" data-dec="${dec}">${start}</span>`
    );
    const span = v.querySelector<HTMLElement>('.cu');
    if (span) spans.push(span);
  });

  if (!spans.length) return;

  const animate = (el: HTMLElement): void => {
    const to = parseFloat(el.dataset.to ?? '0');
    const dec = parseInt(el.dataset.dec ?? '0', 10);
    const dur = 1000;
    const t0 = performance.now();

    const step = (now: number): void => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      el.textContent = (to * eased).toFixed(dec);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = to.toFixed(dec);
    };
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          animate(e.target as HTMLElement);
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.6 }
  );

  spans.forEach((s) => io.observe(s));
}
