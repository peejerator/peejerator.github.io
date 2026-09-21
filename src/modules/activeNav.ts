/**
 * Active-section nav: highlights the topbar link for whichever section is
 * currently dominant in the viewport, using the existing amber underline.
 * Works regardless of reduced-motion (it toggles a class, not an animation).
 */
export function initActiveNav(): void {
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('nav.links a[href^="#"]')
  );
  if (!links.length) return;

  const byId = new Map<string, HTMLAnchorElement>();
  const sections: HTMLElement[] = [];
  links.forEach((a) => {
    const id = (a.getAttribute('href') ?? '').slice(1);
    const sec = id ? document.getElementById(id) : null;
    if (sec) {
      byId.set(id, a);
      sections.push(sec);
    }
  });
  if (!sections.length) return;

  const ratios = new Map<string, number>();
  let current = '';

  const setActive = (id: string): void => {
    if (id === current) return;
    current = id;
    byId.forEach((a, key) => a.classList.toggle('active', key === id));
  };

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        ratios.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
      });
      let bestId = '';
      let bestRatio = 0;
      ratios.forEach((r, id) => {
        if (r > bestRatio) {
          bestRatio = r;
          bestId = id;
        }
      });
      if (bestId) setActive(bestId);
    },
    // top margin clears the sticky header; bottom margin biases toward the
    // section occupying the upper part of the viewport
    { threshold: [0.1, 0.25, 0.5, 0.75], rootMargin: '-80px 0px -55% 0px' }
  );

  sections.forEach((s) => io.observe(s));
}
