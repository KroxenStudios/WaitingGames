// dekoobjekte für fight-karten: kisten, fässer, container, zäune, sandsäcke, türme, zelte, büsche, kakteen, palmen, ruinen,
// tanks, panzersperren, masten und wracks. alle masse gelten für grösse 1 und wachsen mit dem faktor s.
import * as THREE from "three";

// reihenfolge = index im kartendokument (nicht ändern, nur anhängen); solide: quader [mx, my, mz, hx, hy, hz] für die kollision
export const DEKO = [
  { id: "kiste", de: "Kiste", en: "Crate", solide: [[0, 0.6, 0, 0.6, 0.6, 0.6]] },
  { id: "fass", de: "Fass", en: "Barrel", solide: [[0, 0.5, 0, 0.4, 0.5, 0.4]] },
  { id: "container", de: "Container", en: "Container", solide: [[0, 1.3, 0, 3, 1.3, 1.2]] },
  { id: "zaun", de: "Zaun", en: "Fence", solide: null },
  { id: "sandsaecke", de: "Sandsäcke", en: "Sandbags", solide: [[0, 0.55, 0, 2, 0.55, 0.5]] },
  { id: "turm", de: "Wachturm", en: "Watchtower", solide: [[-1, 2.7, -1, 0.15, 2.7, 0.15], [1, 2.7, -1, 0.15, 2.7, 0.15], [-1, 2.7, 1, 0.15, 2.7, 0.15], [1, 2.7, 1, 0.15, 2.7, 0.15], [0, 5.4, 0, 1.4, 0.15, 1.4], [0, 6.4, 0, 1, 0.9, 1]] },
  { id: "zelt", de: "Zelt", en: "Tent", solide: null },
  { id: "busch", de: "Busch", en: "Bush", solide: null },
  { id: "kaktus", de: "Kaktus", en: "Cactus", solide: null },
  { id: "palme", de: "Palme", en: "Palm", solide: null },
  { id: "ruine", de: "Ruine", en: "Ruin", solide: [[-1.6, 1.2, 0, 1.2, 1.2, 0.2], [0.6, 0.8, 0, 1, 0.8, 0.2], [2, 1.6, 0.4, 0.2, 1.6, 0.8]] },
  { id: "tank", de: "Tanklager", en: "Storage tank", solide: [[0, 1.6, 0, 1.7, 1.6, 1.7]] },
  { id: "sperre", de: "Panzersperre", en: "Tank trap", solide: [[0, 0.7, 0, 0.9, 0.7, 0.9]] },
  { id: "mast", de: "Mast", en: "Lamp post", solide: [[0, 3, 0, 0.12, 3, 0.12]] },
  { id: "wrack", de: "Wrack", en: "Wreck", solide: [[0, 0.8, 0, 2, 0.8, 1]] }
];

const matCache = new Map();
const mat = (farbe, extra = {}) => {
  const key = farbe + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.9, flatShading: true, ...extra }));
  return matCache.get(key);
};
const geoBox = new THREE.BoxGeometry(1, 1, 1);
const geoZyl = new THREE.CylinderGeometry(1, 1, 1, 10);
const geoKegel = new THREE.ConeGeometry(1, 1, 7);
const geoKugel = new THREE.IcosahedronGeometry(1, 0);

function teil(g, geo, farbe, pos, skal, rot = [0, 0, 0], extra) {
  const m = new THREE.Mesh(geo, mat(farbe, extra));
  m.position.set(...pos);
  m.scale.set(...skal);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

// ein dekoobjekt der art typ in grösse s (ohne drehung, steht auf y = 0)
export function baueDeko(typ, s = 1) {
  const g = new THREE.Group();
  switch (typ) {
    case 0:
      teil(g, geoBox, "#a07a45", [0, 0.6, 0], [1.2, 1.2, 1.2]);
      teil(g, geoBox, "#7d5c32", [0, 0.6, 0], [1.24, 0.12, 1.24]);
      break;
    case 1:
      teil(g, geoZyl, "#b8472f", [0, 0.5, 0], [0.4, 1, 0.4]);
      teil(g, geoZyl, "#8f3624", [0, 0.9, 0], [0.42, 0.06, 0.42]);
      teil(g, geoZyl, "#8f3624", [0, 0.1, 0], [0.42, 0.06, 0.42]);
      break;
    case 2:
      teil(g, geoBox, "#4a7fb0", [0, 1.3, 0], [6, 2.6, 2.4]);
      for (let i = -2; i <= 2; i++) teil(g, geoBox, "#3b6791", [i * 1.15, 1.3, 1.22], [0.12, 2.4, 0.08]);
      break;
    case 3:
      for (let i = -2; i <= 2; i++) teil(g, geoBox, "#6b6f75", [i * 1.25, 0.8, 0], [0.12, 1.6, 0.12]);
      teil(g, geoBox, "#8d9298", [0, 1.1, 0], [5, 0.9, 0.04], [0, 0, 0], { transparent: true, opacity: 0.55 });
      teil(g, geoBox, "#6b6f75", [0, 1.55, 0], [5, 0.08, 0.08]);
      break;
    case 4:
      for (let r = 0; r < 2; r++) for (let i = 0; i < 4 - r; i++) {
        teil(g, geoBox, r ? "#b09a6e" : "#c2ad80", [(i - (3 - r) / 2) * 1.0, 0.25 + r * 0.5, 0], [0.95, 0.5, 0.9]);
      }
      break;
    case 5:
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) teil(g, geoBox, "#6e5a3c", [x, 2.7, z], [0.3, 5.4, 0.3]);
      teil(g, geoBox, "#7a6446", [0, 5.4, 0], [2.8, 0.3, 2.8]);
      teil(g, geoBox, "#8a7352", [0, 6.4, 0], [2, 1.8, 2]);
      teil(g, geoKegel, "#5b4a33", [0, 7.7, 0], [1.9, 1, 1.9], [0, Math.PI / 4, 0]);
      teil(g, geoBox, "#2b2f36", [0, 6.5, 1.01], [1.4, 0.5, 0.05]);
      break;
    case 6:
      teil(g, geoKegel, "#8c9a6a", [0, 1.1, 0], [2.4, 2.2, 2.4], [0, Math.PI / 4, 0]);
      teil(g, geoBox, "#2b2f36", [0, 0.6, 1.2], [0.7, 1.1, 0.04], [0.3, 0, 0]);
      break;
    case 7:
      teil(g, geoKugel, "#3d8a45", [0, 0.55, 0], [0.9, 0.65, 0.9]);
      teil(g, geoKugel, "#4a9c50", [0.5, 0.4, 0.3], [0.55, 0.45, 0.55]);
      break;
    case 8:
      teil(g, geoZyl, "#5a8f4a", [0, 1.2, 0], [0.22, 2.4, 0.22]);
      teil(g, geoZyl, "#5a8f4a", [0.5, 1.5, 0], [0.16, 0.9, 0.16], [0, 0, 0.5]);
      teil(g, geoZyl, "#5a8f4a", [-0.5, 1.2, 0], [0.15, 0.8, 0.15], [0, 0, -0.5]);
      break;
    case 9:
      teil(g, geoZyl, "#7d6140", [0, 2.4, 0], [0.2, 4.8, 0.2], [0.06, 0, 0.05]);
      for (let i = 0; i < 6; i++) {
        const w = (i / 6) * Math.PI * 2;
        teil(g, geoBox, "#3f8f45", [Math.cos(w) * 0.9, 4.7, Math.sin(w) * 0.9], [1.9, 0.06, 0.5], [0, -w, 0.35]);
      }
      break;
    case 10:
      teil(g, geoBox, "#b4aa98", [-1.6, 1.2, 0], [2.4, 2.4, 0.4]);
      teil(g, geoBox, "#a89e8c", [0.6, 0.8, 0], [2, 1.6, 0.4]);
      teil(g, geoBox, "#9c9282", [2, 1.6, 0.4], [0.4, 3.2, 1.6]);
      break;
    case 11:
      teil(g, geoZyl, "#c8ccd1", [0, 1.6, 0], [1.7, 3.2, 1.7]);
      teil(g, geoKegel, "#9ea3a9", [0, 3.5, 0], [1.75, 0.6, 1.75]);
      teil(g, geoBox, "#7a7f86", [1.75, 1.2, 0], [0.1, 2.4, 0.3]);
      break;
    case 12:
      for (const r of [[0, 0, 0.8], [0, 0.8, 0], [0.8, 0, 0]]) teil(g, geoBox, "#7b7e82", [0, 0.7, 0], [0.18, 1.8, 0.18], r.map(v => v));
      break;
    case 13:
      teil(g, geoZyl, "#5f6368", [0, 3, 0], [0.1, 6, 0.1]);
      teil(g, geoBox, "#5f6368", [0.4, 5.9, 0], [0.9, 0.08, 0.08]);
      teil(g, geoBox, "#ffe9a8", [0.8, 5.8, 0], [0.3, 0.1, 0.2], [0, 0, 0], { emissive: "#ffd36b", emissiveIntensity: 0.6 });
      break;
    case 14:
      teil(g, geoBox, "#7a4a38", [0, 0.6, 0], [4, 0.8, 1.8]);
      teil(g, geoBox, "#6a4132", [-0.2, 1.2, 0], [2, 0.7, 1.6]);
      for (const [x, z] of [[-1.3, 0.9], [1.3, 0.9], [-1.3, -0.9], [1.3, -0.9]]) teil(g, geoZyl, "#2b2f36", [x, 0.35, z], [0.35, 0.3, 0.35], [Math.PI / 2, 0, 0]);
      break;
    default:
      teil(g, geoBox, "#999999", [0, 0.5, 0], [1, 1, 1]);
  }
  g.scale.setScalar(s);
  return g;
}
