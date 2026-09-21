/**
 * Copy-to-clipboard for elements carrying `data-copy`. Confirms with a
 * checkmark and a brief "copied" label, then reverts. Falls back to a legacy
 * execCommand copy when the async clipboard API is unavailable.
 */
export function initCopyEmail(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.copy-btn[data-copy]');

  buttons.forEach((btn) => {
    const label = btn.querySelector<HTMLElement>('.copy-label');
    const original = label?.textContent ?? 'copy';
    let timer = 0;

    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy ?? '';
      if (!text) return;

      let ok = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          ok = true;
        } else {
          ok = legacyCopy(text);
        }
      } catch {
        ok = legacyCopy(text);
      }

      btn.classList.toggle('copied', ok);
      if (label) label.textContent = ok ? 'copied' : original;

      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        btn.classList.remove('copied');
        if (label) label.textContent = original;
      }, 1800);
    });
  });
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}
