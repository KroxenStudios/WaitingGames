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
