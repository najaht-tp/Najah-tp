// Entry point, loaded only when a visitor presses "Play game" (main.js imports it lazily).
// Opens the game over the page and, when a scroll's VIEW DETAILS is used, takes the visitor to that part of the
// portfolio through the page's own navigation (so the back button keeps working).
import { startGame } from './game.js';

let current = null;

// Use the page's own click handlers: they listen on document for these links.
const clickLink = (attrs) => {
  const a = document.createElement('a');
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
};
const inHero = () => !document.documentElement.classList.contains('is-work');

export function navigate(action = {}) {
  switch (action.type) {
    case 'work': clickLink({ href: '#work' }); break;
    case 'case': clickLink({ href: '#case-' + action.slug, 'data-case': action.slug }); break;
    case 'contact': { const mail = document.querySelector('.nav__links a[href^="mailto:"]'); if (mail) mail.click(); break; }
    case 'url': if (action.href) window.open(action.href, '_blank', 'noopener'); break;
    case 'hero': default:
      if (!inHero()) document.getElementById('nav-home')?.click();
      window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

export function openGame() {
  if (current) return current;
  const opener = document.activeElement;
  current = startGame({
    navigate,
    onClose: () => { current = null; if (opener && opener.focus) opener.focus({ preventScroll: true }); },
  });
  return current;
}
