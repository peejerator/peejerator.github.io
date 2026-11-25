// The /tools/ page: the launcher for the geography tools in public/tools (a submodule), with a search box and
// category chips that filter the cards
import './styles/tokens.css';
import './styles/base.css';
import './styles/topbar.css';
import './styles/components.css';
import './styles/footer.css';
import './styles/reveal.css';
import './styles/tools.css';

const input = document.querySelector<HTMLInputElement>('#toolSearch');
const chips = [...document.querySelectorAll<HTMLButtonElement>('.cat-chips button')];
const sections = [...document.querySelectorAll<HTMLElement>('.tool-cat')];
const empty = document.querySelector<HTMLElement>('#toolsEmpty');
let category = 'all';

// lower case, without accents, so "Pais" finds "País"
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// what a card is found by: its name, description, keywords and category
const haystack = new Map<HTMLElement, string>();
for (const sec of sections) {
	for (const card of sec.querySelectorAll<HTMLElement>('.tool-card')) {
		const text = [card.querySelector('.tool-id')?.textContent, card.querySelector('.tool-body p')?.textContent, card.dataset.keywords, sec.dataset.cat];
		haystack.set(card, fold(text.filter(Boolean).join(' ')));
	}
}
const plural = (n: number) => `${n} tool${n === 1 ? '' : 's'}`;

function apply() {
	const words = fold(input?.value ?? '').split(/\s+/).filter(Boolean);
	const matches = (card: HTMLElement) => words.every((w) => haystack.get(card)!.includes(w));
	let shown = 0;
	for (const sec of sections) {
		const cards = [...sec.querySelectorAll<HTMLElement>('.tool-card')];
		let n = 0;
		for (const card of cards) {
			const on = matches(card);
			card.hidden = !on;
			if (on) n++;
		}
		sec.hidden = !n || (category !== 'all' && sec.dataset.cat !== category);
		if (!sec.hidden) shown += n;
		const count = sec.querySelector('.cat-count');
		if (count) count.textContent = words.length ? `${n} of ${plural(cards.length)}` : plural(cards.length);
	}
	// each chip counts the matches in its category
	for (const chip of chips) {
		const cat = chip.dataset.cat;
		const n = sections
			.filter((s) => cat === 'all' || s.dataset.cat === cat)
			.reduce((sum, s) => sum + [...s.querySelectorAll<HTMLElement>('.tool-card')].filter(matches).length, 0);
		chip.querySelector('.n')!.textContent = String(n);
		chip.setAttribute('aria-pressed', String(cat === category));
	}
	if (empty) {
		empty.hidden = shown > 0;
		empty.querySelector('span')!.textContent = input?.value.trim() ?? '';
	}
}

input?.addEventListener('input', apply);
for (const chip of chips) {
	chip.addEventListener('click', () => {
		category = chip.dataset.cat ?? 'all';
		apply();
	});
}
// "/" jumps to the search box, Esc clears it
document.addEventListener('keydown', (e) => {
	if (e.key === '/' && document.activeElement !== input) {
		e.preventDefault();
		input?.focus();
	} else if (e.key === 'Escape' && document.activeElement === input && input) {
		input.value = '';
		apply();
	}
});
apply();
