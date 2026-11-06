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
  (characterSettings.name || prompt("Wie möchtest du heißen?") || "Gast")
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
scene.fog = new THREE.Fog("#cdebf5", 26, 62);

const camera = new THREE.PerspectiveCamera(
  68,
  window.innerWidth / window.innerHeight,
  0.1,
  100
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
mainLight.shadow.camera.left = -20;
mainLight.shadow.camera.right = 20;
mainLight.shadow.camera.top = 20;
mainLight.shadow.camera.bottom = -20;
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

// Weite Wiese außerhalb des Raums, damit der Rand nicht im Nichts endet.
const farGround = new THREE.Mesh(
  new THREE.PlaneGeometry(240, 240),
  new THREE.MeshStandardMaterial({ color: "#5aa04f", roughness: 1 })
);
farGround.rotation.x = -Math.PI / 2;
farGround.position.y = -0.08;
farGround.receiveShadow = true;
scene.add(farGround);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({
    map: makeGrassTexture(),
    roughness: 1
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.03;
floor.receiveShadow = true;
scene.add(floor);

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
}

addDisc(3.7, "#b9ad94", 0.01);
addDisc(3.4, "#ddd5c2", 0.02);
addDisc(1.2, "#c9bfa7", 0.03);
addDisc(0.9, "#62e6b2", 0.04, {
  emissive: new THREE.Color("#62e6b2"),
  emissiveIntensity: 0.35,
  roughness: 0.5
});

// Begrenzung: niedrige Hecken statt hoher Mauern, damit die Sicht frei bleibt.
const hedgeMaterial = new THREE.MeshStandardMaterial({
  color: "#3a7a47",
  roughness: 1
});

function addWall(x, z, width, depth) {
  addMesh(
    new THREE.BoxGeometry(width, 1.1, depth),
    hedgeMaterial,
    x,
    0.55,
    z
  );
}

addWall(0, -15, 31, 0.9);
addWall(0, 15, 31, 0.9);
addWall(-15, 0, 0.9, 31);
addWall(15, 0, 0.9, 31);

// Bäume am Rand
const trunkMaterial = new THREE.MeshStandardMaterial({
  color: "#7a5636",
  roughness: 1
});
const leafMaterials = ["#2f8f4e", "#3aa35a", "#2a7d46"].map(
  color => new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
);
const placed = [];

function isFree(x, z, spacing) {
  return placed.every(p => Math.hypot(p.x - x, p.z - z) > spacing);
}

function addTree(x, z, scale) {
  addMesh(
    new THREE.CylinderGeometry(0.13 * scale, 0.19 * scale, 1.3 * scale, 7),
    trunkMaterial,
    x,
    0.65 * scale,
    z
  );

  const leaves = pick(leafMaterials);
  addMesh(
    new THREE.ConeGeometry(1 * scale, 1.7 * scale, 9),
    leaves,
    x,
    1.9 * scale,
    z
  );
  addMesh(
    new THREE.ConeGeometry(0.75 * scale, 1.4 * scale, 9),
    leaves,
    x,
    2.7 * scale,
    z
  );
}

for (let tries = 0; tries < 200 && placed.length < 16; tries++) {
  const x = (decorRandom() * 2 - 1) * 13.2;
  const z = (decorRandom() * 2 - 1) * 13.2;

  if (Math.hypot(x, z) < 8 || !isFree(x, z, 3)) continue;

  placed.push({ x, z });
  addTree(x, z, 0.8 + decorRandom() * 0.6);
}

// Steine
const rockMaterial = new THREE.MeshStandardMaterial({
  color: "#9aa3ab",
  roughness: 0.95,
  flatShading: true
});

for (let i = 0; i < 9; i++) {
  const x = (decorRandom() * 2 - 1) * 13;
  const z = (decorRandom() * 2 - 1) * 13;

  if (Math.hypot(x, z) < 5 || !isFree(x, z, 1.5)) continue;

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

// Laternen rund um den Platz
const lampPoleMaterial = new THREE.MeshStandardMaterial({
  color: "#3a4352",
  roughness: 0.6,
  metalness: 0.4
});
const lampGlowMaterial = new THREE.MeshStandardMaterial({
  color: "#fff1b8",
  emissive: new THREE.Color("#ffd980"),
  emissiveIntensity: 1.4
});

for (const [x, z] of [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]]) {
  addMesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 8), lampPoleMaterial, x, 1.2, z);
  addMesh(new THREE.SphereGeometry(0.2, 14, 10), lampGlowMaterial, x, 2.5, z, {
    cast: false,
    receive: false
  });
}

// Blumen als Instanzen: ein einziger Zeichenaufruf für alle.
const flowerCount = 140;
const flowers = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.07, 8, 6),
  new THREE.MeshStandardMaterial({ roughness: 0.7 }),
  flowerCount
);
const flowerMatrix = new THREE.Matrix4();
const flowerColors = ["#ff7aa8", "#ffd45e", "#ffffff", "#b79bff", "#ff9f5a"];
let flowerIndex = 0;

while (flowerIndex < flowerCount) {
  const x = (decorRandom() * 2 - 1) * 14;
  const z = (decorRandom() * 2 - 1) * 14;

  if (Math.hypot(x, z) < 4.2) continue;

  flowerMatrix.setPosition(x, 0.07, z);
  flowers.setMatrixAt(flowerIndex, flowerMatrix);
  flowers.setColorAt(flowerIndex, new THREE.Color(pick(flowerColors)));
  flowerIndex++;
}

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

// Tastatursteuerung
addEventListener("keydown", event => {
  const key = event.key.toLowerCase();

  if (
    ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)
  ) {
    event.preventDefault();
  }

  // Nur beim erstmaligen Drücken springen.
  if (key === " " && !keys.has(key)) {
    jump();
  }

  keys.add(key);
});

addEventListener("keyup", event => {
  keys.delete(event.key.toLowerCase());
});

function jump() {
  if (!isGrounded) return;

  verticalVelocity = jumpStrength;
  isGrounded = false;
}
// Maus: ziehen, um die Blickrichtung zu ändern.
renderer.domElement.addEventListener("pointerdown", event => {
  if (event.pointerType !== "mouse") return;

  lookPointer = event.pointerId;
  lastLookX = event.clientX;
  lastLookY = event.clientY;
  renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener("pointermove", event => {
  if (event.pointerId !== lookPointer) return;

  rotateCamera(
    event.clientX - lastLookX,
    event.clientY - lastLookY
  );

  lastLookX = event.clientX;
  lastLookY = event.clientY;
});

renderer.domElement.addEventListener("pointerup", event => {
  if (event.pointerId === lookPointer) lookPointer = null;
});

renderer.domElement.addEventListener("pointercancel", event => {
  if (event.pointerId === lookPointer) lookPointer = null;
});

// Touch: Wischen ändert die Blickrichtung.
// Tippen ohne Wischen löst einen Sprung aus.
let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;

renderer.domElement.addEventListener(
  "touchstart",
  event => {
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    lastLookX = touch.clientX;
    lastLookY = touch.clientY;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchMoved = false;
  },
  { passive: true }
);

renderer.domElement.addEventListener(
  "touchmove",
  event => {
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - lastLookX;
    const deltaY = touch.clientY - lastLookY;

    if (
      Math.hypot(
        touch.clientX - touchStartX,
        touch.clientY - touchStartY
      ) > 10
    ) {
      touchMoved = true;
    }

    rotateCamera(deltaX, deltaY);

    lastLookX = touch.clientX;
    lastLookY = touch.clientY;
  },
  { passive: true }
);

renderer.domElement.addEventListener(
  "touchend",
  event => {
    if (event.touches.length === 0 && !touchMoved) {
      jump();
    }
  },
  { passive: true }
);

function rotateCamera(deltaX, deltaY) {
  cameraDirection.yaw -= deltaX * 0.002;

  cameraDirection.pitch = THREE.MathUtils.clamp(
    cameraDirection.pitch + deltaY * 0.002,
    -0.12,
    0.55
  );
}
// Joystick für Handhelds und Touchscreens
joystick.addEventListener("pointerdown", event => {
  event.preventDefault();
  joystickPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  moveJoystick(event);
});

joystick.addEventListener("pointermove", event => {
  if (event.pointerId === joystickPointer) {
    moveJoystick(event);
  }
});

joystick.addEventListener("pointerup", releaseJoystick);
joystick.addEventListener("pointercancel", releaseJoystick);

function moveJoystick(event) {
  const rect = joystick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  const maxDistance = 38;
  const length = Math.hypot(dx, dy) || 1;
  const scale = Math.min(1, maxDistance / length);

  joystickX = THREE.MathUtils.clamp(dx / maxDistance, -1, 1);
  joystickY = THREE.MathUtils.clamp(dy / maxDistance, -1, 1);

  stick.style.transform =
    `translate(${dx * scale}px, ${dy * scale}px)`;
}

function releaseJoystick(event) {
  if (event.pointerId !== joystickPointer) return;

  joystickPointer = null;
  joystickX = 0;
  joystickY = 0;
  stick.style.transform = "";
}

// Chat
chatForm.addEventListener("submit", event => {
  event.preventDefault();

  const text = chatInput.value.trim().slice(0, 50);

  if (
    !text ||
    socket.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  socket.send(
    JSON.stringify({
      type: "chat",
      text
    })
  );

  chatInput.value = "";
});

function renderChat() {
  const now = Date.now();

  chatItems = chatItems.filter(
    item => item.expires > now
  );

  chatMessages.replaceChildren();

  for (const item of chatItems) {
    const line = document.createElement("div");

    line.className = "chat-line";
    line.textContent =
      `${item.name}: ${item.text}`;

    chatMessages.appendChild(line);
  }
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
    const targetX = Number(data.x) || 0;
    const targetZ = Number(data.y) || 0;

    if (!mesh) {
      mesh = makePlayer(color, name);
      mesh.userData.playerId = id;
      mesh.userData.name = name;
      mesh.userData.walkCycle = 0;
      mesh.position.set(targetX, 0, targetZ);

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

    // Zielposition: die Figur gleitet in der Spielschleife dorthin.
    mesh.userData.target = { x: targetX, z: targetZ };
  }

  for (const [id, mesh] of otherPlayerMeshes) {
    if (!activeIds.has(id)) {
      scene.remove(mesh);
      otherPlayerMeshes.delete(id);
    }
  }
}

// Admin: andere Figur anklicken, um ihre ID auszuwählen.
renderer.domElement.addEventListener(
  "click",
  event => {
    const rect =
      renderer.domElement.getBoundingClientRect();

    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();

    raycaster.setFromCamera(
      pointer,
      camera
    );

    const clickableParts = [];

    for (const [id, mesh] of otherPlayerMeshes) {
      mesh.userData.playerId = id;
      clickableParts.push(...mesh.children);
    }

    const hit =
      raycaster.intersectObjects(
        clickableParts,
        false
      )[0];

    if (hit) {
      let object = hit.object;

      while (
        object &&
        !object.userData.playerId
      ) {
        object = object.parent;
      }

      if (object?.userData.playerId) {
        document.querySelector(
          "#kickId"
        ).value =
          object.userData.playerId;
      }
    }
  }
);
document.querySelector("#kickButton").addEventListener("click", () => {
  const id = document.querySelector("#kickId").value.trim();
  const token = document.querySelector("#adminToken").value;

  if (!id || !token || socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify({
    type: "kick",
    id,
    token
  }));
});
// Spielschleife
function animate(time) {
  requestAnimationFrame(animate);

  const delta = previousFrameTime
    ? Math.min((time - previousFrameTime) / 1000, 0.05)
    : 0;

  previousFrameTime = time;

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

  if (isMoving) {
    const normalizedForward =
      forward / Math.max(inputLength, 1);

    const normalizedSide =
      side / Math.max(inputLength, 1);

    // Bewegung relativ zur Blickrichtung der Kamera
    const forwardX =
      -Math.sin(cameraDirection.yaw);

    const forwardZ =
      -Math.cos(cameraDirection.yaw);

    const rightX =
      Math.cos(cameraDirection.yaw);

    const rightZ =
      -Math.sin(cameraDirection.yaw);

    const moveX =
      forwardX * normalizedForward +
      rightX * normalizedSide;

    const moveZ =
      forwardZ * normalizedForward +
      rightZ * normalizedSide;

    const speed = 4.2;

    myPlayer.position.x +=
      moveX * speed * delta;

    myPlayer.position.z +=
      moveZ * speed * delta;

    myPlayer.position.x =
      THREE.MathUtils.clamp(
        myPlayer.position.x,
        -14,
        14
      );

    myPlayer.position.z =
      THREE.MathUtils.clamp(
        myPlayer.position.z,
        -14,
        14
      );

    // Beinanimation: Beine schwingen abwechselnd
    // nach vorne und hinten.
    walkCycle += delta * walkSpeed;

    const legSwing =
      Math.sin(walkCycle) *
      legSwingAmount;
    myPlayer.userData.leftLeg.rotation.x =
      legSwing;

    myPlayer.userData.rightLeg.rotation.x =
      -legSwing;

    // Arme schwingen entgegengesetzt
    // zu den Beinen.
    myPlayer.userData.leftArm.rotation.x =
      -legSwing * 0.6;

    myPlayer.userData.rightArm.rotation.x =
      legSwing * 0.6;
  } else {

    // Beine und Arme im Stillstand
    // sanft in die Ruheposition
    // zurückführen.

    myPlayer.userData.leftLeg.rotation.x =
      THREE.MathUtils.damp(
        myPlayer.userData.leftLeg.rotation.x,
        0,
        10,
        delta
      );

    myPlayer.userData.rightLeg.rotation.x =
      THREE.MathUtils.damp(
        myPlayer.userData.rightLeg.rotation.x,
        0,
        10,
        delta
      );

    myPlayer.userData.leftArm.rotation.x =
      THREE.MathUtils.damp(
        myPlayer.userData.leftArm.rotation.x,
        0,
        10,
        delta
      );

    myPlayer.userData.rightArm.rotation.x =
      THREE.MathUtils.damp(
        myPlayer.userData.rightArm.rotation.x,
        0,
        10,
        delta
      );
  }

  // Die Spielfigur dreht sich immer
  // mit der Kamera.

  myPlayer.rotation.y =
    cameraDirection.yaw;

  // Sprung und Schwerkraft

  if (!isGrounded) {
    verticalVelocity -=
      gravity * delta;

    myPlayer.position.y +=
      verticalVelocity * delta;

    if (myPlayer.position.y <= 0) {
      myPlayer.position.y = 0;
      verticalVelocity = 0;
      isGrounded = true;
    }
  }
  // Kamera folgt der Figur.
  const cameraDistance = 5;

  const horizontalDistance =
    Math.cos(cameraDirection.pitch) *
    cameraDistance;

  camera.position.set(
    myPlayer.position.x +
      Math.sin(cameraDirection.yaw) *
      horizontalDistance,

    myPlayer.position.y +
      1.7 +
      Math.sin(cameraDirection.pitch) *
      cameraDistance,

    myPlayer.position.z +
      Math.cos(cameraDirection.yaw) *
      horizontalDistance
  );

  camera.lookAt(
    myPlayer.position.x,
    myPlayer.position.y + 0.9,
    myPlayer.position.z
  );

  // Bewegung höchstens viermal pro Sekunde
  // an den Worker senden.

  const moved =
    lastSentX === null ||

    Math.abs(
      myPlayer.position.x - lastSentX
    ) > 0.02 ||

    Math.abs(
      myPlayer.position.z - lastSentZ
    ) > 0.02;

  if (
    moved &&
    time - lastMoveSent >= 250 &&
    socket.readyState === WebSocket.OPEN
  ) {

    lastMoveSent = time;

    lastSentX =
      myPlayer.position.x;

    lastSentZ =
      myPlayer.position.z;

    // Der aktuelle Worker nutzt x und y;
    // y enthält hier die 3D-z-Position.

    socket.send(
      JSON.stringify({
        type: "move",

        x: myPlayer.position.x,

        y: myPlayer.position.z
      })
    );
  }

  // Andere Spieler: weich zur Zielposition gleiten, drehen und laufen.
  for (const mesh of otherPlayerMeshes.values()) {
    const target = mesh.userData.target;
    if (!target) continue;

    const dx = target.x - mesh.position.x;
    const dz = target.z - mesh.position.z;
    const follow = 1 - Math.exp(-12 * delta);

    mesh.position.x += dx * follow;
    mesh.position.z += dz * follow;

    const moving = Math.hypot(dx, dz) > 0.05;

    if (moving) {
      const targetYaw = Math.atan2(-dx, -dz);
      let diff = targetYaw - mesh.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      mesh.rotation.y += diff * (1 - Math.exp(-10 * delta));
      mesh.userData.walkCycle += delta * walkSpeed;
    }

    const swing = moving
      ? Math.sin(mesh.userData.walkCycle) * legSwingAmount
      : 0;
    const parts = mesh.userData;

    parts.leftLeg.rotation.x =
      THREE.MathUtils.damp(parts.leftLeg.rotation.x, swing, 12, delta);
    parts.rightLeg.rotation.x =
      THREE.MathUtils.damp(parts.rightLeg.rotation.x, -swing, 12, delta);
    parts.leftArm.rotation.x =
      THREE.MathUtils.damp(parts.leftArm.rotation.x, -swing * 0.6, 12, delta);
    parts.rightArm.rotation.x =
      THREE.MathUtils.damp(parts.rightArm.rotation.x, swing * 0.6, 12, delta);
  }

  renderer.render(
    scene,
    camera
  );
}

requestAnimationFrame(
  animate
);

// Bei Fenstergrößenänderung Kamera
// und Renderer anpassen.

addEventListener(
  "resize",
  () => {

    camera.aspect =
      window.innerWidth /
      window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
      window.innerWidth,
      window.innerHeight
    );
  }
);
