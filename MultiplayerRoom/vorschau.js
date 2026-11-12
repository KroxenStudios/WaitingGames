import * as THREE from "three";
import { spielfigur, figurAktualisieren, textSprite, entsorge } from "./teile3d.js";
import { lookAus } from "./look.js";

export function startVorschau(container, start = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  container.append(renderer.domElement);
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none;cursor:grab";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.25, 4.6);
  camera.lookAt(0, 1.05, 0);
  scene.add(new THREE.HemisphereLight("#dbe8ff", "#3a3f4a", 1.5));
  const sonne = new THREE.DirectionalLight("#ffffff", 2.2);
  sonne.position.set(2.5, 4, 3);
  scene.add(sonne);

  const boden = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.04, 40), new THREE.MeshStandardMaterial({ color: "#2b3546", roughness: 0.9 }));
  boden.position.y = -0.02;
  scene.add(boden);

  const drehpunkt = new THREE.Group();
  scene.add(drehpunkt);
  let figur = null, schild = null;
  const zustand = { name: start.name || "Gast", color: start.color || "#62e6b2", look: lookAus(start.look) };

  function aktualisiere() {
    if (!figur) {
      figur = spielfigur(zustand.color, zustand.look);
      drehpunkt.add(figur);
    } else {
      figurAktualisieren(figur, zustand.color, zustand.look);
    }
  }
  function setzeName(name) {
    if (schild) { scene.remove(schild); entsorge(schild); }
    schild = textSprite(name);
    schild.position.set(0, 2.05, 0);
    scene.add(schild);
  }
  aktualisiere();
  setzeName(zustand.name);

  let ziehen = false, letzteX = 0, pause = 0;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", e => { ziehen = true; letzteX = e.clientX; el.setPointerCapture(e.pointerId); el.style.cursor = "grabbing"; });
  el.addEventListener("pointermove", e => { if (!ziehen) return; drehpunkt.rotation.y += (e.clientX - letzteX) * 0.012; letzteX = e.clientX; pause = performance.now() + 2500; });
  const los = () => { ziehen = false; el.style.cursor = "grab"; };
  el.addEventListener("pointerup", los);
  el.addEventListener("pointercancel", los);

  window.addEventListener("krox-look", e => {
    const d = e.detail || {};
    if (typeof d.name === "string" && d.name !== zustand.name) { zustand.name = d.name; setzeName(d.name); }
    if (typeof d.color === "string") zustand.color = d.color;
    if (d.look) zustand.look = lookAus(d.look);
    aktualisiere();
  });

  function groesse() {
    const w = container.clientWidth || 300, h = container.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(groesse).observe(container);
  groesse();

  let zuletzt = performance.now();
  (function schleife(t) {
    const dt = Math.min(0.05, (t - zuletzt) / 1000);
    zuletzt = t;
    if (!ziehen && t > pause) drehpunkt.rotation.y += dt * 0.6;
    renderer.render(scene, camera);
    requestAnimationFrame(schleife);
  })(zuletzt);
}
