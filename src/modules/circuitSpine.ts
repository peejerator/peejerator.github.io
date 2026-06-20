/**
 * Circuit spine.
 *
 * The name is the power source: its letters glow, then drain right-to-left as a
 * current pulse is pulled out of the name and travels down the rail to ground,
 * lighting each schematic component (resistor, capacitor, inductor, IC) as it
 * passes. Driven entirely by scroll position.
 *
 * No-ops when the user prefers reduced motion.
 */

const NS = 'http://www.w3.org/2000/svg';

/** Geometry snapshot, recomputed on layout/resize. */
interface Geo {
  mainLeft: number;
  mainTop: number;
  ox: number;
  oy: number;
  heroBottomDocY: number;
  pathLen: number;
  attachXDoc: number;
  attachYDoc: number;
  railXDoc: number;
  textW: number;
}

export function initCircuitSpine(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const main = document.querySelector<HTMLElement>('main');
  const hero = document.querySelector<HTMLElement>('.hero');
  const h1 = hero?.querySelector<HTMLElement>('h1') ?? null;
  const pulse = document.querySelector<HTMLElement>('.pulse');
  if (!main || !hero || !h1 || !pulse) return;

  const railNode = document.querySelector<HTMLElement>('#work .sec-head .node');
  if (!railNode) return;

  const ghost = h1.querySelector<HTMLElement>('.ghost');
  document.body.classList.add('js-spine');

  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('.comp, .sec-head .node')
  );
  const ground = document.querySelector<HTMLElement>('.comp-ground');
  const headNodes = Array.from(
    document.querySelectorAll<HTMLElement>('.section .sec-head .node')
  );

  function setGaps(): void {
    headNodes.forEach((n) => {
      const sec = n.closest<HTMLElement>('.section');
      if (!sec) return;
      const nr = n.getBoundingClientRect();
      const sr = sec.getBoundingClientRect();
      const center = nr.top - sr.top + nr.height / 2;
      const gh = Math.max(12, nr.height / 2 - 1);
      sec.style.setProperty('--ga', (center - gh).toFixed(1) + 'px');
      sec.style.setProperty('--gb', (center + gh).toFixed(1) + 'px');
    });
    if (ground) {
      const gsec = ground.closest<HTMLElement>('.section');
      if (gsec) {
        const gr = ground.getBoundingClientRect();
        const gsr = gsec.getBoundingClientRect();
        // rail stops at the ground's top
        gsec.style.setProperty('--end', (gr.top - gsr.top + 4).toFixed(1) + 'px');
      }
    }
  }

  // build the bent source lead
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'source-lead');
  const path = document.createElementNS(NS, 'path');
  svg.appendChild(path);
  hero.insertBefore(svg, hero.firstChild);

  let geo: Geo | null = null;
  let ticking = false;

  function layout(): void {
    // non-null: guarded at top of init
    const heroEl = hero as HTMLElement;
    const h1El = h1 as HTMLElement;
    const railEl = railNode as HTMLElement;
    const mainEl = main as HTMLElement;

    const sx = window.scrollX;
    const sy = window.scrollY;
    const hr = heroEl.getBoundingClientRect();
    const ox = hr.left + sx;
    const oy = hr.top + sy;
    const H = hr.height;
    const rr = railEl.getBoundingClientRect();
    const railXDoc = rr.left + sx + rr.width / 2;
    const nr = h1El.getBoundingClientRect();
    const attachXDoc = nr.left + sx + 2;
    const attachYDoc = nr.top + sy + nr.height * 0.72;
    const railX = railXDoc - ox;
    const attachX = attachXDoc - ox;
    const attachY = attachYDoc - oy;
    const r = 14;
    const corner = railX + r;
    path.setAttribute(
      'd',
      'M ' + attachX + ' ' + attachY + ' H ' + corner +
        ' Q ' + railX + ' ' + attachY + ' ' + railX + ' ' + (attachY + r) +
        ' V ' + H
    );
    const mr = mainEl.getBoundingClientRect();
    geo = {
      mainLeft: mr.left + sx,
      mainTop: mr.top + sy,
      ox,
      oy,
      heroBottomDocY: oy + H,
      pathLen: path.getTotalLength(),
      attachXDoc,
      attachYDoc,
      railXDoc,
      textW: ghost ? Math.max(40, ghost.offsetWidth - 120) : 300,
    };
    setGaps();
  }

  function update(): void {
    ticking = false;
    if (!geo) layout();
    const g0 = geo as Geo;
    const pulseEl = pulse as HTMLElement;
    const mainEl = main as HTMLElement;

    setGaps(); // keep rail gaps aligned to components as headings reveal / reflow

    let groundDocY: number;
    if (ground) {
      const g = ground.getBoundingClientRect();
      groundDocY = g.top + window.scrollY + g.height / 2;
    } else {
      groundDocY = g0.mainTop + mainEl.offsetHeight;
    }
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const sY = window.scrollY;
    const atBottom = sY >= maxScroll - 1;

    // phase 1: drain the name's glow right-to-left while the name is still on screen
    const drainEnd = Math.max(120, Math.min(maxScroll * 0.5, g0.attachYDoc - 160));
    const drain = Math.min(1, Math.max(0, sY / drainEnd));
    document.body.style.setProperty(
      '--edgepx',
      (60 + (1 - drain) * (g0.textW + 60)).toFixed(1) + 'px'
    );

    if (sY < drainEnd) {
      // still draining: the dot hasn't formed yet
      pulseEl.style.opacity = '0';
      pulseEl.style.left = g0.attachXDoc - g0.mainLeft - 4.5 + 'px';
      pulseEl.style.top = g0.attachYDoc - g0.mainTop - 4.5 + 'px';
      for (let k = 0; k < nodes.length; k++) nodes[k].classList.remove('lit');
      return;
    }

    // phase 2: the dot has been pulled out of the name and travels to ground
    const denom = maxScroll - drainEnd;
    let tp = denom > 0 ? (sY - drainEnd) / denom : 1;
    if (atBottom) tp = 1;
    tp = Math.min(1, Math.max(0, tp));
    const railTail = groundDocY - g0.heroBottomDocY; // straight rail from hero bottom to ground
    const total = g0.pathLen + railTail;
    const d = tp * total;
    let px: number;
    let py: number;
    if (d <= g0.pathLen) {
      const pt = path.getPointAtLength(d); // follow the bent lead exactly, curve and all
      px = g0.ox + pt.x;
      py = g0.oy + pt.y;
    } else {
      px = g0.railXDoc;
      py = g0.heroBottomDocY + (d - g0.pathLen);
    }
    pulseEl.style.left = px - g0.mainLeft - 4.5 + 'px';
    pulseEl.style.top = py - g0.mainTop - 4.5 + 'px';
    let behind = false;
    for (let i = 0; i < nodes.length; i++) {
      const rc = nodes[i].getBoundingClientRect();
      const cy = rc.top + window.scrollY + rc.height / 2;
      const dist = Math.abs(cy - py);
      nodes[i].classList.toggle('lit', dist < 35);
      if (dist < rc.height / 2 + 4) behind = true; // dot is over this component: hide it
    }
    pulseEl.style.opacity = behind ? '0' : '1';
  }

  function onScroll(): void {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }
  function onResize(): void {
    layout();
    onScroll();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('load', onResize);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(onResize);
  }
  layout();
  update();
}
