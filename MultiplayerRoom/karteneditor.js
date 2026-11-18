// karteneditor: bearbeitet kartendokumente (format v2 aus fightkarten.js) direkt im spiel.
// eigene szene und kamera, eigene bedienoberfläche. das spiel pausiert, solange der editor offen ist.
import * as THREE from "three";
import * as FK from "./fightkarten.js";
import { baueGelaende, HAUS_FARBEN } from "./gelaende.js";
import { DEKO, baueDeko } from "./deko.js";

const L = (de, en) => (window.WG ? WG.L(de, en) : de);
const G = FK.KARTEN_GRENZEN;
const LAGER = "bastelkarre-karten";

// ---- lokale kartenablage im browser (zehn plätze) ----
export function ladeLokal() {
  try {
    const liste = JSON.parse(localStorage.getItem(LAGER) || "[]");
    return Array.isArray(liste) ? liste.filter(e => e && typeof e.id === "string" && FK.bereinigeKarte(e.dok)) : [];
  } catch { return []; }
}
function schreibeLokal(liste) {
  try { localStorage.setItem(LAGER, JSON.stringify(liste)); return true; } catch { return false; }
}
// speichert eine karte (neue id, wenn keine übergeben wird). gibt die id zurück, oder null bei vollem speicher
export function speichereLokal(dok, id = null) {
  const k = FK.bereinigeKarte(dok);
  if (!k) return null;
  const liste = ladeLokal();
  const i = liste.findIndex(e => e.id === id);
  if (i < 0) {
    if (liste.length >= 10) return null;
    id = "k" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    liste.push({ id, dok: k, t: Date.now() });
  } else {
    liste[i] = { id, dok: k, t: Date.now() };
  }
  return schreibeLokal(liste) ? id : null;
}
export function loescheLokal(id) {
  schreibeLokal(ladeLokal().filter(e => e.id !== id));
}
export function dateiSpeichern(dok) {
  const k = FK.bereinigeKarte(dok);
  if (!k) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(k)], { type: "application/json" }));
  a.download = (k.name.replace(/[^\w\-äöüÄÖÜß ]+/g, "").trim() || "karte") + ".bkkarte.json";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const PALETTEN = {
  standard: null,
  gras: { gras: "#5f9f50", wald: "#3f7d44", trocken: "#a6a86a", fels: "#8d8a84", schnee: "#eef2f7" },
  wueste: { gras: "#d2b06a", wald: "#b8924f", trocken: "#e0c07f", fels: "#9a7b57", schnee: "#f0e6cc" },
  fels: { gras: "#7d8a6a", wald: "#5f6e52", trocken: "#8f8b73", fels: "#85827c", schnee: "#eef2f7" },
  schnee: { gras: "#cfd8e0", wald: "#aab7c2", trocken: "#dde4ea", fels: "#8d949b", schnee: "#ffffff" },
  vulkan: { gras: "#4a4440", wald: "#3a3330", trocken: "#5a504a", fels: "#2e2a28", schnee: "#6b5f58" }
};

const WERKZEUGE = [
  ["waehlen", "", "Auswählen", "Select"],
  ["haus", "", "Haus", "House"],
  ["bunker", "", "Bunker", "Bunker"],
  ["mauer", "", "Mauer", "Wall"],
  ["fels", "", "Fels", "Rock"],
  ["baum", "", "Baum", "Tree"],
  ["deko", "", "Objekt", "Object"],
  ["basis", "", "Basis", "Base"],
  ["spawn", "", "Startpunkt", "Spawn"],
  ["heben", "", "Gelände heben", "Raise terrain"],
  ["senken", "", "Gelände senken", "Lower terrain"],
  ["ebnen", "", "Gelände ebnen", "Flatten terrain"],
  ["loeschen", "", "Löschen", "Delete"]
];
const BRUSH = new Set(["heben", "senken", "ebnen"]);
const LISTEN = { haus: "gebaeude", bunker: "gebaeude", mauer: "gebaeude", fels: "felsen", baum: "baeume", deko: "deko", basis: "basen", spawn: "spawns" };

const css = `
body.karteneditor #game > :not(#scene) { display: none !important; }
body.karteneditor { overflow: hidden; }
#ke { position: fixed; inset: 0; z-index: 50; font: 13px/1.35 system-ui, sans-serif; color: #e8eaed; user-select: none; touch-action: none; }
#ke[hidden] { display: none; }
#ke .flaeche { position: absolute; inset: 0; cursor: crosshair; }
#ke .leiste, #ke .seite { position: absolute; background: #1f2328ee; border: 1px solid #ffffff22; border-radius: 10px; padding: 8px; backdrop-filter: blur(4px); }
#ke .leiste { top: 10px; left: 10px; right: 10px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
#ke .links { top: 62px; left: 10px; width: 150px; display: grid; gap: 4px; max-height: calc(100vh - 150px); overflow: auto; }
#ke .rechts { top: 62px; right: 10px; width: 250px; display: grid; gap: 8px; max-height: calc(100vh - 150px); overflow: auto; }
#ke button { font: inherit; color: inherit; background: #ffffff14; border: 1px solid #ffffff26; border-radius: 7px; padding: 5px 9px; cursor: pointer; text-align: left; }
#ke button:hover { background: #ffffff26; }
#ke button.an { background: #ffb547; color: #1b1b1b; border-color: #ffb547; }
#ke button.primaer { background: #e10600; border-color: #e10600; }
#ke input[type=text], #ke input[type=number], #ke select { font: inherit; color: inherit; background: #00000055; border: 1px solid #ffffff30; border-radius: 6px; padding: 4px 7px; }
#ke input[type=text] { min-width: 180px; }
#ke label { display: grid; gap: 2px; }
#ke label b { font-weight: 600; opacity: 0.8; font-size: 12px; }
#ke input[type=range] { width: 100%; }
#ke h3 { margin: 4px 0 0; font-size: 12px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.06em; }
#ke .farben { display: flex; gap: 4px; flex-wrap: wrap; }
#ke .farben i { width: 22px; height: 22px; border-radius: 5px; border: 2px solid transparent; cursor: pointer; }
#ke .farben i.an { border-color: #fff; }
#ke .dekoWahl { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
#ke .dekoWahl button { padding: 4px 6px; font-size: 12px; }
#ke .dekoWahl button.an { outline: 2px solid #ffd24a; }
#ke .status { position: absolute; left: 10px; bottom: 10px; background: #1f2328ee; border-radius: 8px; padding: 6px 10px; max-width: calc(100vw - 20px); }
#ke .status.fehler { background: #7a1a16ee; }
#ke .hilfe { opacity: 0.7; font-size: 12px; }
#ke .zeile2 { display: flex; gap: 4px; flex-wrap: wrap; }
@media (max-width: 760px) { #ke .rechts { top: auto; bottom: 46px; max-height: 40vh; } #ke .links { width: 118px; } }
`;

// ---- hilfsfunktionen ----
const el = (tag, props = {}, ...kinder) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e[k] = v;
  }
  for (const c of kinder) e.append(c);
  return e;
};
const klammer = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function erzeugeKartenEditor({ renderer, schnittstelle }) {
  const stil = document.createElement("style");
  stil.textContent = css;
  document.head.append(stil);

  const szene = new THREE.Scene();
  szene.background = new THREE.Color("#a9cde6");
  szene.fog = new THREE.Fog("#a9cde6", 900, 3200);
  const kamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 6000);
  szene.add(new THREE.HemisphereLight("#ffffff", "#6b7a5a", 1.0));
  const sonne = new THREE.DirectionalLight("#fff4de", 2.2);
  sonne.position.set(300, 600, 200);
  szene.add(sonne);

  const geländeGruppe = new THREE.Group();
  const objGruppe = new THREE.Group();
  const markerGruppe = new THREE.Group();
  szene.add(geländeGruppe, objGruppe, markerGruppe);
  const pinsel = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), new THREE.MeshBasicMaterial({ color: "#ffd24a", side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false }));
  pinsel.rotation.x = -Math.PI / 2;
  pinsel.renderOrder = 10;
  pinsel.visible = false;
  szene.add(pinsel);

  // ---- zustand ----
  let offen = false;
  let dok = null;
  let quelle = { art: "neu" };
  let hoehe = () => 0;
  let werkzeug = "waehlen";
  // art des nächsten dekoobjekts (index in DEKO)
  let dekoTyp = 0;
  let auswahl = null; // { liste, i }
  let undoStapel = [];
  let geaendert = false;
  let farbe = 0;
  let pinselRadius = 25, pinselStaerke = 8;
  const cam = { x: 0, z: 0, y: 380, yaw: 0, pitch: -0.9 };
  const tasten = new Set();
  let ziehen = null; // { art: "kamera"|"objekt"|"pinsel", ... }
  let maus = { x: 0, y: 0 };
  let cursor = null; // geländepunkt unter dem zeiger

  // ---- oberfläche ----
  const wurzel = el("div", { id: "ke", hidden: true });
  const flaeche = el("div", { class: "flaeche" });
  const nameFeld = el("input", { type: "text", maxLength: 40, placeholder: L("Kartenname", "Map name"), onchange: () => { sichere(); dok.name = nameFeld.value.trim() || "Karte"; } });
  const leiste = el("div", { class: "leiste" });
  const links = el("div", { class: "seite links" });
  const rechts = el("div", { class: "seite rechts" });
  const status = el("div", { class: "status" });
  wurzel.append(flaeche, leiste, links, rechts, status);
  document.body.append(wurzel);

  const werkzeugKnoepfe = new Map();
  for (const [id, ico, de, en] of WERKZEUGE) {
    const b = el("button", { type: "button", onclick: () => waehleWerkzeug(id) }, L(de, en));
    werkzeugKnoepfe.set(id, b);
    links.append(b);
  }
  links.append(el("div", { class: "hilfe" }, L("WASD: bewegen · Q/E: hoch/runter · rechte Maustaste: drehen · Rad: zoomen · Entf: löschen · R: drehen · Strg+Z: zurück", "WASD move · Q/E up/down · right mouse look · wheel zoom · Del delete · R rotate · Ctrl+Z undo")));

  const dateiEingabe = el("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: async () => {
    const f = dateiEingabe.files[0];
    dateiEingabe.value = "";
    if (!f) return;
    const k = FK.bereinigeKarte(await f.text().catch(() => ""));
    if (!k) return meldung(L("Die Datei ist keine gültige Karte.", "That file is not a valid map."), true);
    sichere();
    dok = k;
    quelle = { art: "neu" };
    alleNeu();
    meldung(L("Karte geladen.", "Map loaded."));
  } });
  const knoepfe = [
    ["← " + L("Zurück", "Back"), () => schliesse(), ""],
    [L("Neu", "New"), () => { if (!bestaetige()) return; neu(); }, ""],
    [L("Rückgängig", "Undo"), () => zurueck(), ""],
    [L("Lokal speichern", "Save locally"), () => speichere(), ""],
    [L("Export", "Export"), () => { if (pruefe(true)) dateiSpeichern(dok); }, ""],
    [L("Import", "Import"), () => dateiEingabe.click(), ""],
    [L("Testfahrt", "Test drive"), () => testfahrt(), "primaer"]
  ];
  const adminKnopf = el("button", { type: "button", hidden: true, onclick: () => offiziellSpeichern() }, L("Offiziell speichern", "Save as official"));
  leiste.append(...knoepfe.map(([t, f, k]) => el("button", { type: "button", class: k, onclick: f }, t)), adminKnopf, nameFeld, dateiEingabe);

  // ---- zustandsänderungen ----
  function sichere() {
    undoStapel.push(JSON.stringify(dok));
    if (undoStapel.length > 60) undoStapel.shift();
    geaendert = true;
  }
  function zurueck() {
    const s = undoStapel.pop();
    if (!s) return;
    dok = JSON.parse(s);
    auswahl = null;
    alleNeu();
  }
  function bestaetige() {
    return !geaendert || confirm(L("Ungespeicherte Änderungen verwerfen?", "Discard unsaved changes?"));
  }
  function neu() {
    dok = FK.neueKarte();
    quelle = { art: "neu" };
    undoStapel = [];
    geaendert = false;
    auswahl = null;
    alleNeu();
  }
  function meldung(text, fehler = false) {
    status.textContent = text;
    status.classList.toggle("fehler", fehler);
  }
  function zaehlerText() {
    return `${dok.basen.length}/${G.basen[1]} ${L("Basen", "bases")} · ${dok.spawns.length}/${G.spawns[1]} ${L("Startpunkte", "spawns")} · ${dok.gebaeude.length} ${L("Gebäude", "buildings")} · ${dok.felsen.length} ${L("Felsen", "rocks")} · ${dok.baeume.length} ${L("Bäume", "trees")} · ${dok.deko.length} ${L("Objekte", "objects")} · ${dok.hoehen.length}/${G.hoehen} ${L("Pinselzüge", "brush strokes")}`;
  }
  function pruefe(laut = false) {
    const k = FK.bereinigeKarte(dok);
    if (!k) {
      if (laut) meldung(L(`Eine Karte braucht mindestens ${G.basen[0]} Basis und ${G.spawns[0]} Startpunkte.`, `A map needs at least ${G.basen[0]} base and ${G.spawns[0]} spawn points.`), true);
      return null;
    }
    return k;
  }
  function speichere() {
    const k = pruefe(true);
    if (!k) return;
    const id = speichereLokal(k, quelle.art === "lokal" ? quelle.id : null);
    if (!id) return meldung(L("Der Browser-Speicher ist voll (maximal 10 Karten). Lösche im Hangar eine alte Karte.", "Browser storage is full (10 maps max). Delete an old map in the map hangar."), true);
    quelle = { art: "lokal", id };
    geaendert = false;
    meldung(L("Gespeichert. Du findest die Karte im Kartenfenster unter „Meine“.", "Saved. Find it in the map window under “Mine”."));
  }
  function testfahrt() {
    const k = pruefe(true);
    if (!k) return;
    schnittstelle.test(k);
  }
  async function offiziellSpeichern() {
    const k = pruefe(true);
    if (!k) return;
    const wahl = prompt(L("Welche offizielle Karte überschreiben? (duenen, felsental, huegelland)", "Which official map to overwrite? (duenen, felsental, huegelland)"), quelle.art === "offiziell" ? quelle.slot : "duenen");
    if (!wahl) return;
    try {
      await schnittstelle.offiziellSpeichern(wahl.trim(), k);
      geaendert = false;
      meldung(L("Offizielle Karte gespeichert. Alle Spieler laden sie beim nächsten Start.", "Official map saved. All players load it on next start."));
    } catch (e) {
      meldung(String(e?.message || e), true);
    }
  }

  // ---- rechte seite: kartenparameter und auswahl ----
  function schieber(text, wert, lo, hi, schritt, bei, ende) {
    const ausgabe = el("b", {}, `${text}: ${wert}`);
    const feld = el("input", { type: "range", min: lo, max: hi, step: schritt, value: wert });
    feld.addEventListener("input", () => { ausgabe.textContent = `${text}: ${feld.value}`; bei(Number(feld.value)); });
    feld.addEventListener("change", () => ende?.(Number(feld.value)));
    return el("label", {}, ausgabe, feld);
  }
  // knöpfe für alle dekoarten (zweisprachig)
  function dekoWahl(aktiv, wahl) {
    return el("div", { class: "dekoWahl" }, ...DEKO.map((d, i) => el("button", { type: "button", class: i === aktiv ? "an" : "", onclick: () => wahl(i) }, L(d.de, d.en))));
  }
  function baueRechts() {
    rechts.replaceChildren();
    rechts.append(el("h3", {}, L("Gelände", "Terrain")));
    const form = el("select", { onchange: () => { sichere(); dok.form = form.value; baueGelaendeNeu(); } },
      ...FK.FORMEN.map(f => el("option", { value: f, selected: f === dok.form }, { duenen: L("Dünen", "Dunes"), terrassen: L("Terrassen", "Terraces"), huegel: L("Hügel", "Hills"), flach: L("Flach", "Flat") }[f])));
    const seed = el("input", { type: "number", min: 1, max: 99999, value: dok.seed, onchange: () => { sichere(); dok.seed = klammer(Math.floor(Number(seed.value) || 1), 1, 99999); baueGelaendeNeu(); } });
    rechts.append(
      el("label", {}, el("b", {}, L("Form", "Shape")), form),
      el("label", {}, el("b", {}, L("Startwert (Zufall)", "Seed")), el("div", { class: "zeile2" }, seed, el("button", { type: "button", onclick: () => { sichere(); dok.seed = 1 + Math.floor(Math.random() * 99998); seed.value = dok.seed; baueGelaendeNeu(); } }, L("Neu", "New")))),
      schieber(L("Höhe", "Height"), dok.amp, G.amp[0], G.amp[1], 1, v => { dok.amp = v; }, () => { sichere(); baueGelaendeNeu(); }),
      el("h3", {}, L("Farben", "Colours")),
      el("div", { class: "zeile2" }, ...Object.keys(PALETTEN).map(p => el("button", { type: "button", onclick: () => { sichere(); dok.palette = PALETTEN[p] ? { ...PALETTEN[p] } : null; baueGelaendeNeu(); baueRechts(); } }, { standard: L("Standard", "Default"), gras: L("Gras", "Grass"), wueste: L("Wüste", "Desert"), fels: L("Fels", "Rock"), schnee: L("Schnee", "Snow"), vulkan: L("Vulkan", "Volcano") }[p]))),
      el("div", { class: "zeile2" }, ...FK.PALETTE_SCHLUESSEL.map(s => el("input", { type: "color", title: s, value: (dok.palette || PALETTEN.gras)[s], onchange: e => { sichere(); dok.palette = { ...(dok.palette || PALETTEN.gras), [s]: e.target.value }; baueGelaendeNeu(); } })))
    );
    if (werkzeug === "deko" && !auswahl) {
      rechts.append(el("h3", {}, L("Objekt", "Object")), dekoWahl(dekoTyp, t => { dekoTyp = t; baueRechts(); }));
    }
    if (BRUSH.has(werkzeug)) {
      rechts.append(el("h3", {}, L("Pinsel", "Brush")),
        schieber(L("Radius", "Radius"), pinselRadius, G.radius[0], G.radius[1], 1, v => { pinselRadius = v; }),
        schieber(L("Stärke (m)", "Strength (m)"), pinselStaerke, 1, 40, 1, v => { pinselStaerke = v; }),
        el("button", { type: "button", onclick: () => { sichere(); dok.hoehen = []; baueGelaendeNeu(); } }, L("Alle Pinselzüge löschen", "Clear all brush strokes")));
    }
    if (auswahl) {
      const e = dok[auswahl.liste][auswahl.i];
      const typ = auswahl.liste;
      rechts.append(el("h3", {}, { gebaeude: L("Gebäude", "Building"), felsen: L("Fels", "Rock"), baeume: L("Baum", "Tree"), deko: L("Objekt", "Object"), basen: L("Basis", "Base"), spawns: L("Startpunkt", "Spawn") }[typ]));
      const aend = (idx, wert) => { e[idx] = wert; baueObjekte(); };
      const sch = (text, idx, lo, hi, st) => schieber(text, e[idx], lo, hi, st, v => aend(idx, v), () => { geaendert = true; });
      // vor jeder schieber-änderung einmal sichern
      const vorbereitet = () => sichere();
      if (typ === "gebaeude") {
        rechts.append(sch(L("Breite", "Width"), 2, 1, 40, 0.5), sch(L("Tiefe", "Depth"), 3, 1, 40, 0.5), sch(L("Höhe", "Height"), 4, 0.5, 30, 0.5), sch(L("Drehung", "Rotation"), 5, -3.14, 3.14, 0.05),
          el("div", { class: "farben" }, ...HAUS_FARBEN.map((c, i) => el("i", { class: i === e[6] ? "an" : "", style: `background:${c}`, onclick: () => { sichere(); e[6] = i; baueObjekte(); baueRechts(); } }))));
      } else if (typ === "felsen") {
        rechts.append(sch(L("Größe", "Size"), 2, 0.5, 15, 0.5));
      } else if (typ === "baeume") {
        rechts.append(sch(L("Größe", "Size"), 2, 1, 20, 0.5));
      } else if (typ === "deko") {
        rechts.append(dekoWahl(e[2], t => { sichere(); e[2] = t; dekoTyp = t; baueObjekte(); baueRechts(); }),
          sch(L("Größe", "Size"), 3, 0.5, 4, 0.1), sch(L("Drehung", "Rotation"), 4, -3.14, 3.14, 0.05));
      }
      rechts.append(el("button", { type: "button", onclick: () => loescheAuswahl() }, L("Löschen (Entf)", "Delete (Del)")));
      // das rückgängig-sichern passiert beim ersten ziehen eines schiebers
      for (const inp of rechts.querySelectorAll("input[type=range]")) inp.addEventListener("pointerdown", vorbereitet);
    }
  }

  // ---- anzeige ----
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  let terrainDaten = null;
  function baueGelaendeNeu() {
    // gelände ohne objekte, die objekte zeichnet der editor selbst (zum anklicken)
    const f = FK.erzeugeKarte({ ...dok, gebaeude: [], felsen: [], baeume: [], deko: [] }, [0, 0]);
    if (!f) return;
    hoehe = f.hoehe;
    terrainDaten = f.daten;
    for (const k of [...geländeGruppe.children]) {
      geländeGruppe.remove(k);
      k.geometry?.dispose();
      for (const m of [].concat(k.material || [])) { m.map?.dispose(); m.dispose(); }
    }
    baueGelaende({ d: f.daten, RAPIER: null, world: null, scene: geländeGruppe, box: () => {} });
    baueObjekte();
    status.textContent = zaehlerText();
  }

  const geoBox = new THREE.BoxGeometry(1, 1, 1);
  const geoFels = new THREE.DodecahedronGeometry(1, 0);
  const geoKrone = new THREE.ConeGeometry(1, 2.4, 7);
  const geoStamm = new THREE.CylinderGeometry(0.15, 0.2, 1, 6);
  const geoPfahl = new THREE.CylinderGeometry(1.2, 1.2, 70, 10);
  const geoRing = new THREE.RingGeometry(FK.BASIS_RADIUS - 0.8, FK.BASIS_RADIUS, 48);
  const geoPfeil = new THREE.ConeGeometry(2.4, 7, 4);

  function leereGruppe(g) {
    for (const k of [...g.children]) {
      g.remove(k);
      if (k.isInstancedMesh) k.dispose();
      else if (k.material && !k.userData.geteilt) k.material.dispose?.();
    }
  }
  function baueObjekte() {
    leereGruppe(objGruppe);
    leereGruppe(markerGruppe);
    dok.gebaeude.forEach(([x, z, b, t, h, rot, c], i) => {
      const m = new THREE.Mesh(geoBox, mat(HAUS_FARBEN[c] || "#cccccc"));
      m.scale.set(b, h + 0.3, t);
      m.position.set(x, hoehe(x, z) + h / 2 - 0.15, z);
      m.rotation.y = -rot;
      m.userData = { liste: "gebaeude", i };
      objGruppe.add(m);
    });
    const fels = new THREE.InstancedMesh(geoFels, new THREE.MeshStandardMaterial({ color: "#8a8780", roughness: 1, flatShading: true }), Math.max(1, dok.felsen.length));
    fels.count = dok.felsen.length;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    dok.felsen.forEach(([x, z, s], i) => {
      e.set(i * 1.7, i * 2.3, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, hoehe(x, z) + s * 0.25, z), q, new THREE.Vector3(s, s * 0.65, s * 0.9));
      fels.setMatrixAt(i, m4);
    });
    fels.userData = { liste: "felsen", instanziert: true };
    fels.frustumCulled = false;
    objGruppe.add(fels);
    const kronen = new THREE.InstancedMesh(geoKrone, new THREE.MeshStandardMaterial({ color: "#2f8f4e", roughness: 1 }), Math.max(1, dok.baeume.length));
    const staemme = new THREE.InstancedMesh(geoStamm, new THREE.MeshStandardMaterial({ color: "#6b4a2d", roughness: 1 }), Math.max(1, dok.baeume.length));
    kronen.count = staemme.count = dok.baeume.length;
    const qn = new THREE.Quaternion();
    dok.baeume.forEach(([x, z, s], i) => {
      const y = hoehe(x, z);
      m4.compose(new THREE.Vector3(x, y + s * 0.5, z), qn, new THREE.Vector3(s * 0.45, s * 0.5, s * 0.45));
      staemme.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(x, y + s * 1.05, z), qn, new THREE.Vector3(s * 0.7, s * 0.7, s * 0.7));
      kronen.setMatrixAt(i, m4);
    });
    kronen.userData = { liste: "baeume", instanziert: true };
    kronen.frustumCulled = staemme.frustumCulled = false;
    objGruppe.add(kronen, staemme);
    dok.deko.forEach(([x, z, typ, s, rot], i) => {
      const g = baueDeko(typ, s);
      g.position.set(x, hoehe(x, z) - 0.05, z);
      g.rotation.y = -rot;
      // die materialien teilen sich alle dekoobjekte: nicht beim abbau entsorgen
      g.traverse(k => { k.userData = { liste: "deko", i, geteilt: true }; });
      objGruppe.add(g);
    });
    // basen und startpunkte als marken
    dok.basen.forEach(([x, z], i) => {
      const g = new THREE.Group();
      g.position.set(x, hoehe(x, z), z);
      const ring = new THREE.Mesh(geoRing, new THREE.MeshBasicMaterial({ color: "#3b8cff", transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.6;
      const pfahl = new THREE.Mesh(geoPfahl, new THREE.MeshBasicMaterial({ color: "#3b8cff", transparent: true, opacity: 0.3, depthWrite: false }));
      pfahl.position.y = 35;
      g.add(ring, pfahl);
      g.userData = { liste: "basen", i };
      g.traverse(k => { k.userData.liste = "basen"; k.userData.i = i; });
      markerGruppe.add(g);
    });
    dok.spawns.forEach(([x, z], i) => {
      const m = new THREE.Mesh(geoPfeil, new THREE.MeshBasicMaterial({ color: "#ffd24a" }));
      m.position.set(x, hoehe(x, z) + 4, z);
      // die spitze zeigt zur kartenmitte, dorthin schaut das fahrzeug beim start
      m.rotation.set(Math.PI / 2, 0, 0);
      m.rotation.order = "YXZ";
      m.rotation.y = Math.atan2(-x, -z) + Math.PI;
      m.userData = { liste: "spawns", i };
      markerGruppe.add(m);
    });
    zeigeAuswahl();
    status.textContent = zaehlerText();
  }

  const markierung = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: "#ffd24a", wireframe: true, depthTest: false }));
  markierung.renderOrder = 11;
  markierung.visible = false;
  szene.add(markierung);
  function zeigeAuswahl() {
    if (!auswahl || !dok[auswahl.liste]?.[auswahl.i]) { auswahl = null; markierung.visible = false; return; }
    const e = dok[auswahl.liste][auswahl.i];
    const [x, z] = e;
    let r = 6;
    if (auswahl.liste === "gebaeude") r = Math.hypot(e[2], e[3]) / 2 + 1;
    else if (auswahl.liste === "felsen" || auswahl.liste === "baeume") r = e[2] * 1.2 + 1;
    else if (auswahl.liste === "deko") r = e[3] * 3 + 1;
    else if (auswahl.liste === "basen") r = FK.BASIS_RADIUS;
    markierung.position.set(x, hoehe(x, z) + 2, z);
    markierung.scale.setScalar(r);
    markierung.visible = true;
  }

  // ---- zeiger und strahlen ----
  const strahl = new THREE.Raycaster();
  function strahlAus(ev) {
    maus.x = (ev.clientX / innerWidth) * 2 - 1;
    maus.y = -(ev.clientY / innerHeight) * 2 + 1;
    kamera.updateMatrixWorld();
    strahl.setFromCamera(maus, kamera);
  }
  // strahl gegen das höhenraster: in schritten marschieren, dann verfeinern
  function geländePunkt() {
    const o = strahl.ray.origin, d = strahl.ray.direction;
    let t = 0, letztes = 0;
    for (; t < 5000; t += Math.max(2, t * 0.01)) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (Math.abs(x) > 600 || Math.abs(z) > 600) { letztes = t; continue; }
      if (y <= hoehe(x, z)) {
        let a = letztes, b = t;
        for (let i = 0; i < 18; i++) {
          const m = (a + b) / 2;
          if (o.y + d.y * m <= hoehe(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m;
        }
        return new THREE.Vector3(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b);
      }
      letztes = t;
    }
    return null;
  }
  function objektUnterZeiger() {
    const treffer = strahl.intersectObjects([...objGruppe.children, ...markerGruppe.children], true);
    for (const h of treffer) {
      const u = h.object.userData;
      if (u.instanziert && h.instanceId != null) return { liste: u.liste, i: h.instanceId };
      if (u.liste && u.i != null) return { liste: u.liste, i: u.i };
    }
    return null;
  }

  // ---- werkzeuge ----
  function waehleWerkzeug(w) {
    werkzeug = w;
    for (const [id, b] of werkzeugKnoepfe) b.classList.toggle("an", id === w);
    pinsel.visible = false;
    baueRechts();
  }
  function setze(punkt) {
    const liste = LISTEN[werkzeug];
    const x = klammer(Math.round(punkt.x * 10) / 10, -G.mitteMax, G.mitteMax), z = klammer(Math.round(punkt.z * 10) / 10, -G.mitteMax, G.mitteMax);
    const grenze = liste === "basen" ? G.basen[1] : liste === "spawns" ? G.spawns[1] : G[liste];
    if (dok[liste].length >= grenze) return meldung(L(`Grenze erreicht (${grenze}).`, `Limit reached (${grenze}).`), true);
    sichere();
    if (werkzeug === "haus") dok.gebaeude.push([x, z, 12, 9, 6, 0, farbe]);
    else if (werkzeug === "bunker") dok.gebaeude.push([x, z, 7, 7, 3, 0, 3]);
    else if (werkzeug === "mauer") dok.gebaeude.push([x, z, 12, 1.8, 2.6, 0, 3]);
    else if (werkzeug === "fels") dok.felsen.push([x, z, 3 + Math.random() * 3]);
    else if (werkzeug === "baum") dok.baeume.push([x, z, 5 + Math.random() * 3]);
    else if (werkzeug === "deko") dok.deko.push([x, z, dekoTyp, 1, Math.round((Math.random() * 6 - 3) * 100) / 100]);
    else dok[liste].push([x, z]);
    auswahl = { liste, i: dok[liste].length - 1 };
    baueObjekte();
    baueRechts();
  }
  function loescheAuswahl() {
    if (!auswahl) return;
    const { liste, i } = auswahl;
    if ((liste === "basen" && dok.basen.length <= G.basen[0]) || (liste === "spawns" && dok.spawns.length <= G.spawns[0])) {
      return meldung(L("Eine Karte braucht mindestens eine Basis und zwei Startpunkte.", "A map needs at least one base and two spawns."), true);
    }
    sichere();
    dok[liste].splice(i, 1);
    auswahl = null;
    baueObjekte();
    baueRechts();
  }
  let baueTimer = 0;
  function planeGelaende() {
    if (baueTimer) return;
    baueTimer = setTimeout(() => { baueTimer = 0; baueGelaendeNeu(); }, 140);
  }
  function pinselZug(p, ebenHoehe) {
    if (dok.hoehen.length >= G.hoehen) return meldung(L(`Es sind höchstens ${G.hoehen} Pinselzüge möglich.`, `At most ${G.hoehen} brush strokes are possible.`), true);
    const richtung = werkzeug === "senken" ? -1 : 1;
    const x = Math.round(p.x * 10) / 10, z = Math.round(p.z * 10) / 10;
    if (werkzeug === "ebnen") dok.hoehen.push([x, z, pinselRadius, Math.round(ebenHoehe * 10) / 10, 1]);
    else dok.hoehen.push([x, z, pinselRadius, richtung * pinselStaerke, 0]);
    planeGelaende();
  }

  flaeche.addEventListener("contextmenu", e => e.preventDefault());
  flaeche.addEventListener("pointerdown", ev => {
    flaeche.setPointerCapture(ev.pointerId);
    strahlAus(ev);
    if (ev.button === 2 || ev.button === 1) {
      ziehen = { art: "kamera", x: ev.clientX, y: ev.clientY };
      return;
    }
    if (ev.button !== 0) return;
    const p = geländePunkt();
    if (werkzeug === "waehlen") {
      auswahl = objektUnterZeiger();
      zeigeAuswahl();
      baueRechts();
      if (auswahl) {
        sichere();
        ziehen = { art: "objekt" };
      }
    } else if (werkzeug === "loeschen") {
      auswahl = objektUnterZeiger();
      loescheAuswahl();
    } else if (BRUSH.has(werkzeug)) {
      if (!p) return;
      sichere();
      const ebenHoehe = hoehe(p.x, p.z);
      ziehen = { art: "pinsel", letzter: p.clone(), ebenHoehe };
      pinselZug(p, ebenHoehe);
    } else if (p) {
      // auf ein bestehendes objekt klicken wählt es aus, sonst wird ein neues gesetzt
      const vorhanden = objektUnterZeiger();
      if (vorhanden && vorhanden.liste === LISTEN[werkzeug]) { auswahl = vorhanden; zeigeAuswahl(); baueRechts(); ziehen = { art: "objekt" }; sichere(); }
      else setze(p);
    }
  });
  flaeche.addEventListener("pointermove", ev => {
    strahlAus(ev);
    if (ziehen?.art === "kamera") {
      cam.yaw -= (ev.clientX - ziehen.x) * 0.005;
      cam.pitch = klammer(cam.pitch - (ev.clientY - ziehen.y) * 0.005, -1.5, 0.4);
      ziehen.x = ev.clientX; ziehen.y = ev.clientY;
      return;
    }
    cursor = geländePunkt();
    if (ziehen?.art === "objekt" && auswahl && cursor) {
      const e = dok[auswahl.liste][auswahl.i];
      e[0] = klammer(Math.round(cursor.x * 10) / 10, -G.mitteMax, G.mitteMax);
      e[1] = klammer(Math.round(cursor.z * 10) / 10, -G.mitteMax, G.mitteMax);
      baueObjekte();
    } else if (ziehen?.art === "pinsel" && cursor) {
      if (cursor.distanceTo(ziehen.letzter) >= Math.max(3, pinselRadius * 0.4)) {
        ziehen.letzter.copy(cursor);
        pinselZug(cursor, ziehen.ebenHoehe);
      }
    }
  });
  const loslassen = () => { if (ziehen?.art === "pinsel") baueGelaendeNeu(); ziehen = null; };
  flaeche.addEventListener("pointerup", loslassen);
  flaeche.addEventListener("pointercancel", loslassen);
  flaeche.addEventListener("wheel", ev => {
    ev.preventDefault();
    cam.y = klammer(cam.y * (ev.deltaY > 0 ? 1.12 : 0.89), 12, 1800);
  }, { passive: false });

  // tasten: nur solange der editor offen ist und kein textfeld den fokus hat
  const imFeld = t => !!(t && t.closest && t.closest("input, textarea, select"));
  addEventListener("keydown", ev => {
    if (!offen) return;
    if (imFeld(ev.target)) return;
    ev.stopImmediatePropagation();
    const k = ev.key.toLowerCase();
    if (ev.ctrlKey && k === "z") { ev.preventDefault(); zurueck(); return; }
    if (k === "delete" || k === "backspace") { loescheAuswahl(); return; }
    if (k === "r" && auswahl && auswahl.liste === "deko") { sichere(); const e = dok.deko[auswahl.i]; e[4] = Math.round(((e[4] + Math.PI / 12 + Math.PI) % (Math.PI * 2) - Math.PI) * 1000) / 1000; baueObjekte(); return; }
    if (k === "r" && auswahl && auswahl.liste === "gebaeude") { sichere(); const e = dok.gebaeude[auswahl.i]; e[5] = Math.round(((e[5] + Math.PI / 12 + Math.PI) % (Math.PI * 2) - Math.PI) * 1000) / 1000; baueObjekte(); return; }
    if (k === "escape") { auswahl = null; zeigeAuswahl(); baueRechts(); return; }
    tasten.add(k);
  }, true);
  addEventListener("keyup", ev => { tasten.delete(ev.key.toLowerCase()); }, true);
  addEventListener("blur", () => tasten.clear());
  addEventListener("resize", () => {
    kamera.aspect = innerWidth / innerHeight;
    kamera.updateProjectionMatrix();
  });

  // ---- steuerung von außen ----
  function alleNeu() {
    nameFeld.value = dok.name;
    adminKnopf.hidden = !schnittstelle.istAdmin();
    baueGelaendeNeu();
    baueRechts();
    waehleWerkzeug(werkzeug);
  }
  function oeffne(startDok, herkunft = { art: "neu" }) {
    dok = FK.bereinigeKarte(startDok) || FK.neueKarte();
    quelle = herkunft;
    undoStapel = [];
    geaendert = false;
    auswahl = null;
    cam.x = 0; cam.z = 480; cam.y = 480; cam.yaw = 0; cam.pitch = -0.68;
    offen = true;
    wurzel.hidden = false;
    document.body.classList.add("karteneditor");
    kamera.aspect = innerWidth / innerHeight;
    kamera.updateProjectionMatrix();
    alleNeu();
    meldung(zaehlerText());
  }
  function schliesse() {
    if (!bestaetige()) return;
    offen = false;
    wurzel.hidden = true;
    document.body.classList.remove("karteneditor");
    tasten.clear();
    schnittstelle.zu();
  }

  function frame(dt) {
    // kamera: wasd bewegt auf der ebene, q/e hoch und runter, tempo wächst mit der höhe
    const tempo = (40 + cam.y * 1.1) * dt * (tasten.has("shift") ? 2.5 : 1);
    const vx = -Math.sin(cam.yaw), vz = -Math.cos(cam.yaw);
    let fw = 0, sd = 0;
    if (tasten.has("w") || tasten.has("arrowup")) fw += 1;
    if (tasten.has("s") || tasten.has("arrowdown")) fw -= 1;
    if (tasten.has("d") || tasten.has("arrowright")) sd += 1;
    if (tasten.has("a") || tasten.has("arrowleft")) sd -= 1;
    cam.x = klammer(cam.x + (vx * fw + -vz * sd) * tempo, -700, 700);
    cam.z = klammer(cam.z + (vz * fw + vx * sd) * tempo, -700, 700);
    if (tasten.has("e")) cam.y *= 1 + dt * 1.6;
    if (tasten.has("q")) cam.y /= 1 + dt * 1.6;
    cam.y = klammer(cam.y, 12, 1800);
    kamera.position.set(cam.x, Math.max(cam.y, hoehe(cam.x, cam.z) + 6), cam.z);
    kamera.rotation.order = "YXZ";
    kamera.rotation.set(cam.pitch, cam.yaw, 0);
    // pinselring folgt dem zeiger
    pinsel.visible = BRUSH.has(werkzeug) && !!cursor && ziehen?.art !== "kamera";
    if (pinsel.visible) {
      pinsel.position.set(cursor.x, hoehe(cursor.x, cursor.z) + 0.6, cursor.z);
      pinsel.scale.setScalar(pinselRadius);
    }
    renderer.render(szene, kamera);
  }

  return { oeffne, frame, aktiv: () => offen, schliesse: () => { offen = false; wurzel.hidden = true; document.body.classList.remove("karteneditor"); } };
}
