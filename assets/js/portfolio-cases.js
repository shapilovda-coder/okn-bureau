(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-portfolio]').forEach(section => {
    const track = section.querySelector('[data-portfolio-carousel]');
    const previous = section.querySelector('[data-portfolio-prev]');
    const next = section.querySelector('[data-portfolio-next]');
    if (!track) return;

    const scrollByCard = direction => {
      const card = track.querySelector('.portfolio-card');
      if (!card) return;
      const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || 0);
      track.scrollBy({
        left: direction * (card.getBoundingClientRect().width + gap),
        behavior: reducedMotion ? 'auto' : 'smooth'
      });
    };

    previous?.addEventListener('click', () => scrollByCard(-1));
    next?.addEventListener('click', () => scrollByCard(1));
    track.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollByCard(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollByCard(1);
      }
    });
  });

  let returnFocus = null;

  const openCase = id => {
    const dialog = document.getElementById(id);
    if (!(dialog instanceof HTMLDialogElement)) return;
    returnFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('case-dialog-open');
    history.replaceState(null, '', `#${id}`);
  };

  const closeCase = dialog => {
    if (dialog.open) dialog.close();
  };

  document.querySelectorAll('[data-case-open]').forEach(button => {
    button.addEventListener('click', () => openCase(button.dataset.caseOpen));
  });

  document.querySelectorAll('.case-dialog').forEach(dialog => {
    dialog.querySelector('[data-case-close]')?.addEventListener('click', () => closeCase(dialog));
    dialog.addEventListener('click', event => {
      if (event.target === dialog) closeCase(dialog);
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('case-dialog-open');
      if (location.hash === `#${dialog.id}`) {
        history.replaceState(null, '', `${location.pathname}${location.search}`);
      }
      if (returnFocus instanceof HTMLElement) returnFocus.focus();
      returnFocus = null;
    });
  });

  const initialCase = location.hash.slice(1);
  if (initialCase.startsWith('case-')) openCase(initialCase);
})();

