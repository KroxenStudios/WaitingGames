(() => {
  let stored = null;
  try { stored = localStorage.getItem('wg-lang'); } catch (e) {}
  const lang = stored === 'de' || stored === 'en' ? stored : (/^de\b/i.test(navigator.language || '') ? 'de' : 'en');
  document.documentElement.lang = lang;
  window.WG = {
    lang,
    L: (de, en) => (lang === 'de' ? de : en),
    set(l) { try { localStorage.setItem('wg-lang', l); } catch (e) {} location.reload(); },
  };
  document.addEventListener('DOMContentLoaded', () => {
    if (lang !== 'en') return;
    for (const el of document.querySelectorAll('[data-en]')) el.innerHTML = el.dataset.en;
    for (const el of document.querySelectorAll('[data-en-title]')) el.title = el.dataset.enTitle;
    for (const el of document.querySelectorAll('[data-en-placeholder]')) el.placeholder = el.dataset.enPlaceholder;
    for (const el of document.querySelectorAll('[data-en-aria]')) el.setAttribute('aria-label', el.dataset.enAria);
    for (const el of document.querySelectorAll('[data-en-href]')) el.href = el.dataset.enHref;
    for (const el of document.querySelectorAll('[data-en-value]')) el.value = el.dataset.enValue;
  });
})();
