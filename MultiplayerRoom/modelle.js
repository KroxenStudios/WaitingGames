import { Konto } from "./accounts.js";
import { sterne, sterneText, oeffneMelden } from "./profil.js";
import { modellbild } from "./modellbild.js";
import { VORLAGEN } from "./bau.js";

const L = (de, en) => (window.WG ? WG.L(de, en) : de);

function el(tag, props = {}, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e[k] = v;
  }
  for (const k of kinder) e.append(k);
  return e;
}

const datum = t => new Date(t).toLocaleDateString(WG?.lang === "en" ? "en-GB" : "de-DE");
const STATUS = { pending: ["In Prüfung", "In review"], approved: ["Veröffentlicht", "Published"] };

let dialog, inhalt;
let tab = "vorlagen";
let hinweis = "", hinweisArt = "", laden = false;
let daten = [];
let seite = 0, mehr = false;

function setzeHinweis(text, art = "fehler") {
  hinweis = text;
  hinweisArt = art;
  zeige();
}

let ladeLauf = 0;
async function ladeListe(neu = true) {
  const lauf = ++ladeLauf;
  if (neu) { seite = 0; daten = []; }
  laden = true;
  zeige();
  try {
    if (tab === "vorlagen") {
      daten = [];
      mehr = false;
    } else if (tab === "neu" || tab === "top" || tab === "best") {
      const d = await Konto.anfrage("GET", `/models?sort=${tab === "top" ? "top" : tab === "best" ? "best" : "new"}&page=${seite}`);
      if (lauf !== ladeLauf) return;
      daten = daten.concat(d.models);
      mehr = d.mehr;
    } else if (tab === "meine") {
      const d = await Konto.anfrage("GET", "/models/mine");
      if (lauf !== ladeLauf) return;
      daten = d.models;
      mehr = false;
    } else if (tab === "pruefen") {
      const d = await Konto.anfrage("GET", "/admin/pending");
      if (lauf !== ladeLauf) return;
      daten = d.models;
      mehr = false;
    }
    hinweis = "";
  } catch (e) {
    if (lauf !== ladeLauf) return;
    daten = [];
    hinweis = e.message === "netz" ? L("Der Server ist gerade nicht erreichbar.", "The server is not reachable right now.") : Konto.fehlerText(e.message);
    hinweisArt = "fehler";
  }
  laden = false;
  zeige();
}

async function ladeModell(m) {
  try {
    const d = await Konto.anfrage("POST", `/models/${m.id}/download`);
    Konto.planSetzen(d.data);
    dialog.close();
  } catch (e) {
    setzeHinweis(Konto.fehlerText(e.message));
  }
}

async function alsDatei(m) {
  try {
    const d = await Konto.anfrage("POST", `/models/${m.id}/download`);
    Konto.dateiSpeichern(d.title || m.title, d.data);
    if (tab !== "pruefen") await ladeListe(true);
  } catch (e) {
    setzeHinweis(Konto.fehlerText(e.message));
  }
}

async function bildErzeugen(m) {
  try {
    const d = await Konto.anfrage("POST", `/models/${m.id}/download`);
    await Konto.anfrage("PUT", `/models/${m.id}/thumb`, { thumb: modellbild(d.data) });
    await ladeListe(true);
  } catch (e) {
    setzeHinweis(e.message === "netz" || !Konto.fehlerText(e.message) ? L("Das Vorschaubild konnte nicht erzeugt werden.", "The preview could not be created.") : Konto.fehlerText(e.message));
  }
}

async function bewerte(m, stars) {
  try {
    const r = await Konto.anfrage("POST", `/models/${m.id}/rate`, { stars });
    m.avg = r.avg; m.n = r.n; m.my = r.my;
    zeige();
  } catch (e) { setzeHinweis(Konto.fehlerText(e.message)); }
}

function zeile(m) {
  const meta = [`${m.parts} ${L("Teile", "parts")}`, `⬇ ${m.downloads}`, datum(m.created)];
  if (tab === "meine") meta.push(L(...STATUS[m.status] || ["", ""]));
  const knoepfe = [];
  if (tab === "pruefen") {
    knoepfe.push(
      el("button", { type: "button", textContent: L("Ansehen", "View"), onclick: () => ladeModell(m) }),
      el("button", { type: "button", textContent: "⭳", title: L("Als Datei speichern", "Save as file"), ariaLabel: L("Als Datei speichern", "Save as file"), onclick: () => alsDatei(m) }),
      el("button", { type: "button", class: "primaer", textContent: L("Freigeben", "Approve"), onclick: () => entscheide(m, "approve") }),
      el("button", { type: "button", textContent: L("Ablehnen", "Reject"), onclick: () => entscheide(m, "reject") })
    );
  } else {
    knoepfe.push(el("button", { type: "button", textContent: L("Laden", "Load"), onclick: () => ladeModell(m) }));
    if (!m.hasThumb && (tab === "meine" || Konto.istAdmin())) {
      knoepfe.push(el("button", { type: "button", textContent: "🖼", title: L("Vorschaubild erzeugen", "Create preview"), ariaLabel: L("Vorschaubild erzeugen", "Create preview"), onclick: () => bildErzeugen(m) }));
    }
    if (tab !== "meine" && Konto.angemeldet() && m.uploader.toLowerCase() !== String(Konto.benutzer()).toLowerCase()) {
      knoepfe.push(el("button", { type: "button", textContent: "⚑", title: L("Melden", "Report"), ariaLabel: L("Melden", "Report"), onclick: () => oeffneMelden({ kind: "model", name: m.uploader, ref: m.id }) }));
    }
    knoepfe.push(el("button", { type: "button", textContent: "⭳", title: L("Als Datei speichern", "Save as file"), ariaLabel: L("Als Datei speichern", "Save as file"), onclick: () => alsDatei(m) }));
    if (tab === "meine" || Konto.istAdmin()) {
      knoepfe.push(el("button", { type: "button", textContent: "🗑", ariaLabel: L("Löschen", "Delete"), onclick: async () => {
        if (!confirm(L(`„${m.title}“ löschen?`, `Delete "${m.title}"?`))) return;
        try { await Konto.anfrage("DELETE", `/models/${m.id}`); await ladeListe(true); } catch (e) { setzeHinweis(Konto.fehlerText(e.message)); }
      } }));
    }
  }
  const bild = m.hasThumb
    ? el("img", { class: "modellBild", src: `${Konto.basis}/models/${m.id}/thumb`, alt: "", loading: "lazy", width: 128, height: 80 })
    : el("div", { class: "modellBild leer", textContent: "🚗" });
  return el("li", { class: "modell" }, bild,
    el("div", { class: "modellText" },
      el("b", { textContent: m.title }),
      el("small", {}, `${L("von", "by")} `, el("a", { href: `profil.html?u=${encodeURIComponent(m.uploader)}`, target: "_blank", rel: "noopener", textContent: m.uploader })),
      m.descr ? el("small", { class: "beschr", textContent: m.descr }) : "",
      m.status === "approved" ? el("small", {}, sterne(m.avg), ` ${sterneText(m.avg, m.n)}`) : "",
      (m.status === "approved" && Konto.angemeldet() && m.uploader.toLowerCase() !== String(Konto.benutzer()).toLowerCase())
        ? el("small", { class: "bewerten" }, `${m.my ? L("Deine Bewertung", "Your rating") : L("Bewerten", "Rate")}: `, sterne(m.my || 0, { onWahl: st => bewerte(m, st), titel: L("Sterne vergeben", "Give stars") }))
        : "",
      el("small", { textContent: meta.join(" · ") })),
    el("div", { class: "modellKnoepfe" }, ...knoepfe));
}

const vorlagenBild = new Map();
function vorlageBild(v) {
  if (!vorlagenBild.has(v.id)) {
    let bild = "";
    try { bild = modellbild(JSON.stringify(v.bauen())); } catch {}
    vorlagenBild.set(v.id, bild);
  }
  return vorlagenBild.get(v.id);
}

function vorlageZeile(v) {
  const tr = window.bastelkarreTr || (s => s);
  const bild = vorlageBild(v);
  const teile = (() => { try { return v.bauen().parts.length; } catch { return 0; } })();
  return el("li", { class: "modell" },
    bild ? el("img", { class: "modellBild", src: bild, alt: "", width: 128, height: 80 }) : el("div", { class: "modellBild leer", textContent: "🚗" }),
    el("div", { class: "modellText" },
      el("b", { textContent: tr(v.name) }),
      el("small", { textContent: `${L("Vorlage von KroxenStudios", "Preset by KroxenStudios")} · ${teile} ${L("Teile", "parts")}` })),
    el("div", { class: "modellKnoepfe" },
      el("button", { type: "button", textContent: L("Laden", "Load"), onclick: () => { Konto.planSetzen(JSON.stringify(v.bauen())); dialog.close(); } })));
}

async function entscheide(m, was) {
  try {
    await Konto.anfrage("POST", `/admin/models/${m.id}/${was}`);
    await ladeListe(true);
  } catch (e) { setzeHinweis(Konto.fehlerText(e.message)); }
}

function uploadFormular() {
  if (!Konto.angemeldet()) {
    return el("div", { class: "modellInfo" },
      el("p", { class: "kontoInfo", textContent: L("Zum Hochladen brauchst du ein (kostenloses) Konto.", "You need a (free) account to upload.") }),
      el("button", { type: "button", class: "primaer", textContent: L("Anmelden", "Sign in"), onclick: () => { dialog.close(); Konto.oeffneKonto(); } }));
  }
  const titel = el("input", { type: "text", maxLength: 40, required: true, minLength: 3, placeholder: L("Titel (mind. 3 Zeichen)", "Title (at least 3 characters)") });
  const beschr = el("input", { type: "text", maxLength: 160, placeholder: L("Beschreibung (optional)", "Description (optional)") });
  const knopf = el("button", { type: "submit", class: "primaer", textContent: L("Aktuelles Fahrzeug hochladen", "Upload current vehicle") });
  return el("form", { class: "kontoForm", onsubmit: async e => {
    e.preventDefault();
    knopf.disabled = true;
    try {
      const planText = JSON.stringify(Konto.plan());
      let thumb;
      try { thumb = modellbild(planText); } catch { thumb = undefined; }
      const r = await Konto.anfrage("POST", "/models", { title: titel.value, descr: beschr.value, data: planText, ...(thumb ? { thumb } : {}) });
      hinweis = r.status === "approved"
        ? L("Veröffentlicht.", "Published.")
        : L("Hochgeladen. Es ist jetzt für alle sichtbar.", "Uploaded. It is now visible to everyone.");
      hinweisArt = "ok";
      await ladeListe(true);
    } catch (err) {
      knopf.disabled = false;
      setzeHinweis(err.message === "netz" ? L("Der Server ist gerade nicht erreichbar.", "The server is not reachable right now.") : Konto.fehlerText(err.message));
    }
  } }, titel, beschr, knopf,
  el("p", { class: "kontoInfo", textContent: L("Mit dem Hochladen wird dein Benutzername öffentlich beim Fahrzeug angezeigt, und jeder darf es laden und weiterverwenden. Es ist sofort sichtbar; unpassende Fahrzeuge kann man melden.", "By uploading, your username is shown publicly with the vehicle and anyone may load and reuse it. It is visible immediately; inappropriate vehicles can be reported.") }));
}

function zeige() {
  if (!inhalt) return;
  inhalt.replaceChildren(el("button", { type: "button", class: "kontoZu", textContent: "✕", ariaLabel: L("Schließen", "Close"), onclick: () => dialog.close() }));
  const tabs = [["vorlagen", L("Vorlagen", "Presets")], ["neu", L("Neu", "New")], ["best", L("Beste", "Top rated")], ["top", L("Beliebt", "Popular")], ["meine", L("Meine", "Mine")]];
  if (Konto.istAdmin()) tabs.push(["pruefen", L("Prüfen", "Review")]);
  inhalt.append(
    el("h2", { textContent: L("Hangar", "Hangar") }),
    el("div", { class: "modellTabs" }, ...tabs.map(([id, text]) =>
      el("button", { type: "button", class: id === tab ? "an" : "", textContent: text, onclick: () => { tab = id; hinweis = ""; ladeListe(true); } }))),
    hinweis ? el("p", { class: "kontoMeldung " + hinweisArt, textContent: hinweis }) : ""
  );
  if (tab === "meine") inhalt.append(uploadFormular());
  if (laden && !daten.length) {
    inhalt.append(el("p", { class: "kontoInfo", textContent: L("Lade …", "Loading …") }));
    return;
  }
  const liste = el("ul", { class: "modellListe" });
  if (tab === "vorlagen") {
    for (const v of VORLAGEN) liste.append(vorlageZeile(v));
    inhalt.append(liste);
    return;
  }
  if (!daten.length && !hinweis) {
    liste.append(el("li", { class: "leer", textContent: tab === "pruefen" ? L("Nichts zu prüfen.", "Nothing to review.") : L("Noch keine Fahrzeuge.", "No vehicles yet.") }));
  }
  for (const m of daten) liste.append(zeile(m));
  inhalt.append(liste);
  if (mehr) inhalt.append(el("button", { type: "button", textContent: L("Mehr laden", "Load more"), onclick: () => { seite++; ladeListe(false); } }));
}

export function startModelle() {
  const hud = document.getElementById("hud");
  if (!hud) return;
  const knopf = el("button", { type: "button", id: "modelleBtn", textContent: "📦", title: L("Hangar", "Hangar"), ariaLabel: L("Hangar", "Hangar"), onclick: () => {
    hinweis = "";
    if (tab === "pruefen" && !Konto.istAdmin()) tab = "vorlagen";
    zeige();
    dialog.showModal();
    ladeListe(true);
  } });
  hud.insertBefore(knopf, document.getElementById("kontoBtn") || document.getElementById("langBtn") || null);

  inhalt = el("div", { class: "kontoInhalt" });
  dialog = el("dialog", { id: "modelleDialog" }, inhalt);
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
}
