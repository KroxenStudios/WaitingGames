// Gemeinsame Sprachwahl fuer alle Waiting Games: Browsersprache als Vorgabe, Wahl wird in 'wg-lang' gespeichert.
// WG.L(de, en) liefert je nach Sprache den passenden Text (auch fuer Arrays).
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
})();
