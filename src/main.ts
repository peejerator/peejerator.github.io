// Styles — imported in cascade order (tokens first, then base, then components).
import './styles/tokens.css';
import './styles/base.css';
import './styles/topbar.css';
import './styles/hero.css';
import './styles/spine.css';
import './styles/sections.css';
import './styles/components.css';
import './styles/footer.css';
import './styles/reveal.css';

// Behavior
import { initScrollReveal } from './modules/scrollReveal';
import { initCircuitSpine } from './modules/circuitSpine';

initScrollReveal();
initCircuitSpine();
