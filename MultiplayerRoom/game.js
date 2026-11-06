import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const game = document.querySelector("#game");
const statusEl = document.querySelector("#status");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatMessages = document.querySelector("#chatMessages");
const joystick = document.querySelector("#joystick");
const stick = document.querySelector("#stick");

// Einstellungen von der Charakterseite laden
let characterSettings = {};

try {
  characterSettings = JSON.parse(
    localStorage.getItem("characterSettings") || "{}"
  );
} catch {
  characterSettings = {};
}

const playerName =
  (characterSettings.name || "Gast")
    .trim()
    .slice(0, 20) || "Gast";

const playerColor = characterSettings.color || "#62e6b2";

// Auf GitHub Pages gibt es keinen /ws-Endpunkt: dort mit dem Cloudflare-Worker verbinden.
const WORKER_HOST = "lobby-01-multiplayerroom-waitinggames.kroxenstudios.workers.dev";
const isWorkerHost =
  location.host === WORKER_HOST ||
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1";
const socketUrl = isWorkerHost
  ? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`
  : `wss://${WORKER_HOST}/ws`;
const socket = new WebSocket(socketUrl);

let myId = null;
let players = [];
let chatItems = [];

const cameraDirection = {
  yaw: 0,
  pitch: 0.18
};

let lookPointer = null;
let lastLookX = 0;
let lastLookY = 0;

let joystickPointer = null;
let joystickX = 0;
let joystickY = 0;

let lastMoveSent = 0;
let lastSentX = null;
let lastSentZ = null;
let previousFrameTime = 0;

// Sprungphysik
let verticalVelocity = 0;
let isGrounded = true;

const gravity = 18;
const jumpStrength = 7;

// Beinanimation
let walkCycle = 0;
const walkSpeed = 10;
const legSwingAmount = 0.55;

const keys = new Set();
const otherPlayerMeshes = new Map();

// Himmel: senkrechter Farbverlauf, der zum Nebel am Horizont passt.
function makeSkyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);

  gradient.addColorStop(0, "#5fb4f0");
  gradient.addColorStop(0.55, "#a9dbf5");
  gradient.addColorStop(1, "#d8f0f7");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const scene = new THREE.Scene();
scene.background = makeSkyTexture();
scene.fog = new THREE.Fog("#cdebf5", 30, 80);

const camera = new THREE.PerspectiveCamera(
  68,
  window.innerWidth / window.innerHeight,
  0.1,
  140
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.id = "scene";
renderer.domElement.setAttribute("aria-label", "3D-Spielraum");
game.prepend(renderer.domElement);

// Beleuchtung: warmes Sonnenlicht, kühles Himmelslicht
scene.add(new THREE.HemisphereLight(0xcfeaff, 0x4d6b45, 1.7));

const mainLight = new THREE.DirectionalLight(0xfff0d2, 2.7);
mainLight.position.set(-9, 15, 7);
mainLight.castShadow = true;
mainLight.shadow.mapSize.set(2048, 2048);
mainLight.shadow.camera.left = -15;
mainLight.shadow.camera.right = 15;
mainLight.shadow.camera.top = 15;
mainLight.shadow.camera.bottom = -15;
mainLight.shadow.camera.near = 1;
mainLight.shadow.camera.far = 50;
mainLight.shadow.camera.updateProjectionMatrix();
mainLight.shadow.bias = -0.0004;
mainLight.shadow.normalBias = 0.03;
scene.add(mainLight);

// Alle Clients sehen dieselbe Deko: feste Zufallsfolge statt Math.random().
let decorSeed = 1337;
function decorRandom() {
  decorSeed = (decorSeed * 16807) % 2147483647;
  return (decorSeed - 1) / 2147483646;
}

function pick(list) {
  return list[Math.floor(decorRandom() * list.length)];
}

function addMesh(geometry, material, x, y, z, { cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  scene.add(mesh);
  return mesh;
}

// Boden: selbst gezeichnete Rasentextur, kein Bild nötig.
function makeGrassTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#68b45c";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2600; i++) {
    const x = decorRandom() * size;
    const y = decorRandom() * size;
    const light = decorRandom() > 0.5;

    ctx.fillStyle = light
      ? `rgba(150, 214, 110, ${0.12 + decorRandom() * 0.2})`
      : `rgba(40, 110, 60, ${0.1 + decorRandom() * 0.2})`;
    ctx.fillRect(x, y, 2, 3 + decorRandom() * 4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.repeat.set(5, 5);
  return texture;
}


// ---------------------------------------------------------------------------
// Welt: 40 x 40, natürlicher Stil, mit kleinem Jump-n-Run.
// ---------------------------------------------------------------------------
const HALF = 20;          // halbe Kartengröße
const LIMIT = HALF - 1.2; // so weit darf man laufen

// Kollisionskörper: Boxen und Kreise mit Oberkante "top".
// Man kann auf ihnen stehen; ist die Kante höher als ein kleiner Schritt,
// blockieren sie seitlich.
const colliders = [];

// Weite Wiese außerhalb der Karte
const farGround = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: "#5aa04f", roughness: 1 })
);
farGround.rotation.x = -Math.PI / 2;
farGround.position.y = -0.08;
farGround.receiveShadow = true;
scene.add(farGround);

const floorTexture = makeGrassTexture();
floorTexture.repeat.set(8, 8);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(HALF * 2, HALF * 2),
  new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.03;
floor.receiveShadow = true;
scene.add(floor);

scene.add(mainLight.target);

// Ferne Hügel als Kulisse (vom Nebel weichgezeichnet)
for (let i = 0; i < 16; i++) {
  const angle = (i / 16) * Math.PI * 2 + decorRandom() * 0.3;
  const dist = 46 + decorRandom() * 14;
  const hill = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 10),
    new THREE.MeshStandardMaterial({
      color: pick(["#4f9a55", "#468c4d", "#5aa65c"]),
      roughness: 1
    })
  );
  hill.scale.set(
    9 + decorRandom() * 9,
    3 + decorRandom() * 4,
    9 + decorRandom() * 9
  );
  hill.position.set(Math.cos(angle) * dist, -0.5, Math.sin(angle) * dist);
  scene.add(hill);
}

// Steinplatz in der Mitte mit leuchtendem Startpunkt
function addDisc(radius, color, y, extra = {}) {
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 56),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = y;
  disc.receiveShadow = true;
  scene.add(disc);
  return disc;
}

addDisc(3.7, "#b9ad94", 0.01);
addDisc(3.4, "#ddd5c2", 0.02);
addDisc(1.2, "#c9bfa7", 0.03);
addDisc(0.9, "#62e6b2", 0.04, {
  emissive: new THREE.Color("#62e6b2"),
  emissiveIntensity: 0.35,
  roughness: 0.5
});

// Begrenzung: niedrige Hecken
const hedgeMaterial = new THREE.MeshStandardMaterial({
  color: "#3a7a47",
  roughness: 1
});

function addWall(x, z, width, depth) {
  addMesh(new THREE.BoxGeometry(width, 1.1, depth), hedgeMaterial, x, 0.55, z);
}

addWall(0, -HALF, HALF * 2 + 1, 0.9);
addWall(0, HALF, HALF * 2 + 1, 0.9);
addWall(-HALF, 0, 0.9, HALF * 2 + 1);
addWall(HALF, 0, 0.9, HALF * 2 + 1);

// Materialien
const rockMaterial = new THREE.MeshStandardMaterial({
  color: "#9aa3ab",
  roughness: 0.95,
  flatShading: true
});
const mossMaterial = new THREE.MeshStandardMaterial({
  color: "#5f9e4f",
  roughness: 1
});
const woodMaterial = new THREE.MeshStandardMaterial({
  color: "#8a6240",
  roughness: 0.95
});
const woodRingMaterial = new THREE.MeshStandardMaterial({
  color: "#d9b88a",
  roughness: 0.9
});
const trunkMaterial = new THREE.MeshStandardMaterial({
  color: "#7a5636",
  roughness: 1
});
const leafMaterials = ["#2f8f4e", "#3aa35a", "#2a7d46"].map(
  color => new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
);

const lampPoleMaterialShared = new THREE.MeshStandardMaterial({
  color: "#3a4352",
  roughness: 0.6,
  metalness: 0.4
});

// Bereiche, in denen keine Zufallsdeko steht
const zones = [
  { x: 0, z: 0, r: 6.2 },        // Platz
  { x: 9, z: 9, r: 6 },          // Teich
  { x: 10, z: -10.5, r: 10.5 },  // Felsenaufstieg
  { x: -10, z: 10, r: 7.5 }      // Baumhaus
];
const placed = [];

function inZone(x, z, extra = 0) {
  return zones.some(zone => Math.hypot(zone.x - x, zone.z - z) < zone.r + extra);
}

function isFree(x, z, spacing) {
  return placed.every(p => Math.hypot(p.x - x, p.z - z) > spacing);
}

// Felssäule mit Moosdach: begehbar
function addColumn(x, z, radius, top, side = rockMaterial, cap = mossMaterial) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.9, radius, top, 8),
    [side, cap, side]
  );
  mesh.position.set(x, top / 2, z);
  mesh.rotation.y = decorRandom() * 3;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  colliders.push({ type: "circle", x, z, r: radius, top });
}

// Plattform (Box) mit Moos- oder Holzdach
function addPlatform(x, z, hw, hd, top, side = rockMaterial, cap = mossMaterial) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(hw * 2, top, hd * 2),
    [side, side, cap, side, side, side]
  );
  mesh.position.set(x, top / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  colliders.push({ type: "box", x, z, hw, hd, top });
}

function addTree(x, z, scale, solid = true) {
  addMesh(
    new THREE.CylinderGeometry(0.13 * scale, 0.19 * scale, 1.3 * scale, 7),
    trunkMaterial,
    x,
    0.65 * scale,
    z
  );

  const leaves = pick(leafMaterials);
  addMesh(new THREE.ConeGeometry(1 * scale, 1.7 * scale, 9), leaves, x, 1.9 * scale, z);
  addMesh(new THREE.ConeGeometry(0.75 * scale, 1.4 * scale, 9), leaves, x, 2.7 * scale, z);

  if (solid) {
    colliders.push({ type: "circle", x, z, r: 0.28 * scale + 0.1, top: 99 });
  }
}

// --- Jump-n-Run 1: Felsenaufstieg im Nordosten, Ziel mit Flagge ----------
addColumn(5.5, -5.2, 1.0, 0.6);
addColumn(8.5, -6.6, 0.95, 1.2);
addColumn(11.5, -5.8, 0.9, 1.8);
addColumn(14.5, -7.6, 1.0, 2.4);
addColumn(15.4, -11.2, 1.0, 3.0);
addColumn(12.6, -13.6, 1.0, 3.6);
addPlatform(7.6, -15.6, 3.4, 2.6, 4.2);

// Flagge und Baum auf dem Plateau
addMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), lampPoleMaterialShared, 9.2, 4.2 + 1.2, -15.8);
const flagCloth = addMesh(
  new THREE.PlaneGeometry(1.1, 0.7),
  new THREE.MeshStandardMaterial({
    color: "#e5484d",
    side: THREE.DoubleSide,
    roughness: 0.8
  }),
  9.75,
  4.2 + 2.0,
  -15.8,
  { cast: false }
);
addTree(5.2, -17.2, 1.2);

// --- Jump-n-Run 2: Baumstumpf-Treppe zum Baumhaus im Südwesten -----------
addColumn(-6.4, 6.4, 0.7, 0.6, woodMaterial, woodRingMaterial);
addColumn(-8.6, 8.4, 0.7, 1.2, woodMaterial, woodRingMaterial);
addColumn(-10.8, 10.2, 0.7, 1.8, woodMaterial, woodRingMaterial);
addPlatform(-13.8, 13.2, 2.4, 2.4, 2.4, woodMaterial, woodRingMaterial);
addTree(-16.6, 16.2, 1.7);

// Kleine Holzbank-Stufe auf dem Platz: leichter Einstieg ins Springen
addPlatform(3.9, 3.9, 0.9, 0.5, 0.45, woodMaterial, woodRingMaterial);

// --- Teich im Südosten mit Trittsteinen -----------------------------------
const pond = addDisc(4, "#3f93bb", 0.015, { roughness: 0.25, metalness: 0.1 });
pond.position.x = 9;
pond.position.z = 9;
for (const [x, z] of [[7.2, 7.2], [9.2, 8.8], [10.8, 10.6], [12.4, 12.2]]) {
  addColumn(x, z, 0.62, 0.3);
}

// Bäume, Steine, Büsche
for (let tries = 0; tries < 400 && placed.length < 28; tries++) {
  const x = (decorRandom() * 2 - 1) * (HALF - 1.8);
  const z = (decorRandom() * 2 - 1) * (HALF - 1.8);

  if (inZone(x, z, 1) || !isFree(x, z, 3.2)) continue;

  placed.push({ x, z });
  addTree(x, z, 0.8 + decorRandom() * 0.6);
}

for (let i = 0; i < 14; i++) {
  const x = (decorRandom() * 2 - 1) * (HALF - 1.5);
  const z = (decorRandom() * 2 - 1) * (HALF - 1.5);

  if (inZone(x, z) || !isFree(x, z, 1.6)) continue;

  placed.push({ x, z });
  const size = 0.25 + decorRandom() * 0.35;
  const rock = addMesh(
    new THREE.DodecahedronGeometry(size, 0),
    rockMaterial,
    x,
    size * 0.45,
    z
  );
  rock.scale.y = 0.65;
  rock.rotation.set(decorRandom() * 3, decorRandom() * 3, 0);
}

const bushMaterial = new THREE.MeshStandardMaterial({ color: "#3f9a50", roughness: 1 });
for (let i = 0; i < 18; i++) {
  const x = (decorRandom() * 2 - 1) * (HALF - 1.5);
  const z = (decorRandom() * 2 - 1) * (HALF - 1.5);

  if (inZone(x, z) || !isFree(x, z, 1.4)) continue;

  placed.push({ x, z });
  const size = 0.4 + decorRandom() * 0.35;
  const bush = addMesh(new THREE.SphereGeometry(size, 10, 8), bushMaterial, x, size * 0.6, z);
  bush.scale.y = 0.75;
}

// Laternen rund um den Platz
const lampGlowMaterial = new THREE.MeshStandardMaterial({
  color: "#fff1b8",
  emissive: new THREE.Color("#ffd980"),
  emissiveIntensity: 1.4
});

for (const [x, z] of [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]]) {
  addMesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 8), lampPoleMaterialShared, x, 1.2, z);
  addMesh(new THREE.SphereGeometry(0.2, 14, 10), lampGlowMaterial, x, 2.5, z, {
    cast: false,
    receive: false
  });
}

// Blumen als Instanzen: ein einziger Zeichenaufruf für alle.
const flowerCount = 260;
const flowers = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.07, 8, 6),
  new THREE.MeshStandardMaterial({ roughness: 0.7 }),
  flowerCount
);
const flowerMatrix = new THREE.Matrix4();
const flowerColors = ["#ff7aa8", "#ffd45e", "#ffffff", "#b79bff", "#ff9f5a"];
let flowerIndex = 0;

for (let tries = 0; flowerIndex < flowerCount && tries < 5000; tries++) {
  const x = (decorRandom() * 2 - 1) * (HALF - 0.8);
  const z = (decorRandom() * 2 - 1) * (HALF - 0.8);

  if (inZone(x, z, -1.5)) continue;

  flowerMatrix.setPosition(x, 0.07, z);
  flowers.setMatrixAt(flowerIndex, flowerMatrix);
  flowers.setColorAt(flowerIndex, new THREE.Color(pick(flowerColors)));
  flowerIndex++;
}

flowers.count = flowerIndex;
flowers.instanceMatrix.needsUpdate = true;
flowers.instanceColor.needsUpdate = true;
scene.add(flowers);


// Spielfigur
function makePlayer(color, name = "") {
  const group = new THREE.Group();

  const clothes = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7
  });

  const skin = new THREE.MeshStandardMaterial({
    color: "#f0c4a4",
    roughness: 0.8
  });

  const dark = new THREE.MeshStandardMaterial({
    color: "#2a3650",
    roughness: 0.85
  });

  const hairMaterial = new THREE.MeshStandardMaterial({
    color: "#3b2a22",
    roughness: 0.9
  });

  const shoeMaterial = new THREE.MeshStandardMaterial({
    color: "#f4f6fb",
    roughness: 0.6
  });

  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: "#141a26",
    roughness: 0.3
  });

  function addPart(geometry, material, x, y, z, parent = group) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Körper, Kopf und Haare
  addPart(
    new THREE.CapsuleGeometry(0.27, 0.45, 6, 12),
    clothes,
    0,
    0.85,
    0
  );

  addPart(
    new THREE.SphereGeometry(0.19, 20, 16),
    skin,
    0,
    1.42,
    0
  );

  // Haarkappe: nur die obere, nach hinten reichende Kugelhälfte.
  const hair = addPart(
    new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hairMaterial,
    0,
    1.45,
    0.015
  );
  hair.rotation.x = -0.25;

  // Augen schauen nach vorne (−z).
  const eyeGeometry = new THREE.SphereGeometry(0.03, 10, 8);
  addPart(eyeGeometry, eyeMaterial, -0.07, 1.43, -0.172);
  addPart(eyeGeometry, eyeMaterial, 0.07, 1.43, -0.172);

  // Arme mit Händen
  const armGeometry = new THREE.CapsuleGeometry(0.075, 0.34, 4, 8);
  const handGeometry = new THREE.SphereGeometry(0.075, 10, 8);
  const leftArm = addPart(armGeometry, clothes, -0.36, 0.89, 0);
  const rightArm = addPart(armGeometry, clothes, 0.36, 0.89, 0);
  addPart(handGeometry, skin, 0, -0.27, 0, leftArm);
  addPart(handGeometry, skin, 0, -0.27, 0, rightArm);

  // Beine mit Schuhen: als Referenzen speichern, damit sie animiert werden.
  const legGeometry = new THREE.CapsuleGeometry(0.09, 0.3, 4, 8);
  const shoeGeometry = new THREE.BoxGeometry(0.17, 0.09, 0.27);
  const leftLeg = addPart(legGeometry, dark, -0.14, 0.29, 0);
  const rightLeg = addPart(legGeometry, dark, 0.14, 0.29, 0);
  addPart(shoeGeometry, shoeMaterial, 0, -0.25, -0.04, leftLeg);
  addPart(shoeGeometry, shoeMaterial, 0, -0.25, -0.04, rightLeg);

  group.userData.leftLeg = leftLeg;
  group.userData.rightLeg = rightLeg;
  group.userData.leftArm = leftArm;
  group.userData.rightArm = rightArm;
  group.userData.clothes = clothes;

  if (name) {
    const label = makeNameLabel(name);
    label.position.set(0, 1.95, 0);
    group.add(label);
    group.userData.label = label;
  }

  return group;
}

function makeNameLabel(name) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = 512;
  canvas.height = 128;

  context.font = "bold 44px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";

  context.fillStyle = "rgba(8, 14, 24, 0.82)";
  context.beginPath();
    if (context.roundRect) {
    context.roundRect(20, 14, 472, 100, 28);
  } else {
    context.rect(20, 14, 472, 100);
  }
    context.fill();

  context.fillStyle = "#ffffff";
  context.fillText(name.slice(0, 20), 256, 64, 440);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    })
  );

  label.scale.set(1.7, 0.43, 1);
  return label;
}

// Eigene Figur mit gespeicherter Farbe und gespeichertem Namen
const myPlayer = makePlayer(playerColor, playerName);
myPlayer.position.set(0, 0, 0);
scene.add(myPlayer);

// Multiplayer-Verbindung. Die 3D-Welt läuft auch ohne diese Verbindung.
socket.addEventListener("open", () => {
  statusEl.textContent = "Verbunden";
  statusEl.dataset.state = "online";
  socket.send(
    JSON.stringify({ type: "join", name: playerName, color: playerColor })
  );
});

// Heartbeat, damit der Server tote Verbindungen erkennt.
setInterval(() => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "ping" }));
  }
}, 5000);

// Beim Verlassen/Wechseln der Seite sauber abmelden.
addEventListener("pagehide", () => {
  try { socket.close(1000, "pagehide"); } catch {}
});

socket.addEventListener("close", () => {
  statusEl.textContent = "Offline – lokale Bewegung aktiv";
  statusEl.dataset.state = "offline";
});

socket.addEventListener("error", () => {
  statusEl.textContent = "Offline – lokale Bewegung aktiv";
  statusEl.dataset.state = "offline";
});

socket.addEventListener("message", event => {
  let message;

  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }

  if (message.type === "welcome") {
    myId = String(message.id);
  }

  if (message.type === "state") {
    players = Array.isArray(message.players) ? message.players : [];
    chatItems = Array.isArray(message.chat) ? message.chat : [];
    updateOtherPlayers();
    renderChat();
  }

  if (message.type === "chat" && message.item) {
    chatItems.push(message.item);
    renderChat();
  }

  if (message.type === "kicked") {
    alert("Du wurdest aus dem Raum entfernt.");
    socket.close();
  }
});

// GoatCounter einmal beim Spielstart laden.
const goatScript = document.createElement("script");
goatScript.async = true;
goatScript.src = "https://gc.zgo.at/count.js";

goatScript.dataset.goatcounter =
  "https://kroxenstudios.goatcounter.com/count";

document.head.appendChild(goatScript);


// ---------------------------------------------------------------------------
// Steuerung
// ---------------------------------------------------------------------------
const jumpButton = document.querySelector("#jumpButton");
const zoomInButton = document.querySelector("#zoomIn");
const zoomOutButton = document.querySelector("#zoomOut");
const hintEl = document.querySelector("#hint");
const canvas = renderer.domElement;

const WALK_SPEED = 4.2;
const SPRINT_SPEED = 7.2;
const PLAYER_RADIUS = 0.3;
const STEP_HEIGHT = 0.35;
const INTERPOLATION_DELAY = 80;  // ms Verzögerung für ruhige Bewegung anderer Spieler
const BASE_FOV = 68;
const MIN_FOV = 38;
const MAX_FOV = 100;

let fov = BASE_FOV;
let touchMode = matchMedia("(pointer: coarse)").matches;
let jumpQueued = false;

function setTouchMode(on) {
  touchMode = on;
  document.body.classList.toggle("touch", on);
  updateHint();
}

function updateHint() {
  if (!hintEl) return;

  if (touchMode) {
    hintEl.textContent =
      "Links laufen · rechts wischen = umsehen · Springen-Knopf · Zwei Finger = Zoom";
    hintEl.hidden = false;
    return;
  }

  if (document.pointerLockElement === canvas) {
    hintEl.textContent =
      "WASD laufen · Maus = Richtung · Strg = rennen · Leertaste = springen · Enter = chatten · Mausrad = Zoom";
    hintEl.hidden = false;
    clearTimeout(updateHint.timer);
    updateHint.timer = setTimeout(() => (hintEl.hidden = true), 7000);
  } else {
    clearTimeout(updateHint.timer);
    hintEl.textContent = "Klicken, um zu steuern (Esc gibt die Maus frei)";
    hintEl.hidden = false;
  }
}

setTouchMode(touchMode);

function lockMouse() {
  if (touchMode || document.pointerLockElement === canvas) return;

  try {
    const result = canvas.requestPointerLock();
    if (result && result.catch) result.catch(() => {});
  } catch {}
}

document.addEventListener("pointerlockchange", updateHint);

function jump() {
  jumpQueued = true;
}

function typing() {
  return document.activeElement === chatInput;
}

// Tastatur
addEventListener("keydown", event => {
  if (typing()) {
    if (event.key === "Escape") chatInput.blur();
    return;
  }

  const key = event.key.toLowerCase();

  if (
    ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)
  ) {
    event.preventDefault();
  }

  if (key === "enter") {
    event.preventDefault();
    if (document.pointerLockElement) document.exitPointerLock();
    chatInput.focus();
    return;
  }

  if (key === " " && !keys.has(key)) jump();

  keys.add(key);
});

addEventListener("keyup", event => {
  keys.delete(event.key.toLowerCase());
});

addEventListener("blur", () => keys.clear());

chatInput.addEventListener("focus", () => keys.clear());

// Maus: Klick sperrt den Zeiger, danach steuert die Maus immer die Richtung.
canvas.addEventListener("pointerdown", event => {
  if (event.pointerType === "mouse") {
    setTouchMode(false);
    lockMouse();
  }
});

document.addEventListener("mousemove", event => {
  if (document.pointerLockElement !== canvas) return;
  rotateCamera(event.movementX, event.movementY);
});

// Mausrad: Zoom über das Sichtfeld
canvas.addEventListener(
  "wheel",
  event => {
    event.preventDefault();
    setFov(fov + Math.sign(event.deltaY) * 4);
  },
  { passive: false }
);

function setFov(value) {
  fov = THREE.MathUtils.clamp(value, MIN_FOV, MAX_FOV);
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

zoomInButton?.addEventListener("click", () => setFov(fov - 8));
zoomOutButton?.addEventListener("click", () => setFov(fov + 8));

// Touch auf der Spielfläche: ein Finger = umsehen, zwei Finger = zoomen.
// Joystick und Sprungknopf sind eigene Elemente und laufen unabhängig,
// dadurch geht Laufen und Umsehen gleichzeitig.
const touchPoints = new Map();
let pinchDistance = 0;

function pinchNow() {
  const [a, b] = [...touchPoints.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

canvas.addEventListener("pointerdown", event => {
  if (event.pointerType === "mouse") return;

  setTouchMode(true);
  canvas.setPointerCapture(event.pointerId);
  touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (touchPoints.size === 2) pinchDistance = pinchNow();
});

canvas.addEventListener("pointermove", event => {
  const point = touchPoints.get(event.pointerId);
  if (!point) return;

  const dx = event.clientX - point.x;
  const dy = event.clientY - point.y;
  point.x = event.clientX;
  point.y = event.clientY;

  if (touchPoints.size >= 2) {
    const now = pinchNow();
    if (pinchDistance > 0) setFov(fov * (pinchDistance / now));
    pinchDistance = now;
  } else {
    rotateCamera(dx * 1.4, dy * 1.4);
  }
});

function endTouch(event) {
  touchPoints.delete(event.pointerId);
  pinchDistance = 0;
}

canvas.addEventListener("pointerup", endTouch);
canvas.addEventListener("pointercancel", endTouch);

function rotateCamera(deltaX, deltaY) {
  cameraDirection.yaw -= deltaX * 0.0022;

  cameraDirection.pitch = THREE.MathUtils.clamp(
    cameraDirection.pitch + deltaY * 0.0022,
    -0.3,
    0.9
  );
}

// Sprungknopf rechts
jumpButton?.addEventListener("pointerdown", event => {
  event.preventDefault();
  setTouchMode(true);
  jump();
});

// Joystick links
joystick.addEventListener("pointerdown", event => {
  event.preventDefault();
  setTouchMode(true);
  joystickPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  moveJoystick(event);
});

joystick.addEventListener("pointermove", event => {
  if (event.pointerId === joystickPointer) moveJoystick(event);
});

joystick.addEventListener("pointerup", releaseJoystick);
joystick.addEventListener("pointercancel", releaseJoystick);

function moveJoystick(event) {
  const rect = joystick.getBoundingClientRect();
  const maxDistance = rect.width * 0.32;
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const length = Math.hypot(dx, dy) || 1;
  const scale = Math.min(1, maxDistance / length);

  joystickX = THREE.MathUtils.clamp(dx / maxDistance, -1, 1);
  joystickY = THREE.MathUtils.clamp(dy / maxDistance, -1, 1);

  stick.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
}

function releaseJoystick(event) {
  if (event.pointerId !== joystickPointer) return;

  joystickPointer = null;
  joystickX = 0;
  joystickY = 0;
  stick.style.transform = "";
}

// ---------------------------------------------------------------------------
// Chat und Sprechblasen
// ---------------------------------------------------------------------------
chatForm.addEventListener("submit", event => {
  event.preventDefault();

  const text = chatInput.value.trim().slice(0, 100);

  if (text && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "chat", text }));
  }

  chatInput.value = "";
  chatInput.blur();
  lockMouse();
});

function makeBubble(text) {
  const width = 560;
  const font = "bold 34px system-ui, sans-serif";
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = font;

  // Zeilenumbruch, auch für sehr lange Wörter
  const lines = [];
  let line = "";

  for (const word of text.split(/\s+/)) {
    let rest = word;

    while (measure.measureText(rest).width > width - 70) {
      let cut = rest.length - 1;
      while (cut > 1 && measure.measureText(rest.slice(0, cut)).width > width - 70) cut--;
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }

    const test = line ? `${line} ${rest}` : rest;

    if (measure.measureText(test).width > width - 70 && line) {
      lines.push(line);
      line = rest;
    } else {
      line = test;
    }
  }

  if (line) lines.push(line);

  const lineHeight = 44;
  const bodyHeight = lines.length * lineHeight + 34;
  const height = bodyHeight + 30;

  const canvasEl = document.createElement("canvas");
  canvasEl.width = width;
  canvasEl.height = height;
  const ctx = canvasEl.getContext("2d");

  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.strokeStyle = "rgba(20, 30, 50, 0.55)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(8, 6, width - 16, bodyHeight, 30);
  else ctx.rect(8, 6, width - 16, bodyHeight);
  ctx.fill();
  ctx.stroke();

  // Zipfel der Sprechblase
  ctx.beginPath();
  ctx.moveTo(width / 2 - 20, bodyHeight + 3);
  ctx.lineTo(width / 2, height - 4);
  ctx.lineTo(width / 2 + 20, bodyHeight + 3);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#101827";
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => {
    ctx.fillText(l, width / 2, 6 + 17 + lineHeight / 2 + i * lineHeight);
  });

  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  );
  sprite.center.set(0.5, 0);
  sprite.scale.set(2.3, (2.3 * height) / width, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function setBubble(mesh, item) {
  const current = mesh.userData.bubbleId || null;
  const wanted = item ? item.id : null;
  if (current === wanted) return;

  if (mesh.userData.bubble) {
    mesh.remove(mesh.userData.bubble);
    mesh.userData.bubble.material.map.dispose();
    mesh.userData.bubble.material.dispose();
    mesh.userData.bubble = null;
  }

  mesh.userData.bubbleId = wanted;

  if (item) {
    const bubble = makeBubble(String(item.text));
    bubble.position.set(0, 2.3, 0);
    mesh.add(bubble);
    mesh.userData.bubble = bubble;
  }
}

// Jede Figur zeigt ihre jüngste, noch nicht abgelaufene Nachricht.
function syncBubbles() {
  const now = Date.now();
  const latest = new Map();

  chatItems = chatItems.filter(item => item.expires > now);

  for (const item of chatItems) {
    if (item.playerId) latest.set(String(item.playerId), item);
  }

  setBubble(myPlayer, latest.get(myId) || null);

  for (const [id, mesh] of otherPlayerMeshes) {
    setBubble(mesh, latest.get(id) || null);
  }
}

function renderChat() {
  syncBubbles();
}

// Andere Spieler anzeigen und aktualisieren.
function updateOtherPlayers() {
  const activeIds = new Set();

  for (const data of players) {
    const id = String(data.id);

    if (id === myId) continue;

    activeIds.add(id);

    let mesh = otherPlayerMeshes.get(id);

    const name = data.name || "Spieler";
    const color = /^#[0-9a-f]{3,8}$/i.test(data.color || "")
      ? data.color
      : "#7bb7ff";

    if (!mesh) {
      mesh = makePlayer(color, name);
      mesh.userData.playerId = id;
      mesh.userData.name = name;
      mesh.userData.walkCycle = 0;
      mesh.position.set(Number(data.x) || 0, Number(data.h) || 0, Number(data.y) || 0);
      mesh.rotation.y = Number(data.rotation) || 0;

      scene.add(mesh);
      otherPlayerMeshes.set(id, mesh);
    }

    // Name und Farbe können nach dem Beitritt nachgeliefert werden.
    if (mesh.userData.name !== name) {
      mesh.userData.name = name;
      mesh.remove(mesh.userData.label);
      mesh.userData.label.material.map.dispose();
      mesh.userData.label.material.dispose();
      mesh.userData.label = makeNameLabel(name);
      mesh.userData.label.position.set(0, 1.95, 0);
      mesh.add(mesh.userData.label);
    }

    mesh.userData.clothes.color.set(color);

    // Serverstand als Schnappschuss merken; die Spielschleife interpoliert
    // mit kleiner Verzögerung zwischen den Schnappschüssen (ruhige Bewegung).
    const buffer = (mesh.userData.buffer ||= []);
    buffer.push({
      t: performance.now(),
      x: Number(data.x) || 0,
      z: Number(data.y) || 0,
      h: Number(data.h) || 0,
      rot: Number(data.rotation) || 0
    });
    if (buffer.length > 40) buffer.shift();
  }

  for (const [id, mesh] of otherPlayerMeshes) {
    if (!activeIds.has(id)) {
      setBubble(mesh, null);
      scene.remove(mesh);
      otherPlayerMeshes.delete(id);
    }
  }

  syncBubbles();
}

// ---------------------------------------------------------------------------
// Kollision
// ---------------------------------------------------------------------------

// Schiebt die Figur seitlich aus allen Körpern, die zu hoch zum Aufsteigen sind.
function resolveHorizontal(pos, feetY) {
  for (let pass = 0; pass < 3; pass++) {
    for (const c of colliders) {
      if (c.top <= feetY + STEP_HEIGHT) continue;

      if (c.type === "circle") {
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const dist = Math.hypot(dx, dz);
        const min = c.r + PLAYER_RADIUS;

        if (dist < min) {
          const nx = dist > 1e-5 ? dx / dist : 1;
          const nz = dist > 1e-5 ? dz / dist : 0;
          pos.x = c.x + nx * min;
          pos.z = c.z + nz * min;
        }
      } else {
        const nearX = THREE.MathUtils.clamp(pos.x, c.x - c.hw, c.x + c.hw);
        const nearZ = THREE.MathUtils.clamp(pos.z, c.z - c.hd, c.z + c.hd);
        const dx = pos.x - nearX;
        const dz = pos.z - nearZ;
        const dist = Math.hypot(dx, dz);

        if (dist < PLAYER_RADIUS) {
          if (dist > 1e-5) {
            pos.x = nearX + (dx / dist) * PLAYER_RADIUS;
            pos.z = nearZ + (dz / dist) * PLAYER_RADIUS;
          } else {
            // Mittelpunkt liegt im Körper: kürzesten Weg nach draußen
            const left = pos.x - (c.x - c.hw);
            const right = c.x + c.hw - pos.x;
            const back = pos.z - (c.z - c.hd);
            const front = c.z + c.hd - pos.z;
            const smallest = Math.min(left, right, back, front);

            if (smallest === left) pos.x = c.x - c.hw - PLAYER_RADIUS;
            else if (smallest === right) pos.x = c.x + c.hw + PLAYER_RADIUS;
            else if (smallest === back) pos.z = c.z - c.hd - PLAYER_RADIUS;
            else pos.z = c.z + c.hd + PLAYER_RADIUS;
          }
        }
      }
    }
  }
}

// Höhe des Bodens unter der Figur: höchste Oberkante, die man erreichen kann.
function groundHeight(x, z, feetY) {
  let ground = 0;
  const slack = 0.12;

  for (const c of colliders) {
    if (c.top > feetY + STEP_HEIGHT || c.top <= ground) continue;

    let over;
    if (c.type === "circle") {
      over = Math.hypot(x - c.x, z - c.z) < c.r + slack;
    } else {
      over = Math.abs(x - c.x) < c.hw + slack && Math.abs(z - c.z) < c.hd + slack;
    }

    if (over) ground = c.top;
  }

  return ground;
}

// ---------------------------------------------------------------------------
// Spielschleife
// ---------------------------------------------------------------------------
let sprintBlend = 0;
let lastSentH = 0;
let lastSentRot = 0;

function swingLimbs(figure, swing, delta, rate) {
  const parts = figure.userData;
  parts.leftLeg.rotation.x = THREE.MathUtils.damp(parts.leftLeg.rotation.x, swing, rate, delta);
  parts.rightLeg.rotation.x = THREE.MathUtils.damp(parts.rightLeg.rotation.x, -swing, rate, delta);
  parts.leftArm.rotation.x = THREE.MathUtils.damp(parts.leftArm.rotation.x, -swing * 0.6, rate, delta);
  parts.rightArm.rotation.x = THREE.MathUtils.damp(parts.rightArm.rotation.x, swing * 0.6, rate, delta);
}

function animate(time) {
  requestAnimationFrame(animate);

  const delta = previousFrameTime
    ? Math.min((time - previousFrameTime) / 1000, 0.05)
    : 0;

  previousFrameTime = time;

  // Eingabe
  const keyForward =
    (keys.has("arrowup") || keys.has("w") ? 1 : 0) -
    (keys.has("arrowdown") || keys.has("s") ? 1 : 0);

  const keySide =
    (keys.has("arrowright") || keys.has("d") ? 1 : 0) -
    (keys.has("arrowleft") || keys.has("a") ? 1 : 0);

  const forward = keyForward - joystickY;
  const side = keySide + joystickX;
  const inputLength = Math.hypot(forward, side);
  const isMoving = inputLength > 0.08;

  // Sprinten gibt es nur mit der Tastatur, nicht im Handheld-Modus.
  const wantsSprint = !touchMode && (keys.has("control") || keys.has("shift"));
  sprintBlend = THREE.MathUtils.damp(sprintBlend, wantsSprint ? 1 : 0, 9, delta);

  const pos = myPlayer.position;

  if (isMoving) {
    const strength = Math.min(inputLength, 1);
    const nForward = forward / Math.max(inputLength, 1e-5);
    const nSide = side / Math.max(inputLength, 1e-5);

    const yaw = cameraDirection.yaw;
    const moveX = -Math.sin(yaw) * nForward + Math.cos(yaw) * nSide;
    const moveZ = -Math.cos(yaw) * nForward - Math.sin(yaw) * nSide;

    const speed =
      THREE.MathUtils.lerp(WALK_SPEED, SPRINT_SPEED, sprintBlend) *
      (joystickPointer !== null && !keySide && !keyForward
        ? Math.max(0.45, strength)
        : 1);

    pos.x += moveX * speed * delta;
    pos.z += moveZ * speed * delta;

    walkCycle += delta * walkSpeed * (1 + sprintBlend * 0.6);
  }

  pos.x = THREE.MathUtils.clamp(pos.x, -LIMIT, LIMIT);
  pos.z = THREE.MathUtils.clamp(pos.z, -LIMIT, LIMIT);
  resolveHorizontal(pos, pos.y);

  // Sprung und Schwerkraft
  if (jumpQueued) {
    jumpQueued = false;
    if (isGrounded) {
      verticalVelocity = jumpStrength;
      isGrounded = false;
    }
  }

  const ground = groundHeight(pos.x, pos.z, pos.y);

  if (isGrounded) {
    if (pos.y > ground + 0.02) {
      isGrounded = false; // über die Kante gelaufen
    } else {
      pos.y = ground;
    }
  }

  if (!isGrounded) {
    verticalVelocity -= gravity * delta;
    pos.y += verticalVelocity * delta;

    if (verticalVelocity <= 0 && pos.y <= ground) {
      pos.y = ground;
      verticalVelocity = 0;
      isGrounded = true;
    }
  }

  // Beinanimation
  const legAmount = legSwingAmount * (1 + sprintBlend * 0.35);
  let swing = 0;
  if (!isGrounded) swing = 0.35;
  else if (isMoving) swing = Math.sin(walkCycle) * legAmount;
  swingLimbs(myPlayer, swing, delta, isMoving || !isGrounded ? 30 : 10);

  // Die Spielfigur dreht sich immer mit der Kamera.
  myPlayer.rotation.y = cameraDirection.yaw;

  // Kamera folgt der Figur; Zoom über das Sichtfeld.
  const cameraDistance = 5;
  const horizontalDistance = Math.cos(cameraDirection.pitch) * cameraDistance;

  camera.position.set(
    pos.x + Math.sin(cameraDirection.yaw) * horizontalDistance,
    Math.max(
      0.35,
      pos.y + 1.7 + Math.sin(cameraDirection.pitch) * cameraDistance
    ),
    pos.z + Math.cos(cameraDirection.yaw) * horizontalDistance
  );
  camera.lookAt(pos.x, pos.y + 0.9, pos.z);

  // Sonne und Schatten folgen der Figur.
  mainLight.target.position.set(pos.x, 0, pos.z);
  mainLight.position.set(pos.x - 9, 15, pos.z + 7);

  // Position an den Worker senden (höchstens ~8x pro Sekunde).
  const changed =
    lastSentX === null ||
    Math.abs(pos.x - lastSentX) > 0.02 ||
    Math.abs(pos.z - lastSentZ) > 0.02 ||
    Math.abs(pos.y - lastSentH) > 0.03 ||
    Math.abs(cameraDirection.yaw - lastSentRot) > 0.05;

  if (
    changed &&
    time - lastMoveSent >= 30 &&
    socket.readyState === WebSocket.OPEN
  ) {
    lastMoveSent = time;
    lastSentX = pos.x;
    lastSentZ = pos.z;
    lastSentH = pos.y;
    lastSentRot = cameraDirection.yaw;

    // Der Worker kennt x und y; y enthält die 3D-z-Position, h die Höhe.
    socket.send(
      JSON.stringify({
        type: "move",
        x: pos.x,
        y: pos.z,
        h: pos.y,
        rotation: cameraDirection.yaw
      })
    );
  }

  // Andere Spieler: weich zur Zielposition gleiten, drehen und laufen.
  for (const mesh of otherPlayerMeshes.values()) {
    const buffer = mesh.userData.buffer;
    if (!buffer || !buffer.length) continue;

    // Wiedergabezeit liegt etwas hinter der Echtzeit.
    const renderTime = time - INTERPOLATION_DELAY;
    let from = buffer[0];
    let to = buffer[0];

    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i].t <= renderTime) from = to = buffer[i];
      else {
        to = buffer[i];
        break;
      }
    }

    let k = 0;
    if (to !== from) k = THREE.MathUtils.clamp((renderTime - from.t) / (to.t - from.t), 0, 1);

    const px = mesh.position.x;
    const pz = mesh.position.z;

    mesh.position.x = THREE.MathUtils.lerp(from.x, to.x, k);
    mesh.position.z = THREE.MathUtils.lerp(from.z, to.z, k);
    mesh.position.y = THREE.MathUtils.lerp(from.h, to.h, k);

    // Blickrichtung über den kürzesten Winkel mischen, dann leicht nachziehen.
    let rotDiff = to.rot - from.rot;
    rotDiff = Math.atan2(Math.sin(rotDiff), Math.cos(rotDiff));
    const targetRot = from.rot + rotDiff * k;
    let diff = targetRot - mesh.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    mesh.rotation.y += diff * (1 - Math.exp(-16 * delta));

    const speed = delta > 0
      ? Math.hypot(mesh.position.x - px, mesh.position.z - pz) / delta
      : 0;
    const moving = speed > 0.4;
    if (moving) {
      mesh.userData.walkCycle +=
        delta * walkSpeed * THREE.MathUtils.clamp(speed / WALK_SPEED, 0.6, 1.6);
    }

    const otherSwing = moving
      ? Math.sin(mesh.userData.walkCycle) * legSwingAmount
      : 0;

    swingLimbs(mesh, otherSwing, delta, 12);
  }

  // Sprechblasen laufen nach ihrer Zeit ab, auch ohne neuen Serverstand.
  syncBubbles();

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

// Bei Fenstergrößenänderung Kamera und Renderer anpassen.
addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
