// bastelkarre: große karte aus der fertig erzeugten datei welt.json (kein generieren zur laufzeit).
// die datei kommt aus nicht veröffentlichen/weltgenerator/weltgenerator.mjs und ist für alle spieler gleich.
import * as THREE from "three";

// ---------------------------------------------------------------------------
// laden
// ---------------------------------------------------------------------------
export async function ladeWeltDaten(url) {
  try {
    const antwort = await fetch(url);
    if (!antwort.ok) return null;
    const d = await antwort.json();
    if (d.v !== 1 || !d.hoehen) return null;
    const bin = atob(d.hoehen);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const q = new Int16Array(bytes.buffer);
    d.h = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) d.h[i] = q[i] * d.faktor;
    d.schritt = d.groesse / (d.n - 1);
    d.x0 = d.mitte[0] - d.groesse / 2;
    d.z0 = d.mitte[1] - d.groesse / 2;
    return d;
  } catch {
    return null; // ohne datei bleibt die flache arena
  }
}

// höhe des geländes an einer stelle (bilinear; index = x * n + z)
export function hoeheBei(d, x, z) {
  const n = d.n;
  const gx = Math.min(Math.max((x - d.x0) / d.schritt, 0), n - 1.0001);
  const gz = Math.min(Math.max((z - d.z0) / d.schritt, 0), n - 1.0001);
  const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
  const h = d.h;
  const a = h[ix * n + iz] * (1 - fx) + h[(ix + 1) * n + iz] * fx;
  const b = h[ix * n + iz + 1] * (1 - fx) + h[(ix + 1) * n + iz + 1] * fx;
  return a * (1 - fz) + b * fz;
}

// ---------------------------------------------------------------------------
// texturen
// ---------------------------------------------------------------------------
function rauschTextur() {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#cfcfcf";
  ctx.fillRect(0, 0, s, s);
  let seed = 4711;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 2600; i++) {
    const v = 150 + Math.floor(rnd() * 100);
    ctx.fillStyle = `rgba(${v},${v},${v},${0.25 + rnd() * 0.35})`;
    ctx.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function wegTextur() {
  const w = 128, hh = 256;
  const c = document.createElement("canvas");
  c.width = w; c.height = hh;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#4b4e53";
  ctx.fillRect(0, 0, w, hh);
  let seed = 99;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 1500; i++) {
    const v = 60 + Math.floor(rnd() * 40);
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 5},0.4)`;
    ctx.fillRect(rnd() * w, rnd() * hh, 2, 2);
  }
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(w * 0.06, 0, 4, hh);
  ctx.fillRect(w * 0.94 - 4, 0, 4, hh);
  ctx.fillStyle = "#ffd43b";
  ctx.fillRect(w / 2 - 2, 0, 4, hh / 2);        // gestrichelte mittellinie: 8 m strich, 8 m lücke
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------------------
// aufbau
// ---------------------------------------------------------------------------
const HAUS_FARBEN = ["#d8cfc0", "#c9b79c", "#b8a58a", "#9fa8b3", "#c97b63", "#e0dacd", "#e5484d"];

// rapier, world, scene, box(pos, halb, quat, farbe): hilfsfunktionen aus spiel.js
export function baueGelaende({ d, RAPIER, world, scene, box }) {
  const n = d.n, s = d.schritt;

  // --- gelände: mesh mit vertexfarben ---
  const pos = new Float32Array(n * n * 3), farben = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
  const f = new THREE.Color();
  const gras = new THREE.Color("#5f9f50"), wald = new THREE.Color("#3f7d44"), fels = new THREE.Color("#8d8a84"), schnee = new THREE.Color("#eef2f7"), trocken = new THREE.Color("#a6a86a");
  for (let ix = 0; ix < n; ix++) {
    for (let iz = 0; iz < n; iz++) {
      const k = ix * n + iz;
      const x = d.x0 + ix * s, z = d.z0 + iz * s, y = d.h[k];
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = x / 90; uv[k * 2 + 1] = z / 90;
      const hx = d.h[Math.min(n - 1, ix + 1) * n + iz] - d.h[Math.max(0, ix - 1) * n + iz];
      const hz = d.h[ix * n + Math.min(n - 1, iz + 1)] - d.h[ix * n + Math.max(0, iz - 1)];
      const neigung = Math.hypot(hx, hz) / (2 * s);
      // grundfarbe nach höhe, dazu leichte schwankung pro punkt
      const wechsel = (Math.sin(ix * 12.9898 + iz * 78.233) * 43758.5453) % 1;
      f.copy(gras).lerp(wald, Math.min(1, Math.max(0, (y - 20) / 220))).lerp(trocken, 0.18 + 0.12 * wechsel);
      f.lerp(fels, Math.min(1, Math.max(0, (neigung - 0.28) / 0.25)));
      f.lerp(fels, Math.min(1, Math.max(0, (y - 300) / 200)) * 0.7);
      f.lerp(schnee, Math.min(1, Math.max(0, (y - 520) / 160)) * (1 - Math.min(1, Math.max(0, (neigung - 0.7) / 0.6))));
      farben[k * 3] = f.r; farben[k * 3 + 1] = f.g; farben[k * 3 + 2] = f.b;
    }
  }
  const index = new Uint32Array((n - 1) * (n - 1) * 6);
  let t = 0;
  for (let ix = 0; ix < n - 1; ix++) {
    for (let iz = 0; iz < n - 1; iz++) {
      const a = ix * n + iz, b = (ix + 1) * n + iz, c = ix * n + iz + 1, e = (ix + 1) * n + iz + 1;
      index[t++] = a; index[t++] = c; index[t++] = b;
      index[t++] = b; index[t++] = c; index[t++] = e;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(farben, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: rauschTextur(), roughness: 1 }));
  mesh.receiveShadow = true;
  scene.add(mesh);

  // --- kollision: höhenfeld (index = x * n + z, mitte der karte im ursprung der verschiebung) ---
  world.createCollider(
    RAPIER.ColliderDesc.heightfield(n - 1, n - 1, d.h, { x: d.groesse, y: 1, z: d.groesse })
      .setTranslation(d.mitte[0], 0, d.mitte[1]).setFriction(0.95)
  );

  // --- straßen: bänder auf dem gelände ---
  const wt = wegTextur();
  const wegMat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const w of d.wege) {
    const pts = [];
    for (let i = 0; i < w.length; i += 2) pts.push([w[i], w[i + 1]]);
    const feinPos = [], feinUV = [];
    let strecke = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      const tx = q[0] - o[0], tz = q[1] - o[1], l = Math.hypot(tx, tz) || 1;
      const nx = -tz / l, nz = tx / l;
      if (i > 0) strecke += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      for (const seite of [-1, 1]) {
        const x = p[0] + nx * 5.5 * seite, z = p[1] + nz * 5.5 * seite;
        feinPos.push(x, hoeheBei(d, x, z) + 0.05, z);
        feinUV.push(seite < 0 ? 0 : 1, strecke / 16);
      }
    }
    const idx2 = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, e = i * 2 + 3;
      idx2.push(a, c, b, b, c, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(feinPos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(feinUV, 2));
    g.setIndex(idx2);
    g.computeVertexNormals();
    // die normalen zeigen je nach reihenfolge nach unten: dann index umdrehen
    if (g.attributes.normal.getY(0) < 0) {
      idx2.length = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, e = i * 2 + 3;
        idx2.push(a, b, c, b, e, c);
      }
      g.setIndex(idx2);
      g.computeVertexNormals();
    }
    const band = new THREE.Mesh(g, wegMat);
    band.receiveShadow = true;
    band.frustumCulled = false;
    scene.add(band);
  }

  // --- gebäude (mit kollision) ---
  for (const [x, z, bw, bd, bh, rot, farbe] of d.gebaeude) {
    const y0 = hoeheBei(d, x, z);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rot);
    box(new THREE.Vector3(x, y0 + bh / 2 - 0.3, z), [bw / 2, bh / 2 + 0.3, bd / 2], q, HAUS_FARBEN[farbe] || "#cccccc");
  }

  // --- bäume und felsen (nur optik, als instanzen) ---
  const anzahl = d.baeume.length / 3;
  if (anzahl) {
    const kronen = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.4, 7), new THREE.MeshStandardMaterial({ roughness: 1 }), anzahl);
    const staemme = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), new THREE.MeshStandardMaterial({ color: "#6b4a2d", roughness: 1 }), anzahl);
    const m4 = new THREE.Matrix4(), farbe = new THREE.Color(), q = new THREE.Quaternion();
    const palette = ["#2f8f4e", "#3aa35a", "#2a7d46", "#4a9a40"];
    for (let k = 0; k < anzahl; k++) {
      const x = d.baeume[k * 3], z = d.baeume[k * 3 + 1], sc = d.baeume[k * 3 + 2];
      const y = hoeheBei(d, x, z);
      m4.compose(new THREE.Vector3(x, y + sc * 0.5, z), q, new THREE.Vector3(sc * 0.45, sc * 0.5, sc * 0.45));
      staemme.setMatrixAt(k, m4);
      m4.compose(new THREE.Vector3(x, y + sc * 1.05, z), q, new THREE.Vector3(sc * 0.7, sc * 0.7, sc * 0.7));
      kronen.setMatrixAt(k, m4);
      kronen.setColorAt(k, farbe.set(palette[k % 4]));
    }
    kronen.frustumCulled = staemme.frustumCulled = false;
    scene.add(kronen, staemme);
  }
  const felsAnzahl = d.felsen.length / 3;
  if (felsAnzahl) {
    const steine = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: "#8a8780", roughness: 1, flatShading: true }), felsAnzahl);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let k = 0; k < felsAnzahl; k++) {
      const x = d.felsen[k * 3], z = d.felsen[k * 3 + 1], sc = d.felsen[k * 3 + 2];
      e.set(k * 1.7, k * 2.3, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, hoeheBei(d, x, z) + sc * 0.25, z), q, new THREE.Vector3(sc, sc * 0.65, sc * 0.9));
      steine.setMatrixAt(k, m4);
    }
    steine.frustumCulled = false;
    scene.add(steine);
  }
}
