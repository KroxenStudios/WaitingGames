// Bastelkarre: Baulogik ohne Grafik und ohne Physik (läuft auch in Node für Tests).
//
// Ein Bauplan ist eine Liste von Teilen auf einem Raster mit Zellen von 0,5 m.
// Jedes Teil belegt genau eine Zelle und hat eine von 24 Ausrichtungen.
// Lokale Konvention aller Teile: +Y zeigt "nach außen" (Anbauteile sitzen mit
// ihrer -Y-Seite am Träger), -Z ist "vorne" (Sitz, Schräge).

export const ZELLE = 0.5;
export const BAU_X = 12;   // Zellen -12 .. 11
export const BAU_Z = 12;
export const BAU_Y = 16;   // Zellen 0 .. 15

// ---------------------------------------------------------------------------
// Ausrichtungen: 24 Drehmatrizen (zeilenweise, ganzzahlig)
// ---------------------------------------------------------------------------
const ROT_X = [1, 0, 0, 0, 0, -1, 0, 1, 0];
const ROT_Y = [0, 0, 1, 0, 1, 0, -1, 0, 0];
const ROT_Z = [0, -1, 0, 1, 0, 0, 0, 0, 1];

export function matMul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

export function matVec(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
  ];
}

export const ORIENT = (() => {
  const list = [[1, 0, 0, 0, 1, 0, 0, 0, 1]];
  const key = m => m.join(",");
  const seen = new Set([key(list[0])]);
  for (let i = 0; i < list.length; i++) {
    for (const r of [ROT_X, ROT_Y, ROT_Z]) {
      const m = matMul(r, list[i]);
      if (!seen.has(key(m))) {
        seen.add(key(m));
        list.push(m);
      }
    }
  }
  return list;
})();

const orientIndex = new Map(ORIENT.map((m, i) => [m.join(","), i]));

export function findOrient(m) {
  return orientIndex.get(m.join(",")) ?? 0;
}

// Ausrichtung so, dass lokales +Y in Richtung "normal" zeigt; spin wählt eine der 4 Drehungen darum.
export function orientFromUp(normal, spin = 0) {
  const fits = [];
  for (let i = 0; i < ORIENT.length; i++) {
    const up = matVec(ORIENT[i], [0, 1, 0]);
    if (up[0] === normal[0] && up[1] === normal[1] && up[2] === normal[2]) fits.push(i);
  }
  // Reihenfolge so sortieren, dass "spin" um die Achse weiterdreht
  const first = fits[0];
  const ordered = [first];
  const axisRot = rotAbout(normal);
  let cur = ORIENT[first];
  for (let k = 1; k < 4; k++) {
    cur = matMul(axisRot, cur);
    ordered.push(findOrient(cur));
  }
  return ordered[((spin % 4) + 4) % 4];
}

// 90°-Drehung um eine Weltachse (Einheitsvektor entlang x, y oder z, auch negativ)
export function rotAbout(axis) {
  const [x, y, z] = axis;
  if (x) return x > 0 ? ROT_X : matMul(ROT_X, matMul(ROT_X, ROT_X));
  if (y) return y > 0 ? ROT_Y : matMul(ROT_Y, matMul(ROT_Y, ROT_Y));
  return z > 0 ? ROT_Z : matMul(ROT_Z, matMul(ROT_Z, ROT_Z));
}

// Ausrichtung für Bauteile (Block, Schräge, Sitz): Gieren um Y, Kippen um X.
export function orientFromYawTilt(yaw, tilt) {
  let m = ORIENT[0];
  for (let i = 0; i < ((tilt % 4) + 4) % 4; i++) m = matMul(ROT_X, m);
  for (let i = 0; i < ((yaw % 4) + 4) % 4; i++) m = matMul(ROT_Y, m);
  return findOrient(m);
}

// ---------------------------------------------------------------------------
// Teile
// ---------------------------------------------------------------------------
const ALLE = ["px", "nx", "py", "ny", "pz", "nz"];
export const FACE_VEC = {
  px: [1, 0, 0], nx: [-1, 0, 0],
  py: [0, 1, 0], ny: [0, -1, 0],
  pz: [0, 0, 1], nz: [0, 0, -1]
};

// art: "bau" = frei drehbar (R/T), "anbau" = richtet sich nach der angeklickten Fläche
// faces: Flächen, über die das Teil mit Nachbarn verbunden wird
// gelenk: die +Y-Fläche verbindet über ein Gelenk statt fest
export const TEILE = {
  block:    { name: "Block", art: "bau", faces: ALLE, masse: 30, gruppe: "Verkleidung" },
  halb:     { name: "Stufe (halb)", art: "bau", faces: ALLE, masse: 16, gruppe: "Verkleidung" },
  keil:     { name: "Schräge", art: "bau", faces: ["ny", "pz", "px", "nx"], masse: 16, gruppe: "Verkleidung" },
  ecke:     { name: "Eckschräge", art: "bau", faces: ["ny", "pz", "px"], masse: 10, gruppe: "Verkleidung" },
  sitz:     { name: "Sitz", art: "bau", faces: ["ny", "px", "nx", "pz", "nz"], masse: 25, gruppe: "Fahrer" },
  rad_lenk: { name: "Lenkrad (lenkbar)", art: "anbau", faces: ["ny"], masse: 18, gruppe: "Räder", rad: true, seiteNoetig: true },
  rad_fest: { name: "Starres Rad", art: "anbau", faces: ["ny"], masse: 18, gruppe: "Räder", rad: true, seiteNoetig: true },
  rad_bock: { name: "Einkaufswagenrad", art: "anbau", faces: ["ny"], masse: 6, gruppe: "Räder", rad: true },
  auspuff:  { name: "Auspuff", art: "anbau", faces: ["ny"], masse: 6, gruppe: "Effekte" },
  nebel:    { name: "Nebelgenerator", art: "anbau", faces: ["ny"], masse: 12, gruppe: "Effekte" },
  duese:    { name: "Triebwerk", art: "anbau", faces: ["ny"], masse: 40, gruppe: "Antrieb" },
  rakete:   { name: "Raketentriebwerk", art: "anbau", faces: ["ny"], masse: 35, gruppe: "Antrieb" },
  servo:    { name: "Stellmotor", art: "anbau", faces: ["ny", "py"], masse: 15, gruppe: "Mechanik", gelenk: "servo" },
  fluegel:  { name: "Tragfläche", art: "bau", faces: ALLE, masse: 6, gruppe: "Flug" },
  steuerflaeche: { name: "Steuerfläche", art: "bau", faces: ALLE, masse: 5, gruppe: "Flug" },
  scheinwerfer: { name: "Scheinwerfer", art: "anbau", faces: ["ny"], masse: 4, gruppe: "Effekte" },
  leiter:   { name: "Leiter", art: "bau", faces: ALLE, masse: 5, gruppe: "Mechanik" },
  propeller: { name: "Propellermotor", art: "anbau", faces: ["ny"], masse: 30, gruppe: "Antrieb" },
  tank:     { name: "Treibstofftank", art: "bau", faces: ALLE, masse: 25, gruppe: "Antrieb" },
  kamera:   { name: "Kamera", art: "anbau", faces: ["ny"], masse: 4, gruppe: "Mechanik" },
  fallschirm: { name: "Fallschirm", art: "anbau", faces: ["ny"], masse: 10, gruppe: "Mechanik" },
  bruch:    { name: "Sollbruchstelle", art: "anbau", faces: ["ny", "py"], masse: 8, gruppe: "Mechanik", gelenk: "bruch" }
};

// Vorgabe-Tasten der Steuerflächen je Kanal [Ausschlag +, Ausschlag −]
export const KANAL_TASTEN = {
  nick: ["arrowdown", "arrowup"],
  roll: ["arrowright", "arrowleft"],
  gier: ["e", "q"]
};

export const RAD_GROESSEN = { S: 0.22, M: 0.32, L: 0.45 };
export const RAD_TIEFE = 0.05; // so weit hängt ein unbelastetes Rad unter der Zellmitte

// Vorgaben für einstellbare Teile
export function standardEinstellungen(typ, bauplan) {
  switch (typ) {
    case "rad_lenk": return { winkel: 35, groesse: "M", antrieb: true, umkehr: "auto" };
    case "rad_fest": return { groesse: "M", antrieb: true };
    case "rad_bock": return { groesse: "S" };
    case "auspuff": return { farbe: "#5b5f66" };
    case "nebel": return { farbe: "#e8f0ff", taste: "f" };
    case "duese": return { taste: "shift", schub: 4 };
    case "rakete": return { taste: "r", schub: 14, dauer: 3 };
    case "fallschirm": return { taste: "p", flaeche: 12, farbe: "#ff6a1a" };
    case "scheinwerfer": return { taste: "l", farbe: "#fff6d0" };
    case "propeller": return { plus: "g", minus: "h", schub: 4, tempo: 80 };
    case "tank": return { kapazitaet: 60 };
    case "fluegel": return { flaeche: 4 };
    case "steuerflaeche": return { flaeche: 1.5, winkel: 25, kanal: "nick", plus: KANAL_TASTEN.nick[0], minus: KANAL_TASTEN.nick[1], gegenlauf: false };
    case "kamera": {
      const belegt = new Set((bauplan?.parts || []).filter(p => p.t === "kamera").map(p => p.k?.taste));
      return { taste: ["v", "b", "n", "u", "i", "o"].find(t => !belegt.has(t)) || "v", fov: 70 };
    }
    case "servo": return { plus: "e", minus: "q", winkel: 90, tempo: 90, modus: "winkel" };
    case "bruch": {
      const used = new Set((bauplan?.parts || []).filter(p => p.t === "bruch").map(p => p.k?.taste));
      let n = 1;
      while (used.has(String(n)) && n < 9) n++;
      return { taste: String(n) };
    }
    default: return {};
  }
}

export const FARBEN = [
  "#e5484d", "#f5a524", "#ffd43b", "#46b96b", "#2f9ee0",
  "#6e56cf", "#f2f2f2", "#8b8f98", "#2b2f36", "#9a6b3f"
];

// ---------------------------------------------------------------------------
// Bauplan prüfen und analysieren
// ---------------------------------------------------------------------------
const cellKey = (x, y, z) => `${x},${y},${z}`;

export function inBauraum(x, y, z) {
  return x >= -BAU_X && x < BAU_X && z >= -BAU_Z && z < BAU_Z && y >= 0 && y < BAU_Y;
}

// Bereinigt einen Bauplan aus unsicherer Quelle (Netz, Speicher).
export function bereinige(raw) {
  const parts = [];
  const used = new Set();
  const list = Array.isArray(raw?.parts) ? raw.parts : [];

  for (const p of list) {
    if (!p || !TEILE[p.t]) continue;
    const x = Math.trunc(Number(p.x)), y = Math.trunc(Number(p.y)), z = Math.trunc(Number(p.z));
    if (![x, y, z].every(Number.isFinite) || !inBauraum(x, y, z)) continue;
    const key = cellKey(x, y, z);
    if (used.has(key)) continue;
    const o = Math.trunc(Number(p.o));
    const c = typeof p.c === "string" && /^#[0-9a-f]{6}$/i.test(p.c) ? p.c : FARBEN[7];
    const k = { ...standardEinstellungen(p.t), ...bereinigeEinstellungen(p.t, p.k) };
    used.add(key);
    parts.push({ t: p.t, x, y, z, o: o >= 0 && o < 24 ? o : 0, c, k });
  }
  return { v: 1, parts };
}

function bereinigeEinstellungen(typ, k) {
  if (!k || typeof k !== "object") return {};
  const out = {};
  const taste = v => (typeof v === "string" ? v.toLowerCase().slice(0, 12) : undefined);
  const zahl = (v, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : undefined;
  };
  const farbe = v => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
  const set = (name, value) => { if (value !== undefined) out[name] = value; };

  set("winkel", zahl(k.winkel, 0, 180));
  set("groesse", ["S", "M", "L"].includes(k.groesse) ? k.groesse : undefined);
  set("antrieb", typeof k.antrieb === "boolean" ? k.antrieb : undefined);
  set("umkehr", ["auto", "nein", "ja"].includes(k.umkehr) ? k.umkehr : undefined);
  set("farbe", farbe(k.farbe));
  set("taste", taste(k.taste));
  set("plus", taste(k.plus));
  set("minus", taste(k.minus));
  set("schub", zahl(k.schub, 0.5, typ === "rakete" ? 30 : 10));
  set("dauer", zahl(k.dauer, 0.5, 8));
  set("flaeche", zahl(k.flaeche, 0.5, 40));
  set("kanal", ["nick", "roll", "gier"].includes(k.kanal) ? k.kanal : undefined);
  set("gegenlauf", typeof k.gegenlauf === "boolean" ? k.gegenlauf : undefined);
  set("fov", zahl(k.fov, 30, 120));
  set("kapazitaet", zahl(k.kapazitaet, 10, 500));
  set("tempo", zahl(k.tempo, 10, 360));
  set("modus", ["winkel", "dauer"].includes(k.modus) ? k.modus : undefined);
  return out;
}

export function zellenMap(bauplan) {
  const map = new Map();
  bauplan.parts.forEach((p, i) => map.set(cellKey(p.x, p.y, p.z), i));
  return map;
}

export function teilAn(map, x, y, z) {
  return map.get(cellKey(x, y, z));
}

// Weltrichtungen der verbindenden Flächen eines Teils
export function weltFlaechen(part) {
  const m = ORIENT[part.o];
  return TEILE[part.t].faces.map(f => ({ name: f, dir: matVec(m, FACE_VEC[f]) }));
}

export function teilAchse(part, local = [0, 1, 0]) {
  return matVec(ORIENT[part.o], local);
}

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const sameDir = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const hasFace = (part, dir) => weltFlaechen(part).some(f => sameDir(f.dir, dir));

// Zerlegt den Bauplan in starre Körper (Union-Find über feste Verbindungen)
// und Gelenke (Stellmotor / Sollbruchstelle über ihre +Y-Fläche).
export function analysiere(bauplan) {
  const parts = bauplan.parts;
  const map = zellenMap(bauplan);
  const parent = parts.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { parent[find(a)] = find(b); };
  const gelenkKanten = [];

  for (let i = 0; i < parts.length; i++) {
    const a = parts[i];
    for (const d of DIRS) {
      const j = teilAn(map, a.x + d[0], a.y + d[1], a.z + d[2]);
      if (j === undefined || j < i) continue;
      const b = parts[j];
      const nd = [-d[0], -d[1], -d[2]];
      if (!hasFace(a, d) || !hasFace(b, nd)) continue;

      const aHead = TEILE[a.t].gelenk && sameDir(teilAchse(a), d);
      const bHead = TEILE[b.t].gelenk && sameDir(teilAchse(b), nd);

      if (aHead) gelenkKanten.push({ owner: i, other: j, dir: d });
      else if (bHead) gelenkKanten.push({ owner: j, other: i, dir: nd });
      else union(i, j);
    }
  }

  // Körper in stabiler Reihenfolge (nach kleinstem Teilindex), damit alle
  // Clients dieselbe Nummerierung bekommen.
  const bodyOf = new Array(parts.length);
  const bodies = [];
  const rootToBody = new Map();
  for (let i = 0; i < parts.length; i++) {
    const r = find(i);
    if (!rootToBody.has(r)) {
      rootToBody.set(r, bodies.length);
      bodies.push({ parts: [] });
    }
    bodyOf[i] = rootToBody.get(r);
    bodies[bodyOf[i]].parts.push(i);
  }

  const gelenke = [];
  for (const k of gelenkKanten) {
    const a = bodyOf[k.owner], b = bodyOf[k.other];
    if (a === b) continue; // Ring über feste Teile: Gelenk wäre blockiert
    gelenke.push({
      art: TEILE[parts[k.owner].t].gelenk,
      teil: k.owner,
      bodyA: a,
      bodyB: b,
      dir: k.dir
    });
  }

  // Schwerpunkt jedes Körpers (nur aus Teilmassen) als Ursprung
  for (const body of bodies) {
    let m = 0, x = 0, y = 0, z = 0;
    for (const i of body.parts) {
      const p = parts[i];
      const pm = TEILE[p.t].masse;
      const c = zellMitte(p);
      m += pm; x += c[0] * pm; y += c[1] * pm; z += c[2] * pm;
    }
    body.masse = m;
    body.ursprung = [x / m, y / m, z / m];
  }

  const sitz = parts.findIndex(p => p.t === "sitz");
  return { bodies, bodyOf, gelenke, sitz, sitzBody: sitz >= 0 ? bodyOf[sitz] : -1 };
}

// Mittelpunkt einer Zelle im Bauraum-Koordinatensystem (Meter, Boden y=0)
export function zellMitte(p) {
  return [(p.x + 0.5) * ZELLE, (p.y + 0.5) * ZELLE, (p.z + 0.5) * ZELLE];
}

// Wie hoch muss das Fahrzeug angehoben werden, damit nichts im Boden steckt?
// Räder stehen mit ihrer Unterkante auf dem Boden.
// radTiefe: zusätzlich, wie weit unbelastete Räder tiefer hängen (beim Spawnen).
export function bodenAbstand(bauplan, radTiefe = 0) {
  let lowest = Infinity;
  for (const p of bauplan.parts) {
    const c = zellMitte(p);
    const def = TEILE[p.t];
    let bottom;
    if (def.rad) bottom = c[1] - radRadius(p) - radTiefe;
    else bottom = c[1] - ZELLE / 2;
    lowest = Math.min(lowest, bottom);
  }
  return Number.isFinite(lowest) ? -lowest : 0;
}

export function radRadius(p) {
  return RAD_GROESSEN[p.k?.groesse] || (p.t === "rad_bock" ? RAD_GROESSEN.S : RAD_GROESSEN.M);
}

// Darf ein Teil an dieser Stelle stehen?
export function pruefePlatz(bauplan, teil) {
  if (!inBauraum(teil.x, teil.y, teil.z)) return "Außerhalb des Bauraums";
  const map = zellenMap(bauplan);
  if (teilAn(map, teil.x, teil.y, teil.z) !== undefined) return "Platz belegt";
  const def = TEILE[teil.t];
  if (def.max && bauplan.parts.filter(p => p.t === teil.t).length >= def.max) {
    return `Nur ${def.max} ${def.name} erlaubt`;
  }
  if (def.seiteNoetig && teilAchse(teil)[1] !== 0) return "Räder gehören an eine Seitenfläche";
  return null;
}

// Startfahrzeug für leere Parkplätze
export function starterKart() {
  const parts = [];
  const add = (t, x, y, z, o = 0, c = "#e5484d", k) =>
    parts.push({ t, x, y, z, o, c, k: { ...standardEinstellungen(t, { parts }), ...(k || {}) } });

  for (let z = -3; z <= 2; z++) {
    for (let x = -1; x <= 0; x++) add("block", x, 0, z, 0, z === -3 ? "#2b2f36" : "#e5484d");
  }
  add("sitz", -1, 1, 0, 0, "#2b2f36");
  add("block", 0, 1, 0, 0, "#e5484d");
  add("keil", -1, 1, -2, 0, "#e5484d");
  add("keil", 0, 1, -2, 0, "#e5484d");
  add("block", -1, 1, 2, 0, "#e5484d");
  add("block", 0, 1, 2, 0, "#e5484d");

  const links = orientFromUp([-1, 0, 0]);
  const rechts = orientFromUp([1, 0, 0]);
  const hinten = orientFromUp([0, 0, 1]);
  add("rad_lenk", -2, 0, -2, links, "#2b2f36");
  add("rad_lenk", 1, 0, -2, rechts, "#2b2f36");
  add("rad_fest", -2, 0, 1, links, "#2b2f36");
  add("rad_fest", 1, 0, 1, rechts, "#2b2f36");
  add("auspuff", 0, 0, 3, hinten, "#8b8f98");
  return { v: 1, parts };
}

// ---------------------------------------------------------------------------
// Vorlagen: fertige Fahrzeuge zum Laden
// ---------------------------------------------------------------------------
// Ausrichtung, bei der lokales +Y nach yDir und lokales +Z nach zDir zeigt
// (z. B. für senkrecht stehende Ruder: Plattennormale zur Seite, Flügeltiefe nach hinten)
export function orientAchsen(yDir, zDir) {
  for (let i = 0; i < ORIENT.length; i++) {
    const y = matVec(ORIENT[i], [0, 1, 0]), z = matVec(ORIENT[i], [0, 0, 1]);
    if (y.every((v, k) => v === yDir[k]) && z.every((v, k) => v === zDir[k])) return i;
  }
  return 0;
}

const C = { rot: "#e5484d", orange: "#f5a524", gelb: "#ffd43b", gruen: "#46b96b", blau: "#2f9ee0", weiss: "#f2f2f2", grau: "#8b8f98", dunkel: "#2b2f36" };

function baue(fn) {
  const parts = [];
  const add = (t, x, y, z, o = 0, c = C.grau, k = {}) =>
    parts.push({ t, x, y, z, o, c, k: { ...standardEinstellungen(t, { parts }), ...k } });
  fn(add, {
    links: orientFromUp([-1, 0, 0]), rechts: orientFromUp([1, 0, 0]),
    hinten: orientFromUp([0, 0, 1]), vorne: orientFromUp([0, 0, -1]),
    oben: orientFromUp([0, 1, 0]), unten: orientFromUp([0, -1, 0])
  });
  return bereinige({ v: 1, parts });
}

export const VORLAGEN = [
  { id: "kart", name: "Kart", bauen: () => bereinige(starterKart()) },

  { id: "dragster", name: "Dragster", bauen: () => baue((add, o) => {
    for (let z = -5; z <= 3; z++) add("block", 0, 0, z, 0, z % 3 === 0 ? C.weiss : C.orange);
    add("sitz", 0, 1, 0, 0, C.dunkel);
    add("rakete", 0, 0, 4, o.hinten, C.grau, { dauer: 4, schub: 16 });
    add("fallschirm", 0, 1, 3, o.oben, C.grau, { flaeche: 14 });
    add("kamera", 0, 0, -6, o.vorne, C.rot);
    add("rad_lenk", -1, 0, -4, o.links, C.dunkel, { winkel: 25 });
    add("rad_lenk", 1, 0, -4, o.rechts, C.dunkel, { winkel: 25 });
    add("rad_fest", -1, 0, 2, o.links, C.dunkel);
    add("rad_fest", 1, 0, 2, o.rechts, C.dunkel);
  }) },

  { id: "wagen", name: "Einkaufswagen", bauen: () => baue((add, o) => {
    // wie ein echter Einkaufswagen: vorne zwei Schwenkrollen, hinten zwei feste Räder (geben Spur)
    for (let x = 0; x <= 1; x++) for (let z = 0; z <= 2; z++) add("block", x, 1, z, 0, C.grau);
    for (let x = 0; x <= 1; x++) add("block", x, 0, 2, 0, C.grau);
    add("sitz", 0, 2, 1, 0, C.dunkel);
    add("block", 1, 2, 1, 0, C.grau);
    add("rad_bock", 0, 0, 0, o.unten, C.dunkel);
    add("rad_bock", 1, 0, 0, o.unten, C.dunkel);
    add("rad_fest", -1, 0, 2, o.links, C.dunkel, { antrieb: false });
    add("rad_fest", 2, 0, 2, o.rechts, C.dunkel, { antrieb: false });
    add("duese", 0, 1, 3, o.hinten, C.grau, { schub: 1.5 });
    add("duese", 1, 1, 3, o.hinten, C.grau, { schub: 1.5 });
    add("duese", -1, 1, 1, o.links, C.grau, { schub: 1.2, taste: "d" });   // schiebt nach rechts
    add("duese", 2, 1, 1, o.rechts, C.grau, { schub: 1.2, taste: "a" });   // schiebt nach links
    add("nebel", 1, 2, 2, o.oben, C.weiss);
  }) },
  { id: "gelaende", name: "Geländewagen", bauen: () => baue((add, o) => {
    for (let z = -3; z <= 3; z++) for (let x = -1; x <= 0; x++) add("block", x, 0, z, 0, C.gruen);
    add("sitz", -1, 1, 0, 0, C.dunkel);
    add("sitz", 0, 1, 0, 0, C.dunkel);
    add("keil", -1, 1, -2, 0, C.gruen);
    add("keil", 0, 1, -2, 0, C.gruen);
    add("block", -1, 1, 2, 0, C.dunkel);
    add("block", 0, 1, 2, 0, C.dunkel);
    add("kamera", 0, 0, -4, o.vorne, C.dunkel);
    add("auspuff", -1, 0, 4, o.hinten, C.grau);
    add("rad_lenk", -2, 0, -3, o.links, C.dunkel, { groesse: "L", winkel: 30 });
    add("rad_lenk", 1, 0, -3, o.rechts, C.dunkel, { groesse: "L", winkel: 30 });
    add("rad_fest", -2, 0, 2, o.links, C.dunkel, { groesse: "L" });
    add("rad_fest", 1, 0, 2, o.rechts, C.dunkel, { groesse: "L" });
  }) },

  { id: "flugzeug", name: "Flugzeug", bauen: () => baue((add, o) => {
    for (let z = -3; z <= 2; z++) add("block", 0, 0, z, 0, C.weiss);
    add("sitz", 0, 1, -1, 0, C.dunkel);
    add("kamera", 0, 0, -4, o.vorne, C.rot);
    // Tragflächen hinter dem Schwerpunkt (stabil), außen Querruder
    for (const x of [-2, -1, 1, 2]) for (const z of [0, 1]) add("fluegel", x, 0, z, 0, C.rot);
    for (const z of [0, 1]) {
      // links gegenläufig: ein Tastendruck kippt die Hinterkanten gegensinnig
      add("steuerflaeche", -3, 0, z, 0, C.gelb, { kanal: "roll", plus: "arrowright", minus: "arrowleft", gegenlauf: true, flaeche: 0.6, winkel: 12 });
      add("steuerflaeche", 3, 0, z, 0, C.gelb, { kanal: "roll", plus: "arrowright", minus: "arrowleft", flaeche: 0.6, winkel: 12 });
    }
    // Leitwerk: feste Stabilisatoren, Höhenruder, Seitenruder senkrecht darüber
    add("fluegel", -1, 0, 3, 0, C.rot, { flaeche: 3 });
    add("fluegel", 1, 0, 3, 0, C.rot, { flaeche: 3 });
    add("steuerflaeche", 0, 0, 3, 0, C.gelb, { kanal: "nick", flaeche: 1.2, winkel: 20 });
    add("steuerflaeche", 0, 0, 4, 0, C.gelb, { kanal: "nick", flaeche: 1.2, winkel: 20 });
    const senkrecht = orientAchsen([1, 0, 0], [0, 0, 1]);
    add("steuerflaeche", 0, 1, 4, senkrecht, C.rot, { kanal: "gier", plus: "e", minus: "q", flaeche: 1.5, winkel: 20 });
    add("steuerflaeche", 0, 2, 4, senkrecht, C.rot, { kanal: "gier", plus: "e", minus: "q", flaeche: 1.5, winkel: 20 });
    add("rakete", 0, 0, 5, o.hinten, C.grau, { dauer: 6, schub: 9 });
    add("rad_lenk", -1, 0, -3, o.links, C.dunkel);
    add("rad_lenk", 1, 0, -3, o.rechts, C.dunkel);
    add("rad_fest", -1, 0, 2, o.links, C.dunkel);
    add("rad_fest", 1, 0, 2, o.rechts, C.dunkel);
  }) },
  { id: "kran", name: "Kranwagen", bauen: () => baue((add, o) => {
    for (let z = -3; z <= 2; z++) for (let x = -1; x <= 0; x++) add("block", x, 0, z, 0, C.gelb);
    add("sitz", -1, 1, 0, 0, C.dunkel);
    add("servo", 0, 1, 1, 0, C.grau, { winkel: 120 });
    for (let z = 1; z >= -2; z--) add("block", 0, 2, z, 0, C.orange);
    add("keil", 0, 2, -3, 0, C.dunkel);
    add("rad_lenk", -2, 0, -2, o.links, C.dunkel);
    add("rad_lenk", 1, 0, -2, o.rechts, C.dunkel);
    add("rad_fest", -2, 0, 1, o.links, C.dunkel);
    add("rad_fest", 1, 0, 1, o.rechts, C.dunkel);
  }) },

  { id: "zug", name: "Zugmaschine mit Anhänger", bauen: () => baue((add, o) => {
    for (let z = -3; z <= 2; z++) add("block", 0, 0, z, 0, C.blau);
    add("sitz", 0, 1, 0, 0, C.dunkel);
    add("rad_lenk", -1, 0, -2, o.links, C.dunkel);
    add("rad_lenk", 1, 0, -2, o.rechts, C.dunkel);
    add("rad_fest", -1, 0, 1, o.links, C.dunkel);
    add("rad_fest", 1, 0, 1, o.rechts, C.dunkel);
    add("bruch", 0, 0, 3, o.hinten, C.gelb, { taste: "1" });
    for (let z = 4; z <= 6; z++) add("block", 0, 0, z, 0, C.grau);
    add("rad_fest", -1, 0, 5, o.links, C.dunkel, { antrieb: false });
    add("rad_fest", 1, 0, 5, o.rechts, C.dunkel, { antrieb: false });
    add("kamera", 0, 0, 7, o.hinten, C.rot);
  }) },
  { id: "bus", name: "Reisebus", bauen: () => baue((add, o) => {
    add("sitz", 0, 0, -6, 0, C.dunkel);                                   // Fahrer zuerst: legt "vorne" fest
    for (let z = -8; z <= 8; z++) {
      for (let x = -1; x <= 1; x++) {
        if (x === 0 && z === -6) continue;
        const kante = z === -8 || z === 8;
        const sitzPlatz = x !== 0 && z >= -5 && z <= 5 && (z + 5) % 2 === 0;
        if (sitzPlatz) add("sitz", x, 0, z, 0, C.blau);
        else add(kante ? "block" : "halb", x, 0, z, 0, kante ? C.gelb : C.grau);
      }
    }
    for (const x of [-1, 1]) for (const z of [-7, -4, -1, 2, 5, 7]) for (const y of [1, 2]) add("block", x, y, z, 0, C.gelb);   // Säulen
    for (const z of [-8, 8]) for (let x = -1; x <= 1; x++) for (const y of [1, 2]) add("block", x, y, z, 0, C.gelb);        // Front- und Heckwand
    for (let z = -8; z <= 8; z++) for (let x = -1; x <= 1; x++) add("halb", x, 3, z, 0, C.weiss);                           // Dach
    add("scheinwerfer", -1, 0, -9, o.vorne, C.weiss);
    add("scheinwerfer", 1, 0, -9, o.vorne, C.weiss);
    add("kamera", 0, 2, -9, o.vorne, C.dunkel);
    for (let y = 0; y <= 3; y++) add("leiter", 0, y, 9, 0, C.grau);                                                         // Leiter aufs Dach
    add("auspuff", 1, 0, 9, o.hinten, C.grau);
    add("rad_lenk", -2, 0, -6, o.links, C.dunkel, { groesse: "L", winkel: 28 });
    add("rad_lenk", 2, 0, -6, o.rechts, C.dunkel, { groesse: "L", winkel: 28 });
    for (const z of [4, 6]) {
      add("rad_fest", -2, 0, z, o.links, C.dunkel, { groesse: "L" });
      add("rad_fest", 2, 0, z, o.rechts, C.dunkel, { groesse: "L" });
    }
  }) },

  { id: "rakete_gross", name: "Raumrakete", bauen: () => baue((add, o) => {
    const unten = orientFromUp([0, -1, 0]);
    add("sitz", 0, 7, 0, 0, C.dunkel);
    add("sitz", 1, 7, 0, 0, C.dunkel);
    for (let y = 1; y <= 8; y++) for (const x of [0, 1]) for (const z of [0, 1]) {
      if (y === 7 && z === 0) continue;
      add("block", x, y, z, 0, y % 3 === 0 ? C.rot : C.weiss);
    }
    // Spitze: vier Eckschrägen, die in der Mitte zusammenlaufen
    add("ecke", 0, 9, 0, orientFromYawTilt(0, 0), C.rot);
    add("ecke", 1, 9, 0, orientFromYawTilt(3, 0), C.rot);
    add("ecke", 1, 9, 1, orientFromYawTilt(2, 0), C.rot);
    add("ecke", 0, 9, 1, orientFromYawTilt(1, 0), C.rot);
    for (const x of [0, 1]) for (const z of [0, 1]) add("rakete", x, 0, z, unten, C.grau, { dauer: 8, schub: 22 });
    // Leitflossen
    const flosseX = orientAchsen([1, 0, 0], [0, 1, 0]), flosseZ = orientAchsen([0, 0, 1], [0, 1, 0]);
    for (const y of [1, 2]) {
      for (const z of [0, 1]) { add("fluegel", -1, y, z, flosseX, C.rot, { flaeche: 2 }); add("fluegel", 2, y, z, flosseX, C.rot, { flaeche: 2 }); }
      for (const x of [0, 1]) { add("fluegel", x, y, -1, flosseZ, C.rot, { flaeche: 2 }); add("fluegel", x, y, 2, flosseZ, C.rot, { flaeche: 2 }); }
    }
    add("fallschirm", -1, 6, 0, orientFromUp([-1, 0, 0]), C.grau, { flaeche: 30 });
    add("kamera", 0, 8, -1, orientFromUp([0, 0, -1]), C.dunkel);
  }) },

  { id: "prop", name: "Propellerflugzeug", bauen: () => baue((add, o) => {
    add("sitz", 0, 1, -2, 0, C.dunkel);
    add("sitz", 0, 1, 0, 0, C.dunkel);
    for (let z = -5; z <= 3; z++) add("block", 0, 0, z, 0, C.weiss);
    add("tank", 0, 1, -4, 0, C.rot, { kapazitaet: 120 });
    add("scheinwerfer", 0, 0, -6, o.vorne, C.gelb);
    // Tragflächen etwas hinter dem Schwerpunkt, außen Querruder
    for (const x of [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]) for (const z of [0, 1]) add("fluegel", x, 0, z, 0, C.rot, { flaeche: 3 });
    for (const z of [0, 1]) {
      add("steuerflaeche", -6, 0, z, 0, C.gelb, { kanal: "roll", plus: "arrowright", minus: "arrowleft", gegenlauf: true, flaeche: 1, winkel: 12 });
      add("steuerflaeche", 6, 0, z, 0, C.gelb, { kanal: "roll", plus: "arrowright", minus: "arrowleft", flaeche: 1, winkel: 12 });
    }
    add("propeller", -3, 0, 2, o.hinten, C.grau, { schub: 5 });     // Druckpropeller hinter dem Flügel
    add("propeller", 3, 0, 2, o.hinten, C.grau, { schub: 5 });
    // Leitwerk
    add("fluegel", -1, 0, 4, 0, C.rot, { flaeche: 3 });
    add("fluegel", 1, 0, 4, 0, C.rot, { flaeche: 3 });
    add("steuerflaeche", 0, 0, 4, 0, C.gelb, { kanal: "nick", flaeche: 4.5, winkel: 25 });
    add("steuerflaeche", 0, 0, 5, 0, C.gelb, { kanal: "nick", flaeche: 4.5, winkel: 25 });
    const senkrecht = orientAchsen([1, 0, 0], [0, 0, 1]);
    add("steuerflaeche", 0, 1, 5, senkrecht, C.rot, { kanal: "gier", plus: "e", minus: "q", flaeche: 1.5, winkel: 20 });
    add("steuerflaeche", 0, 2, 5, senkrecht, C.rot, { kanal: "gier", plus: "e", minus: "q", flaeche: 1.5, winkel: 20 });
    add("rad_lenk", -1, 0, -4, o.links, C.dunkel);
    add("rad_lenk", 1, 0, -4, o.rechts, C.dunkel);
    add("rad_fest", -1, 0, 2, o.links, C.dunkel);
    add("rad_fest", 1, 0, 2, o.rechts, C.dunkel);
  }) },

  { id: "feuerwehr", name: "Feuerwehrauto", bauen: () => baue((add, o) => {
    add("sitz", -1, 1, -4, 0, C.dunkel);
    add("sitz", 1, 1, -4, 0, C.dunkel);
    for (let z = -6; z <= 6; z++) for (let x = -1; x <= 1; x++) add("halb", x, 0, z, 0, C.rot);
    for (let x = -1; x <= 1; x++) for (const z of [-6, -5]) add("block", x, 1, z, 0, C.rot);          // Motorhaube
    for (let x = -1; x <= 1; x++) { add("block", x, 1, -3, 0, C.rot); add("block", x, 2, -3, 0, C.weiss); }   // Rückwand der Kabine
    for (let z = -1; z <= 6; z++) for (let x = -1; x <= 1; x++) {                                       // Aufbau
      if (!(x === 0 && z === 2)) add("block", x, 1, z, 0, C.rot);                                       // an dieser Stelle sitzt der Wassertank
      add("block", x, 2, z, 0, C.weiss);
    }
    add("tank", 0, 1, 2, 0, C.blau, { kapazitaet: 300 });
    add("scheinwerfer", -1, 1, -7, o.vorne, C.weiss);
    add("scheinwerfer", 1, 1, -7, o.vorne, C.weiss);
    add("scheinwerfer", -1, 3, 0, o.oben, C.blau, { taste: "j", farbe: "#4aa3ff" });
    add("scheinwerfer", 1, 3, 0, o.oben, C.blau, { taste: "j", farbe: "#4aa3ff" });
    add("nebel", 0, 3, 3, o.oben, C.weiss, { farbe: "#ffffff" });
    add("kamera", 0, 1, -7, o.vorne, C.dunkel);
    for (let y = 0; y <= 3; y++) add("leiter", 0, y, 7, 0, C.grau);
    add("auspuff", 1, 0, 7, o.hinten, C.grau);
    add("rad_lenk", -2, 0, -5, o.links, C.dunkel, { groesse: "L" });
    add("rad_lenk", 2, 0, -5, o.rechts, C.dunkel, { groesse: "L" });
    for (const z of [3, 5]) {
      add("rad_fest", -2, 0, z, o.links, C.dunkel, { groesse: "L" });
      add("rad_fest", 2, 0, z, o.rechts, C.dunkel, { groesse: "L" });
    }
  }) },

  { id: "buggy", name: "Propeller-Buggy", bauen: () => baue((add, o) => {
    add("sitz", 0, 1, -2, 0, C.dunkel);
    for (let z = -3; z <= 2; z++) for (let x = 0; x <= 1; x++) add("block", x, 0, z, 0, C.orange);
    add("tank", 1, 1, -2, 0, C.rot, { kapazitaet: 80 });
    add("block", 0, 1, 2, 0, C.grau);
    add("block", 0, 2, 2, 0, C.grau);                                  // Mast für den Propeller
    add("propeller", 0, 2, 3, o.hinten, C.grau, { schub: 2.5, tempo: 35 });
    add("scheinwerfer", 0, 0, -4, o.vorne, C.gelb);
    add("rad_lenk", -1, 0, -3, o.links, C.dunkel, { antrieb: false, winkel: 12 });
    add("rad_lenk", 2, 0, -3, o.rechts, C.dunkel, { antrieb: false, winkel: 12 });
    add("rad_fest", -1, 0, 2, o.links, C.dunkel, { antrieb: false });
    add("rad_fest", 2, 0, 2, o.rechts, C.dunkel, { antrieb: false });
  }) },

  { id: "zug_lang", name: "Zug mit zwei Wagen", bauen: () => baue((add, o) => {
    add("sitz", 0, 1, -1, 0, C.dunkel);
    for (let z = -4; z <= 0; z++) add("block", 0, 0, z, 0, C.rot);
    add("auspuff", 0, 1, -4, o.oben, C.dunkel);
    add("scheinwerfer", 0, 0, -5, o.vorne, C.gelb);
    add("rad_lenk", -1, 0, -3, o.links, C.dunkel, { winkel: 12 });
    add("rad_lenk", 1, 0, -3, o.rechts, C.dunkel, { winkel: 12 });
    add("rad_fest", -1, 0, -1, o.links, C.dunkel);
    add("rad_fest", 1, 0, -1, o.rechts, C.dunkel);
    for (const [start, farbe, taste] of [[1, C.blau, "1"], [7, C.gruen, "2"]]) {
      add("bruch", 0, 0, start, o.hinten, C.gelb, { taste });                  // Kupplung (Sollbruchstelle)
      for (let z = start + 1; z <= start + 5; z++) {
        add("block", 0, 0, z, 0, farbe);
        if (z !== start + 3) add("block", 0, 1, z, 0, farbe);
      }
      add("sitz", 0, 1, start + 3, 0, C.dunkel);
      for (const z of [start + 2, start + 4]) {
        add("rad_fest", -1, 0, z, o.links, C.dunkel, { antrieb: false });
        add("rad_fest", 1, 0, z, o.rechts, C.dunkel, { antrieb: false });
      }
    }
    add("kamera", 0, 0, 13, o.hinten, C.rot);
  }) }
];

export function vorlage(id) {
  const v = VORLAGEN.find(x => x.id === id);
  return v ? v.bauen() : null;
}
