// Bastelkarre: 3D-Modelle der Bauteile und Aufbau der Fahrzeuggrafik.
import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import {
  TEILE, ORIENT, ZELLE, analysiere, zellMitte, radRadius
} from "./bau.js";

const mats = new Map();
export function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05, ...extra }));
  }
  return mats.get(key);
}

const DUNKEL = "#24282e";
const REIFEN = "#1b1d21";
const CHROM = { color: "#c9ced6", metalness: 0.85, roughness: 0.25 };

export function orientQuat(o) {
  const m = ORIENT[o];
  const m4 = new THREE.Matrix4().set(
    m[0], m[1], m[2], 0,
    m[3], m[4], m[5], 0,
    m[6], m[7], m[8], 0,
    0, 0, 0, 1
  );
  return new THREE.Quaternion().setFromRotationMatrix(m4);
}

const S = ZELLE / 2;
const geoCache = new Map();
function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), material);
  m.position.set(x, y, z);
  return m;
}

function zyl(r1, r2, h, material, x = 0, y = 0, z = 0, seg = 18) {
  const m = new THREE.Mesh(geo(`c${r1},${r2},${h},${seg}`, () => new THREE.CylinderGeometry(r1, r2, h, seg)), material);
  m.position.set(x, y, z);
  return m;
}

const E = S - 0.002;
const keilGeo = () => geo("keil", () => new ConvexGeometry([
  v3(-E, -E, -E), v3(E, -E, -E), v3(-E, -E, E), v3(E, -E, E), v3(-E, E, E), v3(E, E, E)
]));
const eckGeo = () => geo("ecke", () => new ConvexGeometry([
  v3(-E, -E, -E), v3(E, -E, -E), v3(-E, -E, E), v3(E, -E, E), v3(E, E, E)
]));

// Baut das Modell eines Teils im Teil-Koordinatensystem (Zellmitte = Ursprung).
// Rückgabe: { obj, kopf?, rad?, emit? }
//  obj  : Object3D, wird in der Zellmitte mit der Teil-Ausrichtung eingesetzt
//         (bei Rädern: ohne Ausrichtung, die steckt in rad.orient)
//  kopf : Teil, das mit dem Körper hinter dem Gelenk mitdreht (Stellmotor, Bruchstelle)
//  rad  : Gelenke zum Animieren von Federung, Lenkung und Drehung
//  emit : Austrittspunkt für Effekte (im Teil-Koordinatensystem)
export function teilModell(p) {
  const c = p.c || "#8b8f98";
  const farbe = mat(c);
  const g = new THREE.Group();
  const out = { obj: g };

  switch (p.t) {
    case "block":
      g.add(box(ZELLE - 0.004, ZELLE - 0.004, ZELLE - 0.004, farbe));
      break;
    case "halb":
      g.add(box(ZELLE - 0.004, S - 0.004, ZELLE - 0.004, farbe, 0, -S / 2));
      break;
    case "keil":
      g.add(new THREE.Mesh(keilGeo(), farbe));
      break;
    case "ecke":
      g.add(new THREE.Mesh(eckGeo(), farbe));
      break;
    case "sitz": {
      const polster = farbe;
      g.add(box(0.48, 0.12, 0.48, mat(DUNKEL), 0, -0.19));
      g.add(box(0.42, 0.1, 0.4, polster, 0, -0.08, -0.02));
      g.add(box(0.42, 0.42, 0.09, polster, 0, 0.06, 0.19));
      g.add(box(0.3, 0.1, 0.06, mat(DUNKEL), 0, 0.22, 0.2));
      break;
    }
    case "servo": {
      g.add(box(0.42, 0.3, 0.42, mat(DUNKEL), 0, -0.1));
      g.add(box(0.43, 0.06, 0.43, farbe, 0, -0.05));
      const kopf = new THREE.Group();
      kopf.add(zyl(0.19, 0.19, 0.1, mat("#c9ced6", CHROM), 0, 0.2, 0, 24));
      kopf.add(box(0.06, 0.03, 0.17, mat("#ffd43b"), 0, 0.26, -0.1));
      out.kopf = kopf;
      break;
    }
    case "bruch": {
      g.add(box(0.46, 0.14, 0.46, farbe, 0, -0.18));
      g.add(zyl(0.09, 0.09, 0.2, mat("#ffd43b", { emissive: "#3a2c00" }), 0, 0));
      for (let i = 0; i < 3; i++) g.add(zyl(0.095, 0.095, 0.025, mat("#141414"), 0, -0.06 + i * 0.06));
      const kopf = new THREE.Group();
      kopf.add(box(0.46, 0.14, 0.46, farbe, 0, 0.18));
      out.kopf = kopf;
      break;
    }
    case "auspuff": {
      const chrom = mat("#c9ced6", CHROM);
      g.add(box(0.2, 0.04, 0.2, mat(DUNKEL), 0, -0.23));
      g.add(zyl(0.055, 0.055, 0.4, chrom, 0, -0.03));
      g.add(zyl(0.08, 0.065, 0.12, chrom, 0, 0.18));
      g.add(zyl(0.06, 0.06, 0.005, mat("#050505"), 0, 0.243));
      out.emit = [0, 0.25, 0];
      break;
    }
    case "nebel": {
      g.add(box(0.4, 0.3, 0.4, mat("#3a4048"), 0, -0.1));
      for (let i = 0; i < 4; i++) g.add(box(0.41, 0.02, 0.05, mat("#1c1f24"), 0, -0.18 + i * 0.05, 0.18));
      g.add(zyl(0.12, 0.09, 0.16, farbe, 0, 0.13));
      g.add(zyl(0.07, 0.07, 0.01, mat("#050505"), 0, 0.215));
      out.emit = [0, 0.24, 0];
      break;
    }
    case "duese": {
      g.add(box(0.36, 0.06, 0.36, mat(DUNKEL), 0, -0.22));
      g.add(zyl(0.21, 0.21, 0.26, mat("#d9dde3", { metalness: 0.6, roughness: 0.35 }), 0, -0.07, 0, 24));
      g.add(zyl(0.215, 0.215, 0.05, farbe, 0, -0.1, 0, 24));
      g.add(zyl(0.15, 0.2, 0.18, mat("#5d6168", { metalness: 0.7, roughness: 0.4 }), 0, 0.15, 0, 24));
      g.add(zyl(0.12, 0.12, 0.01, mat("#ff7a1a", { emissive: "#3a1300" }), 0, 0.24, 0, 20));
      out.emit = [0, 0.26, 0];
      break;
    }
    case "rakete": {
      g.add(box(0.3, 0.05, 0.3, mat(DUNKEL), 0, -0.225));
      g.add(zyl(0.16, 0.16, 0.3, mat("#f2f2f2"), 0, -0.05, 0, 22));
      g.add(zyl(0.165, 0.165, 0.06, farbe, 0, -0.12, 0, 22));
      g.add(zyl(0.165, 0.165, 0.04, farbe, 0, 0.03, 0, 22));
      g.add(zyl(0.09, 0.19, 0.16, mat("#3b3f45", { metalness: 0.7, roughness: 0.35 }), 0, 0.17, 0, 22));
      out.emit = [0, 0.26, 0];
      break;
    }
    case "fluegel": {
      g.add(box(ZELLE - 0.004, 0.06, ZELLE - 0.004, farbe));
      const nase = zyl(0.03, 0.03, ZELLE - 0.004, farbe, 0, 0, -S + 0.002, 12);
      nase.rotation.z = Math.PI / 2;
      g.add(nase);
      break;
    }
    case "steuerflaeche": {
      g.add(box(ZELLE - 0.004, 0.06, S, farbe, 0, 0, -S / 2));
      const klappe = new THREE.Group();
      klappe.add(box(ZELLE - 0.004, 0.06, S - 0.01, farbe, 0, 0, S / 2));
      klappe.add(box(ZELLE - 0.004, 0.062, 0.03, mat("#ffd43b"), 0, 0, S - 0.02));
      g.add(klappe);
      const scharnier = zyl(0.025, 0.025, ZELLE - 0.004, mat("#3a4048"), 0, 0, 0, 10);
      scharnier.rotation.z = Math.PI / 2;
      g.add(scharnier);
      out.klappe = klappe;
      break;
    }
    case "kamera": {
      g.add(box(0.3, 0.05, 0.3, mat(DUNKEL), 0, -0.225));
      g.add(box(0.26, 0.2, 0.34, mat("#2b2f36"), 0, -0.1));
      g.add(box(0.27, 0.06, 0.35, farbe, 0, -0.1));
      g.add(zyl(0.1, 0.12, 0.14, mat("#111418"), 0, 0.07, 0, 20));
      g.add(zyl(0.075, 0.075, 0.01, mat("#3a6ea5", { metalness: 0.8, roughness: 0.1 }), 0, 0.145, 0, 20));
      g.add(box(0.04, 0.03, 0.04, mat("#ff2a2a", { emissive: "#ff0000" }), 0.09, 0.015, 0.1));
      out.emit = [0, 0.22, 0];
      break;
    }
    case "fallschirm": {
      g.add(box(0.36, 0.05, 0.36, mat(DUNKEL), 0, -0.22));
      g.add(box(0.34, 0.26, 0.3, farbe, 0, -0.06));
      g.add(box(0.36, 0.04, 0.32, mat("#1c1f24"), 0, -0.02));
      g.add(box(0.06, 0.27, 0.31, mat("#1c1f24"), 0, -0.06));
      out.emit = [0, 0.08, 0];
      break;
    }
    case "rad_lenk":
    case "rad_fest": {
      const r = radRadius(p);
      const orient = new THREE.Group();
      orient.quaternion.copy(orientQuat(p.o));
      const spin = new THREE.Group();
      orient.add(spin);
      // Achsstummel vom Träger zur Nabe; beim Lenkrad mit Achsschenkel
      orient.add(zyl(0.04, 0.04, 0.16, mat("#9aa0a8", CHROM), 0, -0.17));
      if (p.t === "rad_lenk") orient.add(box(0.08, 0.06, 0.16, mat("#ffd43b"), 0, -0.22));
      spin.add(zyl(r, r, 0.2, mat(REIFEN, { roughness: 0.95 }), 0, 0, 0, 28));
      spin.add(zyl(r * 0.62, r * 0.62, 0.205, farbe, 0, 0, 0, 24));
      spin.add(box(r * 1.15, 0.21, 0.05, mat("#d9dde3", CHROM)));
      spin.add(box(0.05, 0.21, r * 1.15, mat("#d9dde3", CHROM)));
      const lenk = new THREE.Group();
      lenk.add(orient);
      g.add(lenk);
      out.rad = { lenk, spin, bock: false };
      break;
    }
    case "rad_bock": {
      const r = radRadius(p);
      const orient = new THREE.Group();
      orient.quaternion.copy(orientQuat(p.o));
      orient.add(box(0.26, 0.03, 0.26, mat(DUNKEL), 0, -0.235));
      const schwenk = new THREE.Group();
      orient.add(schwenk);
      const gabel = mat("#c9ced6", CHROM);
      schwenk.add(zyl(0.05, 0.05, 0.05, gabel, 0, -0.2));
      schwenk.add(box(0.03, 0.22, 0.08, gabel, 0.07, -0.08, 0));
      schwenk.add(box(0.03, 0.22, 0.08, gabel, -0.07, -0.08, 0));
      const spin = new THREE.Group();
      spin.rotation.z = Math.PI / 2; // Achse entlang lokal X
      const dreh = new THREE.Group();
      spin.add(dreh);
      dreh.add(zyl(r, r, 0.08, mat("#30343a", { roughness: 0.9 }), 0, 0, 0, 22));
      dreh.add(zyl(r * 0.5, r * 0.5, 0.085, farbe, 0, 0, 0, 16));
      dreh.add(box(r * 1.2, 0.09, 0.03, mat("#d9dde3")));
      schwenk.add(spin);
      g.add(orient);
      out.rad = { schwenk, spin: dreh, bock: true };
      break;
    }
  }

  if (!TEILE[p.t].rad) g.quaternion.copy(orientQuat(p.o));
  g.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  if (out.kopf) {
    out.kopf.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }
  return out;
}

// Ganze Fahrzeuggrafik: eine Gruppe je Körper (Ursprung = Körperursprung).
// opts.koerperFarben: jeden Körper einfarbig zeigen (Verbindungen prüfen)
const KOERPER_FARBEN = ["#46b96b", "#2f9ee0", "#f5a524", "#e5484d", "#6e56cf", "#ffd43b", "#ff7ab6", "#38d6d6"];

export function fahrzeugGrafik(plan, opts = {}) {
  const ana = opts.ana || analysiere(plan);
  const groups = ana.bodies.map(() => new THREE.Group());
  const raeder = new Map();
  const emit = new Map();
  const teilObj = new Map();
  const sitze = [];
  const klappen = new Map();

  const kopfZiel = new Map();
  for (const gl of ana.gelenke) kopfZiel.set(gl.teil, gl.bodyB);

  plan.parts.forEach((p, i) => {
    const bi = ana.bodyOf[i];
    const m = teilModell(opts.koerperFarben ? { ...p, c: KOERPER_FARBEN[bi % KOERPER_FARBEN.length] } : p);
    const c = zellMitte(p);
    const u = ana.bodies[bi].ursprung;
    m.obj.position.set(c[0] - u[0], c[1] - u[1], c[2] - u[2]);
    m.obj.traverse(o => { o.userData.teil = i; });
    groups[bi].add(m.obj);
    teilObj.set(i, m.obj);

    if (m.kopf) {
      const ziel = kopfZiel.has(i) ? kopfZiel.get(i) : bi;
      const u2 = ana.bodies[ziel].ursprung;
      m.kopf.position.set(c[0] - u2[0], c[1] - u2[1], c[2] - u2[2]);
      m.kopf.quaternion.copy(orientQuat(p.o));
      m.kopf.traverse(o => { o.userData.teil = i; });
      groups[ziel].add(m.kopf);
    }
    if (m.klappe) klappen.set(i, m.klappe);
    if (m.rad) raeder.set(i, { ...m.rad, obj: m.obj, basisY: m.obj.position.y });
    if (m.emit) emit.set(i, { body: bi, obj: m.obj, punkt: new THREE.Vector3(...m.emit) });
    if (p.t === "sitz") sitze.push({ index: i, body: bi, obj: m.obj });
  });

  return { ana, groups, raeder, emit, sitz: sitze[0] || null, sitze, klappen, teilObj };
}

// Räder animieren: zustand = [{teil, feder, lenk, dreh}]
export function setzeRaeder(grafik, zustand) {
  for (const z of zustand) {
    const r = grafik.raeder.get(z.teil);
    if (!r) continue;
    r.obj.position.y = r.basisY - z.feder;
    if (r.bock) {
      r.schwenk.rotation.y = z.lenk;
      r.spin.rotation.y = z.dreh;
    } else {
      r.lenk.rotation.y = z.lenk;
      r.spin.rotation.y = z.dreh;
    }
  }
}

// Offener Fallschirm: Ursprung = Befestigungspunkt, der Schirm liegt auf +Z.
export function schirmModell(flaeche, farbe) {
  const r = Math.sqrt(flaeche / Math.PI);
  const leine = r * 2.2;
  const offen = Math.PI * 0.42;
  const g = new THREE.Group();
  // Kuppel aus 12 Stoffbahnen, abwechselnd Schirmfarbe und Weiß, etwas flach gedrückt
  const kuppel = new THREE.Group();
  const bahnen = [
    new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.85, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: "#f4f4f4", roughness: 0.85, side: THREE.DoubleSide })
  ];
  for (let i = 0; i < 12; i++) {
    const bahn = new THREE.Mesh(
      new THREE.SphereGeometry(r, 4, 10, (i / 12) * Math.PI * 2, Math.PI / 6, 0, offen),
      bahnen[i % 2]
    );
    bahn.castShadow = true;
    kuppel.add(bahn);
  }
  // Loch in der Mitte (wie bei echten Bremsschirmen)
  kuppel.rotation.x = Math.PI / 2; // Wölbung zeigt nach +Z
  kuppel.scale.set(1, 0.6, 1);     // lokal Y = Schirmachse
  kuppel.position.z = leine - r * Math.cos(offen) * 0.6;
  g.add(kuppel);
  // Leinen vom Befestigungspunkt zum Rand
  const pts = [];
  const randR = r * Math.sin(offen);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    pts.push(0, 0, 0, Math.cos(a) * randR, Math.sin(a) * randR, leine);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: "#e8e8e8" })));
  return g;
}

// Halbdurchsichtiges Vorschau-Modell
export function geistModell(p, farbe) {
  const m = teilModell(p);
  const g = new THREE.Group();
  g.add(m.obj);
  if (m.kopf) {
    m.kopf.quaternion.copy(orientQuat(p.o));
    g.add(m.kopf);
  }
  const material = new THREE.MeshBasicMaterial({ color: farbe, transparent: true, opacity: 0.45, depthWrite: false });
  g.traverse(o => {
    if (o.isMesh) {
      o.material = material;
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  g.userData.material = material;
  return g;
}

// ---------------------------------------------------------------------------
// Spielfigur (wie im MultiplayerRoom), sitzend oder stehend
// ---------------------------------------------------------------------------
export function spielfigur(color) {
  const group = new THREE.Group();
  const clothes = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const skin = mat("#f0c4a4", { roughness: 0.8 });
  const dark = mat("#2a3650", { roughness: 0.85 });
  const hair = mat("#3b2a22", { roughness: 0.9 });
  const shoe = mat("#f4f6fb", { roughness: 0.6 });
  const eye = mat("#141a26", { roughness: 0.3 });

  const part = (geometry, material, x, y, z, parent = group) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  part(new THREE.CapsuleGeometry(0.27, 0.45, 6, 12), clothes, 0, 0.85, 0);
  part(new THREE.SphereGeometry(0.19, 20, 16), skin, 0, 1.42, 0);
  const h = part(new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 1.45, 0.015);
  h.rotation.x = -0.25;
  const eyeGeo = new THREE.SphereGeometry(0.03, 10, 8);
  part(eyeGeo, eye, -0.07, 1.43, -0.172);
  part(eyeGeo, eye, 0.07, 1.43, -0.172);

  const armGeo = new THREE.CapsuleGeometry(0.075, 0.34, 4, 8);
  const handGeo = new THREE.SphereGeometry(0.075, 10, 8);
  const leftArm = new THREE.Group(); leftArm.position.set(-0.36, 1.1, 0); group.add(leftArm);
  const rightArm = new THREE.Group(); rightArm.position.set(0.36, 1.1, 0); group.add(rightArm);
  part(armGeo, clothes, 0, -0.21, 0, leftArm);
  part(armGeo, clothes, 0, -0.21, 0, rightArm);
  part(handGeo, skin, 0, -0.48, 0, leftArm);
  part(handGeo, skin, 0, -0.48, 0, rightArm);

  const legGeo = new THREE.CapsuleGeometry(0.09, 0.3, 4, 8);
  const shoeGeo = new THREE.BoxGeometry(0.17, 0.09, 0.27);
  const leftLeg = new THREE.Group(); leftLeg.position.set(-0.14, 0.5, 0); group.add(leftLeg);
  const rightLeg = new THREE.Group(); rightLeg.position.set(0.14, 0.5, 0); group.add(rightLeg);
  part(legGeo, dark, 0, -0.21, 0, leftLeg);
  part(legGeo, dark, 0, -0.21, 0, rightLeg);
  part(shoeGeo, shoe, 0, -0.46, -0.04, leftLeg);
  part(shoeGeo, shoe, 0, -0.46, -0.04, rightLeg);

  group.userData = { leftLeg, rightLeg, leftArm, rightArm, clothes };
  return group;
}

export function setzeSitzen(figur, sitzen) {
  const u = figur.userData;
  const bein = sitzen ? -Math.PI / 2 : 0;
  u.leftLeg.rotation.x = bein;
  u.rightLeg.rotation.x = bein;
  // Hände ans "Lenkrad"
  u.leftArm.rotation.x = sitzen ? -1.0 : 0;
  u.rightArm.rotation.x = sitzen ? -1.0 : 0;
}

// Namensschild / Sprechblase als Sprite
export function textSprite(text, { breite = 512, hoehe = 128, font = "bold 44px system-ui, sans-serif", bg = "rgba(8,14,24,0.82)", fg = "#fff", skala = 1.7 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = breite;
  canvas.height = hoehe;
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = bg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(20, 14, breite - 40, hoehe - 28, 28);
  else ctx.rect(20, 14, breite - 40, hoehe - 28);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.fillText(text, breite / 2, hoehe / 2, breite - 70);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(skala, skala * hoehe / breite, 1);
  sprite.renderOrder = 9;
  return sprite;
}

export function entsorge(obj) {
  obj.traverse(o => {
    if (o.isSprite) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
}
