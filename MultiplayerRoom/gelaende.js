import * as THREE from "three";
import { DEKO, baueDeko } from "./deko.js";

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
    return null;
  }
}

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
  ctx.fillRect(w / 2 - 2, 0, 4, hh / 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export // gute geländetexturen (pc): vier prozedurale kacheln, per vertex-gewicht gemischt. handhelds behalten das einfache material.
const handheld = () => typeof document !== "undefined" && document.body.classList.contains("touch");
let detailTexturen = null;
function detailKachel(art) {
  const s = 256, c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d"), bild = ctx.createImageData(s, s);
  let seed = 17 + art * 101;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  // kachelbares wertrauschen auf gittern der kantenlängen 4..64
  const gitter = n => Array.from({ length: n * n }, rnd);
  const g = [4, 8, 16, 32, 64].map(gitter);
  const rausch = (x, y) => {
    let v = 0, a = 0.5, n = 0;
    g.forEach((gi, o) => {
      const m = 4 << o, fx = (x / s) * m, fy = (y / s) * m, ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const h = (i, j) => gi[((j % m) * m) + (i % m)];
      const w = h(ix, iy) * (1 - sx) * (1 - sy) + h(ix + 1, iy) * sx * (1 - sy) + h(ix, iy + 1) * (1 - sx) * sy + h(ix + 1, iy + 1) * sx * sy;
      v += w * a; n += a; a *= 0.6;
    });
    return v / n;
  };
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const r = rausch(x, y);
      let l;
      if (art === 0) l = 0.55 + (r - 0.5) * 0.9 + (rausch(x * 4 % s, y) - 0.5) * 0.25;          // gras: längliche halme
      else if (art === 1) l = 0.6 + (r - 0.5) * 0.7 + (rnd() - 0.5) * 0.25;                       // erde: körnig
      else if (art === 2) l = 0.5 + (Math.abs(r - 0.5) < 0.05 ? -0.3 : 0) + (r - 0.5) * 0.8;      // fels: risse
      else l = 0.82 + (r - 0.5) * 0.35 + (rnd() - 0.5) * 0.06;                                    // schnee/sand: weich
      const v = Math.max(0, Math.min(255, l * 255));
      const i = (y * s + x) * 4;
      bild.data[i] = bild.data[i + 1] = bild.data[i + 2] = v;
      bild.data[i + 3] = 255;
    }
  }
  ctx.putImageData(bild, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function geländeMaterial() {
  detailTexturen ||= [0, 1, 2, 3].map(detailKachel);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  mat.onBeforeCompile = sh => {
    detailTexturen.forEach((t, i) => { sh.uniforms["tex" + i] = { value: t }; });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec4 splat;
varying vec4 vSplat;
varying vec2 vTW;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vSplat = splat; vTW = position.xz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
uniform sampler2D tex0, tex1, tex2, tex3;
varying vec4 vSplat;
varying vec2 vTW;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec2 u1 = vTW / 7.0, u2 = vTW / 41.0 + 0.37;
        vec4 w = vSplat / max(0.001, dot(vSplat, vec4(1.0)));
        vec3 nah = texture2D(tex0, u1).rgb * w.x + texture2D(tex1, u1).rgb * w.y + texture2D(tex2, u1 * 0.6).rgb * w.z + texture2D(tex3, u1).rgb * w.w;
        vec3 fern = texture2D(tex0, u2).rgb * w.x + texture2D(tex1, u2).rgb * w.y + texture2D(tex2, u2).rgb * w.z + texture2D(tex3, u2).rgb * w.w;
        diffuseColor.rgb *= nah * fern * 2.6;`);
  };
  return mat;
}

export const HAUS_FARBEN = ["#d8cfc0", "#c9b79c", "#b8a58a", "#9fa8b3", "#c97b63", "#e0dacd", "#e5484d"];

export function baueGelaende({ d, RAPIER, world, scene, box }) {
  const n = d.n, s = d.schritt;

  const gut = d.gut ?? !handheld();
  const splat = gut ? new Float32Array(n * n * 4) : null;
  const pos = new Float32Array(n * n * 3), farben = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
  const f = new THREE.Color();
  // karten (fight) können eine eigene farbpalette mitbringen
  const pal = d.palette || {};
  const gras = new THREE.Color(pal.gras || "#5f9f50"), wald = new THREE.Color(pal.wald || "#3f7d44"), fels = new THREE.Color(pal.fels || "#8d8a84"), schnee = new THREE.Color(pal.schnee || "#eef2f7"), trocken = new THREE.Color(pal.trocken || "#a6a86a");
  for (let ix = 0; ix < n; ix++) {
    for (let iz = 0; iz < n; iz++) {
      const k = ix * n + iz;
      const x = d.x0 + ix * s, z = d.z0 + iz * s, y = d.h[k];
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = x / 90; uv[k * 2 + 1] = z / 90;
      const hx = d.h[Math.min(n - 1, ix + 1) * n + iz] - d.h[Math.max(0, ix - 1) * n + iz];
      const hz = d.h[ix * n + Math.min(n - 1, iz + 1)] - d.h[ix * n + Math.max(0, iz - 1)];
      const neigung = Math.hypot(hx, hz) / (2 * s);
      const wechsel = (Math.sin(ix * 12.9898 + iz * 78.233) * 43758.5453) % 1;
      f.copy(gras).lerp(wald, Math.min(1, Math.max(0, (y - 20) / 220))).lerp(trocken, 0.18 + 0.12 * wechsel);
      f.lerp(fels, Math.min(1, Math.max(0, (neigung - 0.28) / 0.25)));
      f.lerp(fels, Math.min(1, Math.max(0, (y - 300) / 200)) * 0.7);
      f.lerp(schnee, Math.min(1, Math.max(0, (y - 520) / 160)) * (1 - Math.min(1, Math.max(0, (neigung - 0.7) / 0.6))));
      if (splat) {
        const fl = Math.min(1, Math.max(0, (neigung - 0.28) / 0.25)), hoch = Math.min(1, Math.max(0, (y - 300) / 200)), sch = Math.min(1, Math.max(0, (y - 520) / 160));
        const fels_ = Math.max(fl, hoch * 0.7), trock = 0.18 + 0.12 * wechsel;
        splat[k * 4 + 2] = fels_;
        splat[k * 4 + 3] = sch * (1 - fels_);
        splat[k * 4 + 1] = (1 - fels_) * trock * 1.6;
        splat[k * 4] = Math.max(0.02, (1 - fels_) * (1 - trock * 1.6));
      }
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
  if (splat) geo.setAttribute("splat", new THREE.BufferAttribute(splat, 4));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, gut ? geländeMaterial() : new THREE.MeshStandardMaterial({ vertexColors: true, map: rauschTextur(), roughness: 1 }));
  mesh.receiveShadow = true;
  scene.add(mesh);

  // der karteneditor baut nur die anzeige (world = null)
  if (world) {
    world.createCollider(
      RAPIER.ColliderDesc.heightfield(n - 1, n - 1, d.h, { x: d.groesse, y: 1, z: d.groesse })
        .setTranslation(d.mitte[0], 0, d.mitte[1]).setFriction(0.95)
    );
  }

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

  for (const [x, z, bw, bd, bh, rot, farbe] of d.gebaeude) {
    const y0 = hoeheBei(d, x, z);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rot);
    box(new THREE.Vector3(x, y0 + bh / 2 - 0.3, z), [bw / 2, bh / 2 + 0.3, bd / 2], q, HAUS_FARBEN[farbe] || "#cccccc");
  }

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
      // auf fight-karten sind felsen echte deckung
      if (d.felsenKollision && world) {
        world.createCollider(RAPIER.ColliderDesc.ball(sc * 0.7).setTranslation(x, hoeheBei(d, x, z) + sc * 0.25, z).setFriction(0.9));
      }
    }
    steine.frustumCulled = false;
    scene.add(steine);
  }
  // dekoobjekte (fight-karten): modell aufs gelände stellen, feste arten bekommen quader-kollider
  for (const [x, z, typ, sc, rot] of d.deko || []) {
    const y0 = hoeheBei(d, x, z);
    const g = baueDeko(typ, sc);
    g.position.set(x, y0 - 0.05, z);
    g.rotation.y = -rot;
    scene.add(g);
    const fest = DEKO[typ]?.solide;
    if (!fest || !world) continue;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rot);
    for (const [mx, my, mz, hx, hy, hz] of fest) {
      const v = new THREE.Vector3(mx * sc, my * sc, mz * sc).applyQuaternion(q);
      world.createCollider(RAPIER.ColliderDesc.cuboid(hx * sc, hy * sc, hz * sc).setTranslation(x + v.x, y0 + v.y, z + v.z).setRotation(q).setFriction(0.8));
    }
  }
}
