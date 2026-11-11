for (const el of document.querySelectorAll("[data-lang]")) el.hidden = el.dataset.lang !== WG.lang;
if (WG.lang === "en") document.title = "Licences – Bastelkarre";
document.getElementById("langBtn").onclick = () => WG.set(WG.lang === "en" ? "de" : "en");
