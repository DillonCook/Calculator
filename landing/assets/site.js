(() => {
  const button = document.querySelector('[data-menu-button]');
  const menu = document.querySelector('[data-mobile-menu]');
  if (button && menu) {
    const label = button.querySelector('.sr-only');
    const sync = (opening) => {
      menu.hidden = !opening;
      button.setAttribute('aria-expanded', String(opening));
      if (label) label.textContent = opening ? 'Close navigation' : 'Open navigation';
    };
    const close = (restoreFocus = false) => {
      sync(false);
      if (restoreFocus) button.focus();
    };
    button.addEventListener('click', () => sync(menu.hidden));
    menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => close()));
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !menu.hidden) close(true);
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 980) close(); });
  }

  const main = document.querySelector('#main-content');
  const skipLink = document.querySelector('.skip-link');
  if (main && skipLink) {
    skipLink.addEventListener('click', () => requestAnimationFrame(() => main.focus()));
  }

  const header = document.querySelector('[data-site-header]');
  if (header) {
    const sync = () => header.toggleAttribute('data-scrolled', window.scrollY > 10);
    sync();
    window.addEventListener('scroll', sync, { passive: true });
  }
})();
