// kartenfenster (wie der hangar für fahrzeuge): karten anderer laden, eigene hochladen und teilen,
// lokale karten verwalten. geladene karten landen in der lokalen ablage und lassen sich dort anwählen und bearbeiten.
import { Konto } from "./accounts.js";
import { oeffneMelden } from "./profil.js";
import * as FK from "./fightkarten.js";
import { ladeLokal, speichereLokal, loescheLokal, dateiSpeichern } from "./karteneditor.js";

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

let dialog, inhalt, haken;
let tab = "lokal";
let hinweis = "", hinweisArt = "", laden = false;
let daten = [];
let seite = 0, mehr = false;

function setzeHinweis(text, art = "fehler") {
  hinweis = text;
  hinweisArt = art;
  zeige();
}
const fehler = e => (e.message === "netz" ? L("Der Server ist gerade nicht erreichbar.", "The server is not reachable right now.") : Konto.fehlerText(e.message));

let ladeLauf = 0;
async function ladeListe(neu = true) {
  const lauf = ++ladeLauf;
  if (neu) { seite = 0; daten = []; }
  if (tab === "lokal") { daten = []; mehr = false; zeige(); return; }
  laden = true;
  zeige();
  try {
    if (tab === "neu" || tab === "top") {
      const d = await Konto.anfrage("GET", `/maps?sort=${tab === "top" ? "top" : "new"}&page=${seite}`);
      if (lauf !== ladeLauf) return;
      daten = daten.concat(d.maps);
      mehr = d.mehr;
    } else if (tab === "meine") {
      const d = await Konto.anfrage("GET", "/maps/mine");
      if (lauf !== ladeLauf) return;
      daten = d.maps;
      mehr = false;
    }
    hinweis = "";
  } catch (e) {
    if (lauf !== ladeLauf) return;
    daten = [];
    hinweis = fehler(e);
    hinweisArt = "fehler";
  }
  laden = false;
  zeige();
}

// karte vom server holen: in die lokale ablage legen und anwählen
async function ladeKarte(m, spielen) {
  try {
    const d = await Konto.anfrage("POST", `/maps/${m.id}/download`);
    const id = speichereLokal(JSON.parse(d.data));
    if (!id) return setzeHinweis(L("Die lokale Ablage ist voll (10 Karten). Lösche unter „Auf diesem Gerät“ eine Karte.", "Local storage is full (10 maps). Delete a map under “On this device”."));
    if (spielen) {
      if (haken.waehle(JSON.parse(d.data), id, d.title || m.title)) dialog.close();
    } else {
      setzeHinweis(L("Gespeichert unter „Auf diesem Gerät“.", "Saved under “On this device”."), "ok");
    }
  } catch (e) { setzeHinweis(fehler(e)); }
}

async function alsDatei(m) {
  try {
    const d = await Konto.anfrage("POST", `/maps/${m.id}/download`);
    dateiSpeichern(JSON.parse(d.data));
  } catch (e) { setzeHinweis(fehler(e)); }
}

function zeile(m) {
  const meta = [`${m.basen} ${L("Basen", "bases")}`, `${m.objekte} ${L("Objekte", "objects")}`, `${m.downloads} Downloads`, datum(m.created)];
  const knoepfe = [
    el("button", { type: "button", class: "primaer", textContent: L("Spielen", "Play"), onclick: () => ladeKarte(m, true) }),
    el("button", { type: "button", textContent: L("Speichern", "Save"), onclick: () => ladeKarte(m, false) }),
    el("button", { type: "button", textContent: "⭳", title: L("Als Datei speichern", "Save as file"), ariaLabel: L("Als Datei speichern", "Save as file"), onclick: () => alsDatei(m) })
  ];
  if (tab !== "meine" && Konto.angemeldet() && m.uploader.toLowerCase() !== String(Konto.benutzer()).toLowerCase()) {
    knoepfe.push(el("button", { type: "button", textContent: L("Melden", "Report"), title: L("Melden", "Report"), ariaLabel: L("Melden", "Report"), onclick: () => oeffneMelden({ kind: "map", name: m.uploader, ref: m.id }) }));
  }
  if (tab === "meine" || Konto.istAdmin()) {
    knoepfe.push(el("button", { type: "button", textContent: "✕", ariaLabel: L("Löschen", "Delete"), onclick: async () => {
      if (!confirm(L(`„${m.title}“ löschen?`, `Delete "${m.title}"?`))) return;
      try { await Konto.anfrage("DELETE", `/maps/${m.id}`); await ladeListe(true); } catch (e) { setzeHinweis(fehler(e)); }
    } }));
  }
  return el("li", { class: "modell" },
    el("div", { class: "modellBild leer", textContent: "–" }),
    el("div", { class: "modellText" },
      el("b", { textContent: m.title }),
      el("small", {}, `${L("von", "by")} `, el("a", { href: `profil.html?u=${encodeURIComponent(m.uploader)}`, target: "_blank", rel: "noopener", textContent: m.uploader })),
      m.descr ? el("small", { class: "beschr", textContent: m.descr }) : "",
      el("small", { textContent: meta.join(" · ") })),
    el("div", { class: "modellKnoepfe" }, ...knoepfe));
}

// hochladen: titel und beschreibung abfragen, dann zum server
async function hochladen(eintrag) {
  if (!Konto.angemeldet()) return setzeHinweis(L("Zum Hochladen brauchst du ein (kostenloses) Konto.", "You need a (free) account to upload."));
  const titel = prompt(L("Titel der Karte (mindestens 3 Zeichen):", "Map title (at least 3 characters):"), eintrag.dok.name);
  if (!titel) return;
  const beschr = prompt(L("Beschreibung (optional):", "Description (optional):"), "") || "";
  if (!confirm(L("Mit dem Hochladen wird dein Benutzername öffentlich bei der Karte angezeigt, und jeder darf sie laden, spielen und verändern. Fortfahren?", "By uploading, your username is shown publicly with the map and anyone may load, play and modify it. Continue?"))) return;
  try {
    await Konto.anfrage("POST", "/maps", { title: titel, descr: beschr, data: JSON.stringify(eintrag.dok) });
    setzeHinweis(L("Hochgeladen. Die Karte ist jetzt für alle sichtbar.", "Uploaded. The map is now visible to everyone."), "ok");
  } catch (e) { setzeHinweis(fehler(e)); }
}

const dateiFeld = el("input", { type: "file", accept: ".json,application/json", hidden: true });
dateiFeld.addEventListener("change", async () => {
  const f = dateiFeld.files[0];
  dateiFeld.value = "";
  if (!f) return;
  const k = FK.bereinigeKarte(await f.text().catch(() => ""));
  if (!k) return setzeHinweis(L("Die Datei ist keine gültige Karte.", "That file is not a valid map."));
  if (!speichereLokal(k)) return setzeHinweis(L("Die lokale Ablage ist voll (10 Karten).", "Local storage is full (10 maps)."));
  setzeHinweis(L("Karte importiert.", "Map imported."), "ok");
});

function lokalZeile(e) {
  const k = e.dok;
  const knoepfe = [
    el("button", { type: "button", class: "primaer", textContent: L("Spielen", "Play"), onclick: () => { if (haken.waehle(k, e.id, k.name)) dialog.close(); } }),
    el("button", { type: "button", textContent: L("Bearbeiten", "Edit"), onclick: () => { dialog.close(); haken.bearbeite(k, { art: "lokal", id: e.id }); } }),
    el("button", { type: "button", textContent: "⭱", title: L("Hochladen und teilen", "Upload and share"), ariaLabel: L("Hochladen und teilen", "Upload and share"), onclick: () => hochladen(e) }),
    el("button", { type: "button", textContent: "⭳", title: L("Als Datei speichern", "Save as file"), ariaLabel: L("Als Datei speichern", "Save as file"), onclick: () => dateiSpeichern(k) }),
    el("button", { type: "button", textContent: "✕", ariaLabel: L("Löschen", "Delete"), onclick: () => {
      if (!confirm(L(`„${k.name}“ löschen?`, `Delete "${k.name}"?`))) return;
      loescheLokal(e.id);
      zeige();
    } })
  ];
  return el("li", { class: "modell" },
    el("div", { class: "modellBild leer", textContent: "–" }),
    el("div", { class: "modellText" },
      el("b", { textContent: k.name }),
      el("small", { textContent: `${k.basen.length} ${L("Basen", "bases")} · ${k.gebaeude.length + k.felsen.length + k.baeume.length + (k.deko?.length || 0)} ${L("Objekte", "objects")} · ${datum(e.t)}` })),
    el("div", { class: "modellKnoepfe" }, ...knoepfe));
}

function zeige() {
  if (!inhalt) return;
  inhalt.replaceChildren(el("button", { type: "button", class: "kontoZu", textContent: "✕", ariaLabel: L("Schließen", "Close"), onclick: () => dialog.close() }));
  const tabs = [["lokal", L("Auf diesem Gerät", "On this device")], ["neu", L("Neu", "New")], ["top", L("Beliebt", "Popular")]];
  if (Konto.angemeldet()) tabs.push(["meine", L("Meine hochgeladenen", "My uploads")]);
  inhalt.append(
    el("h2", {}, L("Karten", "Maps")),
    el("div", { class: "modellTabs" }, ...tabs.map(([id, text]) =>
      el("button", { type: "button", class: id === tab ? "an" : "", textContent: text, onclick: () => { tab = id; hinweis = ""; ladeListe(true); } }))),
    hinweis ? el("p", { class: "kontoMeldung " + hinweisArt, textContent: hinweis }) : ""
  );
  const liste = el("ul", { class: "modellListe" });
  if (tab === "lokal") {
    inhalt.append(el("div", { class: "modellTabs" },
      el("button", { type: "button", class: "primaer", textContent: L("Neue Karte im Editor", "New map in the editor"), onclick: () => { dialog.close(); haken.bearbeite(null, { art: "neu" }); } }),
      el("button", { type: "button", textContent: L("Datei importieren", "Import file"), onclick: () => dateiFeld.click() }),
      dateiFeld));
    const lokal = ladeLokal();
    if (!lokal.length) liste.append(el("li", { class: "leer", textContent: L("Noch keine eigenen Karten. Baue eine im Editor oder lade eine von anderen.", "No maps of your own yet. Build one in the editor or load one from others.") }));
    for (const e of lokal) liste.append(lokalZeile(e));
    inhalt.append(liste);
    return;
  }
  if (laden && !daten.length) {
    inhalt.append(el("p", { class: "kontoInfo", textContent: L("Lade …", "Loading …") }));
    return;
  }
  if (!daten.length && !hinweis) liste.append(el("li", { class: "leer", textContent: L("Noch keine Karten.", "No maps yet.") }));
  for (const m of daten) liste.append(zeile(m));
  inhalt.append(liste);
  if (mehr) inhalt.append(el("button", { type: "button", textContent: L("Mehr laden", "Load more"), onclick: () => { seite++; ladeListe(false); } }));
}

export function oeffneKarten() {
  hinweis = "";
  zeige();
  dialog.showModal();
  ladeListe(true);
}

// haken: waehle(dok, id, name) -> bool, bearbeite(dok | null, herkunft)
export function startKarten(h) {
  haken = h;
  inhalt = el("div", { class: "kontoInhalt" });
  dialog = el("dialog", { id: "kartenDialog" }, inhalt);
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
}
