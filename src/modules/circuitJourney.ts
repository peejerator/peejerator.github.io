import { STATION_PITCH, type BoardStop } from './circuitLayout';
import type { CircuitBoard } from './circuitBoard';

const clamp = (n: number): number => Math.max(0, Math.min(1, n));

/** Native page scrolling drives the PCB camera; document links remain native. */
export async function initCircuitJourney(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#circuit-world');
  if (!canvas) return;
  const scenes = Array.from(document.querySelectorAll<HTMLElement>('.scene'));
  if (scenes.length < 2) return;
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.chapter-nav a, nav.links a[href^="#"]'));
  const toggle = document.querySelector<HTMLButtonElement>('.motion-toggle');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const names = ['POWER ON', 'VISION / INPUT', 'COMPUTE / FPGA', 'SOFTWARE / LOGIC', 'KNOWLEDGE / TRANSFER', 'DATA / CONNECTION', 'DUAL CORE', 'TOOLCHAIN', 'OPEN CONNECTION'];
  const labels = ['PC-01', 'VISION', 'MAC ARRAY', 'C++ / AST', 'TRANSFER', 'SQL / ETL', 'CS + EE', 'I/O', 'CONNECT'];
  const stops: BoardStop[] = scenes.map((scene, i) => ({
    x: i % 2 ? -1.6 : 2.2,
    y: i * STATION_PITCH,
    side: scene.dataset.side === 'right' ? -1 : 1,
    name: names[i],
    label: labels[i],
  }));
  let board: CircuitBoard | null = null;
  try {
    const { createCircuitBoard } = await import('./circuitBoard');
    board = createCircuitBoard(canvas, stops);
    document.body.classList.add('journey-ready');
  } catch (error) {
    // Content and chapter navigation still work without a graphics context.
    document.body.classList.add('circuit-unavailable');
    if (import.meta.env.DEV) console.error('Circuit initialization failed:', error);
  }
  let scrollStops: number[] = [];
  let target = 0, position = 0, active = -1;
  let frame = 0, lastTime = 0;
  let paused = preference.matches;

  function draw(time: number): void {
    board?.render(position, time, paused);
  }
  function tick(time: number): void {
    frame = 0;
    if (document.hidden) return;
    if (time - lastTime >= 32 || paused) {
      const elapsed = Math.min(64, time - lastTime);
      lastTime = time;
      if (!paused) position += (target - position) * (1 - Math.exp(-elapsed / 100));
      draw(time);
    }
    if (!paused && board) frame = requestAnimationFrame(tick);
  }
  function requestDraw(): void {
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function updateScroll(): void {
    const y = window.scrollY;
    let i = 0;
    while (i < scrollStops.length - 2 && y > scrollStops[i + 1]) i++;
    target = i + clamp((y - scrollStops[i]) / Math.max(1, scrollStops[i + 1] - scrollStops[i]));
    const next = Math.round(target);
    if (next !== active) {
      active = next;
      document.body.dataset.side = scenes[next].dataset.side ?? 'left';
      const id = next === 0 ? 'top' : next <= 3 ? 'work' : next <= 5 ? 'experience' : next === 6 ? 'education' : next === 7 ? 'stack' : 'contact';
      links.forEach(link => {
        const current = link.hash === '#' + id;
        link.classList.toggle('active', current);
        if (current) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
    requestDraw();
  }
  function resize(): void {
    const height = window.innerHeight;
    board?.resize(window.innerWidth, height);
    scrollStops = scenes.map((s, i) => i === 0 ? 0 : s.getBoundingClientRect().top + window.scrollY + Math.max(0, (s.offsetHeight - height) / 2));
    updateScroll();
    draw(performance.now());
  }
  function updateToggle(): void {
    if (!toggle) return;
    toggle.textContent = paused ? 'Resume circuit motion' : 'Pause circuit motion';
    toggle.setAttribute('aria-pressed', String(paused));
  }
  toggle?.addEventListener('click', () => {
    paused = !paused;
    updateToggle();
    if (paused) { cancelAnimationFrame(frame); frame = 0; draw(performance.now()); }
    else requestDraw();
  });
  preference.addEventListener('change', () => { paused = preference.matches; updateToggle(); requestDraw(); });
  window.addEventListener('scroll', updateScroll, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('load', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else requestDraw();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); cancelAnimationFrame(frame); frame = 0;
    document.body.classList.remove('journey-ready');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    document.body.classList.add('journey-ready'); requestDraw();
  });
  window.addEventListener('pagehide', event => { if (!event.persisted) board?.dispose(); });
  document.fonts.ready.then(resize);
  updateToggle();
  resize();
}
