// vorschaubild eines fahrzeugs: wird im browser des hochladenden gezeichnet (kleines webp/jpeg) und
// mit dem upload an den server geschickt. der server prüft nur dateityp und größe.
import * as THREE from "three";
import { fahrzeugGrafik, entsorge } from "./teile3d.js";
import { bereinige } from "./bau.js";

const MAX_ZEICHEN = 55000;   // der server erlaubt 60 000

export function modellbild(planText) {
  const plan = bereinige(JSON.parse(planText));
  const gr = fahrzeugGrafik(plan);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1b2536");
  scene.add(new THREE.HemisphereLight("#dbe8ff", "#3a3f4a", 1.7));
  const sonne = new THREE.DirectionalLight("#ffffff", 2.4);
  sonne.position.set(4, 7, 5);
  scene.add(sonne);

  gr.groups.forEach((g, i) => {
    const u = gr.ana.bodies[i].ursprung;
    g.position.set(u[0], u[1], u[2]);
    scene.add(g);
  });

  const box = new THREE.Box3();
  for (const g of gr.groups) box.expandByObject(g);
  if (box.isEmpty()) throw new Error("leeres Fahrzeug");
  const mitte = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.5);

  // boden als standfläche, damit man größe und lage erkennt
  const boden = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.3, 40), new THREE.MeshStandardMaterial({ color: "#2b3546", roughness: 0.95 }));
  boden.rotation.x = -Math.PI / 2;
  boden.position.set(mitte.x, box.min.y - 0.02, mitte.z);
  scene.add(boden);

  const kamera = new THREE.PerspectiveCamera(32, 16 / 10, 0.05, 500);
  const abstand = (radius / Math.sin(THREE.MathUtils.degToRad(32 / 2))) * 0.62;
  kamera.position.copy(mitte).add(new THREE.Vector3(0.85, 0.6, 1.05).normalize().multiplyScalar(abstand));
  kamera.lookAt(mitte);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  let url = "";
  try {
    for (const [breite, hoehe, qualitaet] of [[256, 160, 0.82], [256, 160, 0.6], [192, 120, 0.5]]) {
      renderer.setPixelRatio(1);
      renderer.setSize(breite, hoehe, false);
      renderer.render(scene, kamera);
      url = renderer.domElement.toDataURL("image/webp", qualitaet);
      if (!url.startsWith("data:image/webp")) url = renderer.domElement.toDataURL("image/jpeg", qualitaet);
      if (url.length <= MAX_ZEICHEN) break;
    }
  } finally {
    for (const g of gr.groups) entsorge(g);
    boden.geometry.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
  }
  if (url.length > MAX_ZEICHEN) throw new Error("Vorschaubild zu groß");
  return url;
}
