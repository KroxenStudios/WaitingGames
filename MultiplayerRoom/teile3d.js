import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import {
  TEILE, ORIENT, ZELLE, analysiere, zellMitte, radRadius
} from "./bau.js";
import { bereinigeLook } from "./look.js";

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

export function teilModell(p) {
  const c = p.c || "#8b8f98";
  const farbe = mat(c);
  const g = new THREE.Group();
  const out = { obj: g };

  switch (p.t) {
    case "block":
      g.add(box(ZELLE - 0.004, ZELLE - 0.004, ZELLE - 0.004, farbe));
      break;
    case "glas": {
      const scheibe = mat(c, { transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.1, depthWrite: false });
      const rahmen = mat(c, { transparent: true, opacity: 0.85, roughness: 0.3 });
      const k = ZELLE - 0.004, d = 0.03;
      g.add(box(k, k, k, scheibe));
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        g.add(box(k, d, d, rahmen, 0, sy * (k / 2 - d / 2), sx * (k / 2 - d / 2)));
        g.add(box(d, k, d, rahmen, sx * (k / 2 - d / 2), 0, sy * (k / 2 - d / 2)));
        g.add(box(d, d, k, rahmen, sx * (k / 2 - d / 2), sy * (k / 2 - d / 2), 0));
      }
      break;
    }
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
    case "scheinwerfer": {
      g.add(box(0.3, 0.05, 0.3, mat(DUNKEL), 0, -0.225));
      g.add(box(0.28, 0.16, 0.28, mat("#2b2f36"), 0, -0.12));
      g.add(zyl(0.13, 0.17, 0.12, mat("#c9ced6", CHROM), 0, 0.02, 0, 22));
      const linse = new THREE.Mesh(
        new THREE.CylinderGeometry(0.115, 0.115, 0.012, 22),
        new THREE.MeshStandardMaterial({ color: "#fffbe8", emissive: p.k?.farbe || "#fff6d0", emissiveIntensity: 0, roughness: 0.2 })
      );
      linse.position.set(0, 0.085, 0);
      linse.userData.keinSchatten = true;
      g.add(linse);
      out.linse = linse;
      out.emit = [0, 0.2, 0];
      break;
    }
    case "leiter": {
      const metall = mat("#b8bcc4", { metalness: 0.5, roughness: 0.4 });
      for (const sx of [-1, 1]) g.add(box(0.04, ZELLE - 0.004, 0.05, metall, sx * 0.15, 0, 0));
      for (let i = 0; i < 5; i++) g.add(box(0.3, 0.03, 0.03, farbe, 0, -0.2 + i * 0.1, 0));
      break;
    }
    case "propeller": {
      g.add(box(0.3, 0.04, 0.3, mat(DUNKEL), 0, -0.23));
      g.add(zyl(0.16, 0.16, 0.26, mat("#5d6168", { metalness: 0.6, roughness: 0.4 }), 0, -0.08, 0, 24));
      g.add(zyl(0.165, 0.165, 0.05, farbe, 0, -0.14, 0, 24));
      g.add(zyl(0.04, 0.09, 0.1, mat("#c9ced6", CHROM), 0, 0.1, 0, 16));
      const rotor = new THREE.Group();
      rotor.position.y = 0.16;
      for (const s of [1, -1]) {
        const blatt = box(0.62, 0.012, 0.09, mat("#2b2f36"), s * 0.34, 0, 0);
        blatt.rotation.x = 0.35 * s;
        rotor.add(blatt);
      }
      g.add(rotor);
      const scheibe = new THREE.Mesh(
        new THREE.CircleGeometry(0.66, 36),
        new THREE.MeshBasicMaterial({ color: "#dfe6ee", transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
      );
      scheibe.rotation.x = -Math.PI / 2;
      scheibe.position.y = 0.16;
      scheibe.visible = false;
      scheibe.userData.keinSchatten = true;
      g.add(scheibe);
      out.rotor = { rotor, scheibe, winkel: 0 };
      break;
    }
    case "tank": {
      g.add(zyl(0.225, 0.225, ZELLE - 0.06, farbe, 0, 0, 0, 24));
      for (const sy of [-1, 1]) g.add(zyl(0.23, 0.23, 0.04, mat(DUNKEL), 0, sy * 0.2, 0, 24));
      g.add(zyl(0.06, 0.06, 0.03, mat("#c9ced6", CHROM), 0, 0.215, 0, 12));
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
      spin.rotation.z = Math.PI / 2;
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
      o.castShadow = !o.userData.keinSchatten;
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

const KOERPER_FARBEN = ["#46b96b", "#2f9ee0", "#f5a524", "#e5484d", "#6e56cf", "#ffd43b", "#ff7ab6", "#38d6d6"];

export function fahrzeugGrafik(plan, opts = {}) {
  const ana = opts.ana || analysiere(plan);
  const groups = ana.bodies.map(() => new THREE.Group());
  const raeder = new Map();
  const emit = new Map();
  const teilObj = new Map();
  const sitze = [];
  const klappen = new Map();
  const lampen = new Map();
  const rotoren = new Map();
  const leitern = [];

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
    if (m.linse) lampen.set(i, m.linse);
    if (m.rotor) rotoren.set(i, m.rotor);
    if (p.t === "leiter") leitern.push(m.obj);
    if (m.rad) raeder.set(i, { ...m.rad, obj: m.obj, basisY: m.obj.position.y });
    if (m.emit) emit.set(i, { body: bi, obj: m.obj, punkt: new THREE.Vector3(...m.emit) });
    if (p.t === "sitz") sitze.push({ index: i, body: bi, obj: m.obj });
  });

  return { ana, groups, raeder, emit, sitz: sitze[0] || null, sitze, klappen, lampen, rotoren, leitern, teilObj };
}

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

export function schirmModell(flaeche, farbe) {
  const r = Math.sqrt(flaeche / Math.PI);
  const leine = r * 2.2;
  const offen = Math.PI * 0.42;
  const g = new THREE.Group();
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
  kuppel.rotation.x = Math.PI / 2;
  kuppel.scale.set(1, 0.6, 1);
  kuppel.position.z = leine - r * Math.cos(offen) * 0.6;
  g.add(kuppel);
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

export function spielfigur(color, look) {
  const group = new THREE.Group();
  figurAktualisieren(group, color, look);
  return group;
}

export function figurAktualisieren(group, color, look) {
  const l = bereinigeLook(look);
  for (const m of group.userData.eigeneStoffe || []) m.dispose();
  const eigeneStoffe = [];
  const neuerStoff = optionen => { const m = new THREE.MeshStandardMaterial(optionen); eigeneStoffe.push(m); return m; };
  for (const c of [...group.children]) {
    if (!c.userData.figurTeil) continue;
    group.remove(c);
    c.traverse(o => { if (o.isMesh && o.geometry && !o.userData.geteilt) o.geometry.dispose(); });
  }
  const clothes = neuerStoff({ color, roughness: 0.7 });
  const dunkler = f => neuerStoff({ color: new THREE.Color(color).multiplyScalar(f), roughness: 0.75 });
  const skin = mat(l.haut, { roughness: 0.8 });
  const dark = mat("#2a3650", { roughness: 0.85 });
  const weiss = mat("#f2f4f8", { roughness: 0.7 });
  const hair = mat(l.haar, { roughness: 0.9 });
  const shoe = mat("#f4f6fb", { roughness: 0.6 });
  const eye = mat("#141a26", { roughness: 0.3 });

  const part = (geometry, material, x, y, z, parent = group) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.userData.figurTeil = true;
    parent.add(mesh);
    return mesh;
  };
  const kiste = (w, h, d, material, x, y, z, parent = group) => part(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);

  const og = l.koerper === "og";
  let leftArm, rightArm, leftLeg, rightLeg;
  if (og) {
    let torso = clothes, aermel = clothes, hose = dark, bein = dark, schuh = shoe;
    switch (l.kleidung) {
      case "top": aermel = skin; hose = dunkler(0.6); bein = skin; break;
      case "overall": torso = weiss; aermel = weiss; hose = clothes; bein = clothes; break;
      case "kleid": bein = skin; break;
      case "anzug": hose = clothes; bein = clothes; schuh = dark; break;
      case "raumanzug": torso = weiss; aermel = weiss; bein = weiss; hose = weiss; schuh = mat("#8b8f98"); break;
    }

    part(new THREE.CapsuleGeometry(0.27, 0.45, 6, 12), torso, 0, 0.85, 0);
    part(new THREE.SphereGeometry(0.19, 20, 16), skin, 0, 1.42, 0);

    const armGeo = new THREE.CapsuleGeometry(0.075, 0.34, 4, 8);
    const handGeo = new THREE.SphereGeometry(0.075, 10, 8);
    leftArm = new THREE.Group(); leftArm.position.set(-0.36, 1.1, 0); group.add(leftArm);
    rightArm = new THREE.Group(); rightArm.position.set(0.36, 1.1, 0); group.add(rightArm);
    for (const arm of [leftArm, rightArm]) {
      arm.userData.figurTeil = true;
      part(armGeo, aermel, 0, -0.21, 0, arm);
      part(handGeo, skin, 0, -0.48, 0, arm);
    }

    const legGeo = new THREE.CapsuleGeometry(0.09, 0.3, 4, 8);
    const shoeGeo = new THREE.BoxGeometry(0.17, 0.09, 0.27);
    leftLeg = new THREE.Group(); leftLeg.position.set(-0.14, 0.5, 0); group.add(leftLeg);
    rightLeg = new THREE.Group(); rightLeg.position.set(0.14, 0.5, 0); group.add(rightLeg);
    for (const leg of [leftLeg, rightLeg]) {
      leg.userData.figurTeil = true;
      part(legGeo, bein, 0, -0.21, 0, leg);
      part(shoeGeo, schuh, 0, -0.46, -0.04, leg);
      if (l.kleidung === "top") part(new THREE.CylinderGeometry(0.105, 0.105, 0.2, 10), hose, 0, -0.1, 0, leg);
    }

    switch (l.kleidung) {
      case "hoodie":
        part(new THREE.SphereGeometry(0.17, 12, 10), clothes, 0, 1.28, 0.2);
        kiste(0.3, 0.12, 0.05, dunkler(0.8), 0, 0.7, -0.262);
        break;
      case "jacke":
        kiste(0.04, 0.5, 0.02, weiss, 0, 0.9, -0.272);
        kiste(0.34, 0.06, 0.12, dunkler(0.8), 0, 1.3, -0.1);
        for (const arm of [leftArm, rightArm]) part(new THREE.CylinderGeometry(0.086, 0.086, 0.05, 10), weiss, 0, -0.38, 0, arm);
        break;
      case "overall":
        part(new THREE.CylinderGeometry(0.275, 0.275, 0.3, 14), clothes, 0, 0.62, 0);
        kiste(0.34, 0.3, 0.05, clothes, 0, 0.97, -0.255);
        for (const x of [-0.12, 0.12]) kiste(0.05, 0.2, 0.05, clothes, x, 1.22, -0.2);
        break;
      case "kleid":
        part(new THREE.CylinderGeometry(0.27, 0.47, 0.55, 18), clothes, 0, 0.6, 0);
        break;
      case "anzug":
        kiste(0.13, 0.36, 0.02, weiss, 0, 1.05, -0.268);
        kiste(0.06, 0.3, 0.02, mat("#c9302c"), 0, 1.0, -0.278);
        break;
      case "raumanzug": {
        kiste(0.3, 0.42, 0.16, mat("#8b8f98"), 0, 0.98, 0.3);
        const helm = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 16),
          neuerStoff({ color: "#bfe3ff", transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false }));
        helm.position.set(0, 1.42, 0);
        helm.userData.figurTeil = true;
        group.add(helm);
        break;
      }
    }

  } else {
    const jeans = mat("#34476b", { roughness: 0.85 });
    const grau = mat("#8b8f98", { roughness: 0.6 });
    const sohle = mat("#cfd4dd", { roughness: 0.8 });
    let torso = clothes, aermel = clothes, hose = jeans, bein = jeans, schuh = shoe;
    switch (l.kleidung) {
      case "top": hose = dunkler(0.6); bein = skin; break;
      case "overall": torso = weiss; aermel = weiss; hose = clothes; bein = clothes; break;
      case "kleid": hose = clothes; bein = skin; break;
      case "anzug": hose = clothes; bein = clothes; schuh = dark; break;
      case "raumanzug": torso = weiss; aermel = weiss; bein = weiss; hose = weiss; schuh = grau; break;
    }
    const zylZ = (rOben, rUnten, h, material, x, y, z, tiefe = 0.72) => {
      const m = part(new THREE.CylinderGeometry(rOben, rUnten, h, 22), material, x, y, z);
      m.scale.z = tiefe;
      return m;
    };
    const ring = (r, rohr, material, y, z = 0) => {
      const m = part(new THREE.TorusGeometry(r, rohr, 8, 20), material, 0, y, z);
      m.rotation.x = Math.PI / 2;
      return m;
    };
    const bulk = l.kleidung === "raumanzug" ? 1.08 : 1;

    zylZ(0.225 * bulk, 0.2 * bulk, 0.24, hose, 0, 0.64, 0, 0.75);
    if (l.kleidung === "top") {
      zylZ(0.24, 0.225, 0.38, torso, 0, 0.94, 0);
      zylZ(0.235, 0.24, 0.1, skin, 0, 1.18, 0);
      for (const x of [-0.12, 0.12]) kiste(0.07, 0.13, 0.05, torso, x, 1.19, 0);
    } else {
      zylZ(0.255 * bulk, 0.225 * bulk, 0.46, torso, 0, 0.98, 0, l.kleidung === "raumanzug" ? 0.82 : 0.72);
      if (l.kleidung !== "kleid" && l.kleidung !== "overall" && l.kleidung !== "anzug") zylZ(0.236 * bulk, 0.236 * bulk, 0.045, torso, 0, 0.765, 0);
    }
    part(new THREE.CylinderGeometry(0.062, 0.07, 0.12, 12), skin, 0, 1.24, 0);
    const schulterStoff = l.kleidung === "top" ? skin : aermel;
    for (const x of [-0.3, 0.3]) part(new THREE.SphereGeometry(0.095 * bulk, 14, 12), schulterStoff, x, 1.14, 0);

    part(new THREE.SphereGeometry(0.19, 22, 18), skin, 0, 1.42, 0);
    for (const x of [-0.188, 0.188]) part(new THREE.SphereGeometry(0.034, 10, 8), skin, x, 1.42, 0);

    const aermelArt = { shirt: "kurz", kleid: "kurz", top: "nackt" }[l.kleidung] || "lang";
    const handGeo = new THREE.SphereGeometry(0.07, 12, 10);
    leftArm = new THREE.Group(); leftArm.position.set(-0.36, 1.1, 0); group.add(leftArm);
    rightArm = new THREE.Group(); rightArm.position.set(0.36, 1.1, 0); group.add(rightArm);
    for (const arm of [leftArm, rightArm]) {
      arm.userData.figurTeil = true;
      if (aermelArt === "lang") {
        part(new THREE.CapsuleGeometry(0.082 * bulk, 0.31, 4, 10), aermel, 0, -0.2, 0, arm);
      } else {
        part(new THREE.CapsuleGeometry(0.068, 0.32, 4, 10), skin, 0, -0.2, 0, arm);
        if (aermelArt === "kurz") part(new THREE.CylinderGeometry(0.088, 0.094, 0.17, 14), aermel, 0, -0.07, 0, arm);
      }
      part(handGeo, skin, 0, -0.47, 0, arm);
    }

    const legGeo = new THREE.CapsuleGeometry(0.09, 0.3, 4, 10);
    const stiefel = l.kleidung === "raumanzug";
    leftLeg = new THREE.Group(); leftLeg.position.set(-0.14, 0.5, 0); group.add(leftLeg);
    rightLeg = new THREE.Group(); rightLeg.position.set(0.14, 0.5, 0); group.add(rightLeg);
    for (const leg of [leftLeg, rightLeg]) {
      leg.userData.figurTeil = true;
      part(legGeo, bein, 0, -0.21, 0, leg);
      kiste(0.17, stiefel ? 0.14 : 0.075, 0.28, schuh, 0, stiefel ? -0.4 : -0.463, -0.045, leg);
      kiste(0.176, 0.022, 0.286, stiefel ? grau : sohle, 0, -0.494, -0.045, leg);
      if (l.kleidung === "top") part(new THREE.CylinderGeometry(0.108, 0.112, 0.2, 14), hose, 0, -0.1, 0, leg);
      if (l.kleidung === "overall") part(new THREE.CylinderGeometry(0.1, 0.102, 0.035, 14), dunkler(0.8), 0, -0.375, 0, leg);
    }

    const vorn = -0.186;
    const fl = (x, y) => {
      const r = 0.225 + (Math.min(1.21, Math.max(0.75, y)) - 0.75) / 0.46 * 0.03;
      return -(r * 0.72) * Math.sqrt(Math.max(0.05, 1 - (x / r) ** 2));
    };
    switch (l.kleidung) {
      case "shirt":
        ring(0.085, 0.017, dunkler(0.82), 1.215);
        break;
      case "hoodie": {
        ring(0.112, 0.036, clothes, 1.215);
        const kapuze = part(new THREE.SphereGeometry(0.16, 14, 12), clothes, 0, 1.2, 0.13);
        kapuze.scale.set(1.05, 0.8, 0.7);
        kiste(0.22, 0.11, 0.035, dunkler(0.86), 0, 0.84, fl(0.11, 0.84) - 0.012);
        for (const x of [-0.045, 0.045]) part(new THREE.CylinderGeometry(0.009, 0.009, 0.14, 6), weiss, x, 1.1, fl(x, 1.1) - 0.006);
        zylZ(0.238, 0.238, 0.05, dunkler(0.84), 0, 0.765, 0);
        for (const arm of [leftArm, rightArm]) part(new THREE.CylinderGeometry(0.087, 0.087, 0.05, 12), dunkler(0.84), 0, -0.37, 0, arm);
        break;
      }
      case "jacke":
        kiste(0.022, 0.46, 0.012, weiss, 0, 0.99, vorn - 0.002);
        part(new THREE.CylinderGeometry(0.105, 0.115, 0.07, 18, 1, true), dunkler(0.8), 0, 1.255, 0).material.side = THREE.DoubleSide;
        for (const x of [-0.1, 0.1]) kiste(0.07, 0.022, 0.012, dunkler(0.75), x, 0.82, fl(Math.abs(x) + 0.035, 0.82) - 0.004);
        zylZ(0.238, 0.238, 0.05, weiss, 0, 0.765, 0);
        for (const arm of [leftArm, rightArm]) part(new THREE.CylinderGeometry(0.089, 0.089, 0.05, 12), weiss, 0, -0.37, 0, arm);
        break;
      case "top":
        break;
      case "overall": {
        kiste(0.25, 0.27, 0.03, clothes, 0, 0.95, fl(0.125, 0.95) - 0.012);
        for (const x of [-0.1, 0.1]) {
          kiste(0.05, 0.3, 0.025, clothes, x, 1.1, fl(Math.abs(x) + 0.025, 1.1) - 0.01);
          part(new THREE.SphereGeometry(0.02, 8, 6), mat("#f2c230", { roughness: 0.4, metalness: 0.4 }), x, 1.04, fl(Math.abs(x), 1.04) - 0.024);
        }
        break;
      }
      case "kleid": {
        part(new THREE.CylinderGeometry(0.22, 0.43, 0.42, 26), clothes, 0, 0.56, 0);
        zylZ(0.232, 0.232, 0.05, dunkler(0.7), 0, 0.77, 0);
        ring(0.095, 0.018, dunkler(0.85), 1.215);
        break;
      }
      case "anzug": {
        kiste(0.11, 0.3, 0.012, weiss, 0, 1.06, vorn - 0.002);
        kiste(0.05, 0.26, 0.012, mat("#c9302c", { roughness: 0.6 }), 0, 1.0, vorn - 0.012);
        kiste(0.06, 0.05, 0.014, mat("#c9302c", { roughness: 0.6 }), 0, 1.17, vorn - 0.012);
        for (const [x, w] of [[-0.085, 0.3], [0.085, -0.3]]) {
          const rev = kiste(0.07, 0.3, 0.014, dunkler(0.78), x, 1.04, vorn - 0.006);
          rev.rotation.z = w * 0.4;
        }
        for (const y of [0.86, 0.78]) part(new THREE.SphereGeometry(0.014, 8, 6), dark, 0.0, y, vorn - 0.01);
        for (const arm of [leftArm, rightArm]) part(new THREE.CylinderGeometry(0.084, 0.084, 0.04, 12), weiss, 0, -0.38, 0, arm);
        break;
      }
      case "raumanzug": {
        kiste(0.3, 0.42, 0.16, grau, 0, 0.98, 0.34);
        kiste(0.16, 0.1, 0.03, clothes, 0, 1.06, -0.2);
        for (const x of [-0.04, 0.04]) part(new THREE.SphereGeometry(0.016, 8, 6), mat("#ffcf40", { roughness: 0.4 }), x, 1.015, -0.22);
        zylZ(0.262, 0.262, 0.05, grau, 0, 0.765, 0, 0.82);
        ring(0.105, 0.035, grau, 1.215);
        for (const arm of [leftArm, rightArm]) part(new THREE.CylinderGeometry(0.098, 0.098, 0.09, 14), grau, 0, -0.4, 0, arm);
        const helm = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 18),
          neuerStoff({ color: "#bfe3ff", transparent: true, opacity: 0.26, roughness: 0.05, metalness: 0.1, depthWrite: false }));
        helm.position.set(0, 1.42, 0);
        helm.userData.figurTeil = true;
        group.add(helm);
        break;
      }
    }

  }

  const mundFarbe = mat("#7a3b2e", { roughness: 0.6 });
  const punkt = new THREE.SphereGeometry(og ? 0.03 : 0.028, 10, 8);
  part(punkt, eye, -0.07, 1.43, -0.172);
  part(punkt, eye, 0.07, 1.43, -0.172);
  const mundZ = -0.178;
  switch (l.mund) {
    case "laecheln": {
      const m = part(new THREE.TorusGeometry(0.032, 0.007, 6, 14, Math.PI), mundFarbe, 0, 1.385, mundZ);
      m.rotation.z = Math.PI;
      break;
    }
    case "grinsen": {
      const m = part(new THREE.TorusGeometry(0.05, 0.009, 6, 18, Math.PI), mundFarbe, 0, 1.395, mundZ + 0.004);
      m.rotation.z = Math.PI;
      break;
    }
    case "neutral": kiste(0.06, 0.011, 0.008, mundFarbe, 0, 1.37, mundZ); break;
    case "offen": {
      const m = part(new THREE.SphereGeometry(0.024, 10, 8), mundFarbe, 0, 1.372, mundZ + 0.006);
      m.scale.set(1, 1.2, 0.5);
      break;
    }
    case "traurig": part(new THREE.TorusGeometry(0.032, 0.007, 6, 14, Math.PI), mundFarbe, 0, 1.365, mundZ); break;
    default: break;
  }

  const kappe = (r = 0.2, y = 1.45, z = 0.015, material = hair) => {
    const h = part(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), material, 0, y, z);
    h.rotation.x = -0.25;
    return h;
  };
  switch (l.frisur) {
    case "kurz": kappe(); break;
    case "lang":
      kappe();
      kiste(0.36, 0.55, 0.1, hair, 0, 1.2, 0.16);
      break;
    case "zopf": {
      kappe();
      const z = part(new THREE.CapsuleGeometry(0.055, 0.3, 4, 8), hair, 0, 1.2, 0.25);
      z.rotation.x = 0.35;
      part(new THREE.SphereGeometry(0.045, 8, 8), mat("#e0479e"), 0, 1.4, 0.2);
      break;
    }
    case "irokese":
      for (let i = 0; i < 5; i++) kiste(0.04, 0.12 + (i === 2 ? 0.05 : 0), 0.1, hair, 0, 1.63, -0.14 + i * 0.07);
      break;
    case "afro": part(new THREE.SphereGeometry(0.28, 16, 14), hair, 0, 1.5, 0.04); break;
    case "dutt":
      kappe();
      part(new THREE.SphereGeometry(0.085, 12, 10), hair, 0, 1.67, 0.06);
      break;
    case "muetze":
      kappe(0.225, 1.45, 0.01);
      part(new THREE.SphereGeometry(0.05, 10, 8), weiss, 0, 1.67, 0.0);
      break;
  }

  group.userData = { leftLeg, rightLeg, leftArm, rightArm, clothes, eigeneStoffe };
}

export function setzeSitzen(figur, sitzen) {
  const u = figur.userData;
  const bein = sitzen ? Math.PI / 2 : 0;
  u.leftLeg.rotation.x = bein;
  u.rightLeg.rotation.x = bein;
  u.leftArm.rotation.x = sitzen ? 1.0 : 0;
  u.rightArm.rotation.x = sitzen ? 1.0 : 0;
}

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
