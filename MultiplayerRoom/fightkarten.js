// karten für den fight-modus. eine karte ist ein kleines json-dokument (format v2, siehe bereinigeKarte):
// geländeform + startwert, handgesetzte höhenpinsel, basen, spawnpunkte und deckung (häuser, felsen, bäume).
// alle koordinaten im dokument sind lokal zur kartenmitte, so lässt sich jede karte an jeden platz der welt stellen.
// die offiziellen karten werden aus einer vorgabe erzeugt; kroxenstudios kann sie im editor überschreiben (server),
// eigene karten liegen im vierten platz.

export const KARTEN_GROESSE = 1200;
export const KARTEN_N = 241;
// halber durchmesser der einnahmezone einer base in metern
export const BASIS_RADIUS = 22;
// sekunden, die ein einzelner spieler zum einnehmen braucht, und beschleunigung pro mitspieler im team
export const EINNAHME_ZEIT = 30;
export const EINNAHME_BONUS = 1.25;
// punkte pro sekunde und gehaltener base
export const PUNKTE_PRO_SEKUNDE = 0.1;

// grenzen eines kartendokuments (der server prüft dieselben werte, ein test vergleicht beide)
export const KARTEN_GRENZEN = {
  basen: [1, 4], spawns: [2, 24], gebaeude: 300, felsen: 500, baeume: 1200, hoehen: 300, deko: 800,
  amp: [0, 120], radius: [4, 90], delta: [-80, 160], mitteMax: 570
};
// anzahl der dekoarten (kisten, fässer, container, …), die liste mit modellen steht in deko.js
export const DEKO_ANZAHL = 15;
export const FORMEN = ["duenen", "terrassen", "huegel", "flach"];
export const PALETTE_SCHLUESSEL = ["gras", "wald", "trocken", "fels", "schnee"];

// plätze in der welt: die ersten drei sind offiziell, der letzte gehört der geladenen eigenen karte
export const PLAETZE = [[8000, 0], [10000, 0], [12000, 0], [14000, 0]];
export const EIGENER_PLATZ = 3;

// vorgaben der offiziellen karten (lokale koordinaten)
const DEFS = [
  {
    id: "duenen", name: "Dünen", mitte: PLAETZE[0], seed: 11, form: "duenen", amp: 16,
    basen: [[0, -400], [-380, 260], [380, 260]],
    baeume: 0, felsen: 70, bunker: 22, haeuser: 3, deko: [8, 8, 9, 1, 14, 4, 11, 6], dekoAnzahl: 150,
    palette: { gras: "#d2b06a", wald: "#b8924f", trocken: "#e0c07f", fels: "#9a7b57", schnee: "#f0e6cc" }
  },
  {
    id: "felsental", name: "Felsental", mitte: PLAETZE[1], seed: 29, form: "terrassen", amp: 42,
    basen: [[-350, -250], [350, 250], [0, 0]],
    baeume: 40, felsen: 150, bunker: 14, haeuser: 2, deko: [10, 12, 0, 11, 5, 14, 2], dekoAnzahl: 130,
    palette: { gras: "#7d8a6a", wald: "#5f6e52", trocken: "#8f8b73", fels: "#85827c", schnee: "#eef2f7" }
  },
  {
    id: "huegelland", name: "Hügelland", mitte: PLAETZE[2], seed: 47, form: "huegel", amp: 30,
    basen: [[-300, -300], [300, -300], [0, 380]],
    baeume: 260, felsen: 90, bunker: 18, haeuser: 4, deko: [7, 7, 3, 6, 2, 13, 1, 5], dekoAnzahl: 170,
    palette: null
  }
];

const hash = (ix, iz, seed) => {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};
const glatt = t => t * t * (3 - 2 * t);
function wert(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = glatt(x - ix), fz = glatt(z - iz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
function fbm(x, z, seed, oktaven) {
  let s = 0, a = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oktaven; o++) {
    s += a * wert(x * f, z * f, seed + o * 17);
    norm += a;
    a *= 0.5;
    f *= 2;
  }
  return s / norm;
}

// rohe geländehöhe an lokalen koordinaten (ohne pinsel und einebnung)
function rohHoehe(k, x, z) {
  switch (k.form) {
    case "duenen": {
      // lange, gestreckte wellen mit scharfen kämmen
      const n = fbm(x / 170, z / 110, k.seed, 4);
      return k.amp * Math.pow(1 - Math.abs(2 * n - 1), 1.6) + 2 * wert(x / 18, z / 18, k.seed + 5);
    }
    case "terrassen": {
      // stufen wie in einem canyon: höhe wird gerundet und an den kanten geglättet
      const n = fbm(x / 210, z / 210, k.seed, 4);
      const h = Math.pow(n, 1.5) * k.amp * 1.6;
      const stufe = 7, s = Math.floor(h / stufe), f = h / stufe - s;
      return (s + glatt(Math.min(1, f * 2.2))) * stufe;
    }
    case "flach":
      return k.amp * 0.15 * fbm(x / 60, z / 60, k.seed, 2);
    default:
      return k.amp * Math.pow(fbm(x / 150, z / 150, k.seed, 3), 1.3) * 1.5 + 1.5 * wert(x / 20, z / 20, k.seed + 3);
  }
}

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const zahl = (v, lo, hi, vorgabe = lo) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : vorgabe;
};
const rund = n => Math.round(n * 10) / 10;
const reinText = (s, max) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

// prüft und begrenzt ein kartendokument (aus dem editor, einer datei oder vom server). gibt null zurück, wenn nichts brauchbar ist.
export function bereinigeKarte(raw) {
  let k = raw;
  if (typeof raw === "string") { try { k = JSON.parse(raw); } catch { return null; } }
  if (!k || typeof k !== "object" || k.v !== 2) return null;
  const G = KARTEN_GRENZEN, m = G.mitteMax;
  const paare = (liste, max, breite, pruefe) => {
    if (!Array.isArray(liste)) return [];
    const aus = [];
    for (const e of liste.slice(0, max)) {
      if (!Array.isArray(e) || e.length < 2) continue;
      const z = pruefe(e);
      if (z) aus.push(z);
    }
    return aus;
  };
  const ort = e => [rund(zahl(e[0], -m, m, 0)), rund(zahl(e[1], -m, m, 0))];
  const basen = paare(k.basen, G.basen[1], 2, ort);
  const spawns = paare(k.spawns, G.spawns[1], 2, ort);
  if (basen.length < G.basen[0] || spawns.length < G.spawns[0]) return null;
  const palette = {};
  if (k.palette && typeof k.palette === "object") {
    for (const s of PALETTE_SCHLUESSEL) if (/^#[0-9a-f]{6}$/i.test(k.palette[s])) palette[s] = k.palette[s].toLowerCase();
  }
  return {
    v: 2,
    name: reinText(k.name, 40) || "Karte",
    form: FORMEN.includes(k.form) ? k.form : "huegel",
    seed: Math.floor(zahl(k.seed, 1, 99999, 1)),
    amp: rund(zahl(k.amp, G.amp[0], G.amp[1], 20)),
    palette: Object.keys(palette).length ? palette : null,
    hoehen: paare(k.hoehen, G.hoehen, 5, e => [...ort(e), rund(zahl(e[2], G.radius[0], G.radius[1], 20)), rund(zahl(e[3], G.delta[0], G.delta[1], 0)), e[4] === 1 ? 1 : 0]),
    basen, spawns,
    gebaeude: paare(k.gebaeude, G.gebaeude, 7, e => [...ort(e), rund(zahl(e[2], 1, 40, 8)), rund(zahl(e[3], 1, 40, 8)), rund(zahl(e[4], 0.5, 30, 3)), rund(zahl(e[5], -7, 7, 0)), Math.floor(zahl(e[6], 0, 6, 0))]),
    felsen: paare(k.felsen, G.felsen, 3, e => [...ort(e), rund(zahl(e[2], 0.5, 15, 3))]),
    baeume: paare(k.baeume, G.baeume, 3, e => [...ort(e), rund(zahl(e[2], 1, 20, 6))]),
    deko: paare(k.deko, G.deko, 5, e => [...ort(e), Math.floor(zahl(e[2], 0, DEKO_ANZAHL - 1, 0)), rund(zahl(e[3], 0.5, 4, 1)), rund(zahl(e[4], -7, 7, 0))])
  };
}

// höhenraster einer karte: form, pinsel, einebnung unter basen/spawns, steiler rand. alles lokal zur mitte.
export function baueHoehen(k) {
  const n = KARTEN_N, g = KARTEN_GROESSE, half = g / 2;
  const schritt = g / (n - 1);
  // einzuebnende scheiben: [x, z, radius innen, radius aussen]
  const scheiben = [
    ...k.basen.map(([x, z]) => [x, z, BASIS_RADIUS + 10, BASIS_RADIUS + 45]),
    ...k.spawns.map(([x, z]) => [x, z, 9, 28])
  ];
  const h = new Float32Array(n * n);
  const rohAt = (x, z) => {
    let y = rohHoehe(k, x, z);
    for (const [px, pz, r, d, modus] of k.hoehen) {
      const dist = Math.hypot(x - px, z - pz);
      if (dist >= r) continue;
      const w = 1 - glatt(dist / r);
      y = modus === 1 ? y + (d - y) * w : y + d * w;
    }
    return y;
  };
  const zielHoehe = scheiben.map(([x, z]) => rohAt(x, z));
  for (let ix = 0; ix < n; ix++) {
    for (let iz = 0; iz < n; iz++) {
      const x = -half + ix * schritt, z = -half + iz * schritt;
      let y = rohAt(x, z);
      scheiben.forEach(([cx, cz, ri, ra], s) => {
        const d = Math.hypot(x - cx, z - cz);
        if (d >= ra) return;
        const w = 1 - glatt(Math.max(0, (d - ri) / (ra - ri)));
        y += (zielHoehe[s] - y) * w;
      });
      // am rand steigt das gelände steil an, so bleibt jeder im spielfeld
      const rand = half - Math.max(Math.abs(x), Math.abs(z));
      if (rand < 60) y += Math.pow(1 - rand / 60, 2) * 90;
      h[ix * n + iz] = y;
    }
  }
  const hoehe = (x, z) => {
    const gx = Math.min(Math.max((x + half) / schritt, 0), n - 1.0001), gz = Math.min(Math.max((z + half) / schritt, 0), n - 1.0001);
    const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    const a = h[ix * n + iz] * (1 - fx) + h[(ix + 1) * n + iz] * fx;
    const b = h[ix * n + iz + 1] * (1 - fx) + h[(ix + 1) * n + iz + 1] * fx;
    return a * (1 - fz) + b * fz;
  };
  return { n, schritt, h, hoehe };
}

// aus einer vorgabe ein vollständiges kartendokument machen: spawnpunkte im ring, mauern um die basen, bunker, häuser, felsen, bäume
function dokumentAusVorgabe(def) {
  const half = KARTEN_GROESSE / 2;
  const basen = def.basen.map(([x, z]) => [x, z]);
  const spawns = [];
  for (const radius of [500, 470, 520]) {
    for (let i = 0; i < 20 && spawns.length < 20; i++) {
      const w = (i / 20) * Math.PI * 2 + (radius === 500 ? 0 : 0.157);
      const x = Math.cos(w) * radius, z = Math.sin(w) * radius;
      if (basen.some(b => Math.hypot(b[0] - x, b[1] - z) < 70)) continue;
      if (spawns.some(s => Math.hypot(s[0] - x, s[1] - z) < 14)) continue;
      spawns.push([x, z]);
    }
  }
  const k = { v: 2, name: def.name, form: def.form, seed: def.seed, amp: def.amp, palette: def.palette, hoehen: [], basen, spawns, gebaeude: [], felsen: [], baeume: [], deko: [] };
  const { hoehe } = baueHoehen(k);
  const neigung = (x, z) => Math.hypot(hoehe(x + 4, z) - hoehe(x - 4, z), hoehe(x, z + 4) - hoehe(x, z - 4)) / 8;
  const rnd = rng(def.seed * 7919 + 3);
  const frei = (x, z, abstandBasis) =>
    Math.abs(x) < half - 80 && Math.abs(z) < half - 80 &&
    basen.every(b => Math.hypot(b[0] - x, b[1] - z) > abstandBasis) &&
    spawns.every(s => Math.hypot(s[0] - x, s[1] - z) > 24);

  // deckung: mauerstücke im halbkreis um jede base, dazu einzelne bunker und wenige häuser
  for (const [bx, bz] of basen) {
    const start = rnd() * Math.PI * 2;
    for (let s = 0; s < 7; s++) {
      const w = start + s * (Math.PI * 2 / 7) + rnd() * 0.2;
      // lücken lassen, damit man in die base fahren kann
      if (s === 0 || s === 3) continue;
      const r = BASIS_RADIUS + 14 + rnd() * 8;
      k.gebaeude.push([bx + Math.cos(w) * r, bz + Math.sin(w) * r, 9 + rnd() * 5, 1.8, 2 + rnd() * 1.4, w + Math.PI / 2, Math.floor(rnd() * 4)]);
    }
  }
  for (let versuch = 0, s = 0; s < def.bunker && versuch < 4000; versuch++) {
    const x = (rnd() * 2 - 1) * (half - 90), z = (rnd() * 2 - 1) * (half - 90);
    if (!frei(x, z, 75) || neigung(x, z) > 0.22) continue;
    k.gebaeude.push([x, z, 5 + rnd() * 4, 5 + rnd() * 4, 2.6 + rnd() * 1.6, rnd() * Math.PI, Math.floor(rnd() * 5)]);
    s++;
  }
  for (let versuch = 0, s = 0; s < def.haeuser && versuch < 4000; versuch++) {
    const x = (rnd() * 2 - 1) * (half - 120), z = (rnd() * 2 - 1) * (half - 120);
    if (!frei(x, z, 110) || neigung(x, z) > 0.12) continue;
    k.gebaeude.push([x, z, 10 + rnd() * 4, 8 + rnd() * 4, 6 + rnd() * 2, rnd() * Math.PI, Math.floor(rnd() * 7)]);
    s++;
  }
  for (let versuch = 0, s = 0; s < def.felsen && versuch < 6000; versuch++) {
    const x = (rnd() * 2 - 1) * (half - 70), z = (rnd() * 2 - 1) * (half - 70);
    if (!frei(x, z, 50)) continue;
    k.felsen.push([x, z, 2.2 + rnd() * rnd() * 6]);
    s++;
  }
  for (let versuch = 0, s = 0; s < def.baeume && versuch < 8000; versuch++) {
    // bäume wachsen in gruppen
    const cx = (rnd() * 2 - 1) * (half - 80), cz = (rnd() * 2 - 1) * (half - 80);
    for (let j = 0; j < 6 && s < def.baeume; j++) {
      const x = cx + (rnd() - 0.5) * 40, z = cz + (rnd() - 0.5) * 40;
      if (!frei(x, z, 60) || neigung(x, z) > 0.5) continue;
      k.baeume.push([x, z, 4 + rnd() * 6]);
      s++;
    }
  }
  // dekoobjekte mit eigenem zufall, damit der rest der karte gleich bleibt: um jede base sandsäcke und kisten,
  // dazu verstreut die arten, die zum thema der karte passen (gruppen von 2 bis 5)
  const rd = rng(def.seed * 104729 + 17);
  for (const [bx, bz] of basen) {
    for (let i = 0; i < 6; i++) {
      const w = rd() * Math.PI * 2, r = BASIS_RADIUS - 4 + rd() * 6;
      k.deko.push([bx + Math.cos(w) * r, bz + Math.sin(w) * r, i % 3 === 0 ? 0 : 4, 1, w + Math.PI / 2]);
    }
    k.deko.push([bx + BASIS_RADIUS + 8, bz, 13, 1, 0]);
  }
  const thema = def.deko || [0, 1, 2, 7];
  for (let versuch = 0, s = 0; s < (def.dekoAnzahl ?? 120) && versuch < 6000; versuch++) {
    const cx = (rd() * 2 - 1) * (half - 90), cz = (rd() * 2 - 1) * (half - 90);
    if (!frei(cx, cz, 45) || neigung(cx, cz) > 0.35) continue;
    const typ = thema[Math.floor(rd() * thema.length)];
    const n = 2 + Math.floor(rd() * 4);
    for (let j = 0; j < n; j++) {
      const x = cx + (rd() - 0.5) * 18, z = cz + (rd() - 0.5) * 18;
      if (!frei(x, z, 40)) continue;
      k.deko.push([x, z, typ, 0.8 + rd() * 0.5, rd() * Math.PI * 2]);
      s++;
    }
  }
  return bereinigeKarte(k);
}

// ein kartendokument in weltkoordinaten verwandeln: das braucht gelaende.js (baueGelaende), die basen und spawns der spiellogik
export function erzeugeKarte(dok, mitte, id = "") {
  const k = bereinigeKarte(dok);
  if (!k) return null;
  const [mx, mz] = mitte;
  const { n, schritt, h, hoehe: lokal } = baueHoehen(k);
  const g = KARTEN_GROESSE;
  const welt = (liste, breite) => liste.map(e => [e[0] + mx, e[1] + mz, ...e.slice(2)]);
  const flach = liste => liste.flatMap(e => [e[0] + mx, e[1] + mz, e[2]]);
  const d = {
    v: 1, n, groesse: g, mitte: [mx, mz], schritt, x0: mx - g / 2, z0: mz - g / 2, h, wege: [],
    palette: k.palette, felsenKollision: true,
    gebaeude: welt(k.gebaeude), felsen: flach(k.felsen), baeume: flach(k.baeume), deko: welt(k.deko)
  };
  return {
    id, name: k.name, daten: d, dok: k, mitte: [mx, mz],
    basen: k.basen.map(([x, z]) => [x + mx, z + mz]),
    spawns: k.spawns.map(([x, z]) => ({ x: x + mx, z: z + mz })),
    hoehe: (x, z) => lokal(x - mx, z - mz)
  };
}

// offizielle karten: dokument aus der vorgabe (träge erzeugt) oder aus einer überschreibung vom server
export const KARTEN = DEFS.map((def, i) => ({
  id: def.id, name: def.name, mitte: [...PLAETZE[i]], platz: i, offiziell: true,
  _def: def, _dok: null, _fertig: null,
  get basen() { return (this._dok ? this._dok.basen : this._def.basen).map(([x, z]) => [x + this.mitte[0], z + this.mitte[1]]); },
  dokument() { return (this._dok ||= dokumentAusVorgabe(this._def)); },
  // vom server geladene fassung einsetzen (null = zurück zur vorgabe)
  ueberschreibe(dok) {
    this._dok = dok ? bereinigeKarte(dok) : null;
    if (dok && this._dok) this.name = this._dok.name;
    this._fertig = null;
  },
  erzeuge() { return (this._fertig ||= erzeugeKarte(this.dokument(), this.mitte, this.id)); }
}));

// vierter platz: eine geladene eigene karte (aus datei, hangar oder editor)
export const EIGENE = {
  id: "eigene", name: "", mitte: [...PLAETZE[EIGENER_PLATZ]], platz: EIGENER_PLATZ, offiziell: false,
  _dok: null, _fertig: null,
  get basen() { return this._dok ? this._dok.basen.map(([x, z]) => [x + this.mitte[0], z + this.mitte[1]]) : []; },
  dokument() { return this._dok; },
  setze(dok, name = "") {
    const k = bereinigeKarte(dok);
    if (!k) return false;
    this._dok = k;
    this.name = name || k.name;
    this._fertig = null;
    return true;
  },
  erzeuge() { return this._dok ? (this._fertig ||= erzeugeKarte(this._dok, this.mitte, this.id)) : null; }
};

// leeres grundgerüst für eine neue karte im editor
export function neueKarte(name = "Neue Karte") {
  return bereinigeKarte({
    v: 2, name, form: "huegel", seed: 1 + Math.floor(Math.random() * 9000), amp: 20, palette: null, hoehen: [],
    basen: [[-300, 0], [300, 0]], spawns: [[-480, 120], [-480, -120], [480, 120], [480, -120]],
    gebaeude: [], felsen: [], baeume: [], deko: []
  });
}

// standardbasen der offiziellen karten in weltkoordinaten, in dieser reihenfolge kennt sie der raum-server als vorgabe
export const STANDARD_BASEN = DEFS.flatMap(def => def.basen.map(([x, z]) => [def.mitte[0] + x, def.mitte[1] + z]));
