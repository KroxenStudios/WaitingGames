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

const socketProtocol = location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${socketProtocol}//${location.host}/ws`);

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

const scene = new THREE.Scene();
scene.background = new THREE.Color("#101827");
scene.fog = new THREE.Fog("#101827", 22, 45);

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

// Beleuchtung
scene.add(new THREE.HemisphereLight(0xd9edff, 0x334052, 2));

const mainLight = new THREE.DirectionalLight(0xffe8c7, 2.5);
mainLight.position.set(-7, 12, 5);
mainLight.castShadow = true;
mainLight.shadow.mapSize.set(1024, 1024);
scene.add(mainLight);

// Boden
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({
    color: "#344356",
    roughness: 0.95
  })
);

floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.03;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(30, 30, "#8aa1b7", "#52647a");
grid.position.y = 0;
scene.add(grid);

// Begrenzungsmauern, Raumgröße: 30 × 30 Einheiten.
const wallMaterial = new THREE.MeshStandardMaterial({
  color: "#60758b",
  roughness: 0.8
});

function addWall(x, z, width, depth) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(width, 3, depth),
    wallMaterial
  );

  wall.position.set(x, 1.5, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
}

addWall(0, -15, 30, 0.5);
addWall(0, 15, 30, 0.5);
addWall(-15, 0, 0.5, 30);
addWall(15, 0, 0.5, 30);

// Spielfigur
function makePlayer(color, name = "") {
  const group = new THREE.Group();

  const clothes = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82
  });

  const skin = new THREE.MeshStandardMaterial({
    color: "#e6b99b",
    roughness: 0.9
  });

  const dark = new THREE.MeshStandardMaterial({
    color: "#253247",
    roughness: 0.9
  });

  function addPart(geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Körper, Kopf und Haare
  addPart(
    new THREE.CapsuleGeometry(0.27, 0.45, 4, 8),
    clothes,
    0,
    0.85,
    0
  );

  addPart(
    new THREE.SphereGeometry(0.19, 16, 12),
    skin,
    0,
    1.42,
    0
  );

  addPart(
    new THREE.SphereGeometry(0.195, 16, 10),
    dark,
    0,
    1.53,
    0
  );

  // Arme
  const armGeometry = new THREE.CapsuleGeometry(0.075, 0.38, 3, 6);
  const leftArm = addPart(armGeometry, clothes, -0.36, 0.89, 0);
  const rightArm = addPart(armGeometry, clothes, 0.36, 0.89, 0);

  // Beine: als Referenzen speichern, damit sie animiert werden können.
  const legGeometry = new THREE.CapsuleGeometry(0.09, 0.34, 3, 6);
  const leftLeg = addPart(legGeometry, dark, -0.14, 0.29, 0);
  const rightLeg = addPart(legGeometry, dark, 0.14, 0.29, 0);

  group.userData.leftLeg = leftLeg;
  group.userData.rightLeg = rightLeg;
  group.userData.leftArm = leftArm;
  group.userData.rightArm = rightArm;

  // Marker zeigt nach vorne.
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.22, 10),
    new THREE.MeshStandardMaterial({ color: "#ffffff" })
  );

  marker.position.set(0, 1.15, -0.31);
  marker.rotation.x = Math.PI / 2;
  group.add(marker);

  if (name) {
    const label = makeNameLabel(name);
    label.position.set(0, 1.95, 0);
    group.add(label);
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
  context.roundRect(20, 14, 472, 100, 28);
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
  socket.send(JSON.stringify({ type: "join", name: playerName }));
});

socket.addEventListener("close", () => {
  statusEl.textContent = "Offline – lokale Bewegung aktiv";
});

socket.addEventListener("error", () => {
  statusEl.textContent = "Offline – lokale Bewegung aktiv";
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

  stick.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
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
  if (!text || socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify({ type: "chat", text }));
  chatInput.value = "";
});

function renderChat() {
  const now = Date.now();
  chatItems = chatItems.filter(item => item.expires > now);
  chatMessages.replaceChildren();

  for (const item of chatItems) {
    const line = document.createElement("div");
    line.className = "chat-line";
    line.textContent = `${item.name}: ${item.text}`;
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

    if (!mesh) {
      mesh = makePlayer("#7bb7ff", data.name || "Spieler");
      mesh.userData.playerId = id;
      scene.add(mesh);
      otherPlayerMeshes.set(id, mesh);
    }

    mesh.position.set(
      Number(data.x) || 0,
      0,
      Number(data.y) || 0
    );
  }

  for (const [id, mesh] of otherPlayerMeshes) {
    if (!activeIds.has(id)) {
      scene.remove(mesh);
      otherPlayerMeshes.delete(id);
    }
  }
}

// Admin: andere Figur anklicken, um ihre ID auszuwählen.
renderer.domElement.addEventListener("click", event => {
  const rect = renderer.domElement.getBoundingClientRect();

  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);

  const clickableParts = [];

  for (const [id, mesh] of otherPlayerMeshes) {
    mesh.userData.playerId = id;
    clickableParts.push(...mesh.children);
  }

  const hit = raycaster.intersectObjects(clickableParts, false)[0];

  if (hit) {
    let object = hit.object;

    while (object && !object.userData.playerId) {
      object = object.parent;
    }

    if (object?.userData.playerId) {
      document.querySelector("#kickId").value = object.userData.playerId;
    }
  }
});

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
    const normalizedForward = forward / Math.max(inputLength, 1);
    const normalizedSide = side / Math.max(inputLength, 1);

    // Bewegung relativ zur Blickrichtung der Kamera
    const forwardX = -Math.sin(cameraDirection.yaw);
    const forwardZ = -Math.cos(cameraDirection.yaw);
    const rightX = Math.cos(cameraDirection.yaw);
    const rightZ = -Math.sin(cameraDirection.yaw);

    const moveX =
      forwardX * normalizedForward +
      rightX * normalizedSide;

    const moveZ =
      forwardZ * normalizedForward +
      rightZ * normalizedSide;

    const speed = 4.2;

    myPlayer.position.x += moveX * speed * delta;
    myPlayer.position.z += moveZ * speed * delta;

    myPlayer.position.x = THREE.MathUtils.clamp(
      myPlayer.position.x,
      -14,
      14
    );

    myPlayer.position.z = THREE.MathUtils.clamp(
      myPlayer.position.z,
      -14,
      14
    );

    // Beinanimation: Beine schwingen abwechselnd nach vorne und hinten.
    walkCycle += delta * walkSpeed;

    const legSwing = Math.sin(walkCycle) * legSwingAmount;

    myPlayer.userData.leftLeg.rotation.x = legSwing;
    myPlayer.userData.rightLeg.rotation.x = -legSwing;

    // Arme schwingen entgegengesetzt zu den Beinen.
    myPlayer.userData.leftArm.rotation.x = -legSwing * 0.6;
    myPlayer.userData.rightArm.rotation.x = legSwing * 0.6;
  } else {
    // Beine und Arme im Stillstand sanft in die Ruheposition zurückführen.
    myPlayer.userData.leftLeg.rotation.x = THREE.MathUtils.damp(
      myPlayer.userData.leftLeg.rotation.x,
      0,
      10,
      delta
    );

    myPlayer.userData.rightLeg.rotation.x = THREE.MathUtils.damp(
      myPlayer.userData.rightLeg.rotation.x,
      0,
      10,
      delta
    );

    myPlayer.userData.leftArm.rotation.x = THREE.MathUtils.damp(
      myPlayer.userData.leftArm.rotation.x,
      0,
      10,
      delta
    );

    myPlayer.userData.rightArm.rotation.x = THREE.MathUtils.damp(
      myPlayer.userData.rightArm.rotation.x,
      0,
      10,
      delta
    );
  }

  // Die Spielfigur dreht sich immer mit der Kamera.
  myPlayer.rotation.y = cameraDirection.yaw;

  // Sprung und Schwerkraft
  if (!isGrounded) {
    verticalVelocity -= gravity * delta;
    myPlayer.position.y += verticalVelocity * delta;

    if (myPlayer.position.y <= 0) {
      myPlayer.position.y = 0;
      verticalVelocity = 0;
      isGrounded = true;
    }
  }

  // Kamera folgt der Figur.
  const cameraDistance = 5;
  const horizontalDistance =
    Math.cos(cameraDirection.pitch) * cameraDistance;

  camera.position.set(
    myPlayer.position.x +
      Math.sin(cameraDirection.yaw) * horizontalDistance,
    myPlayer.position.y +
      1.7 +
      Math.sin(cameraDirection.pitch) * cameraDistance,
    myPlayer.position.z +
      Math.cos(cameraDirection.yaw) * horizontalDistance
  );

  camera.lookAt(
    myPlayer.position.x,
    myPlayer.position.y + 0.9,
    myPlayer.position.z
  );

  // Bewegung höchstens viermal pro Sekunde an den Worker senden.
  const moved =
    lastSentX === null ||
    Math.abs(myPlayer.position.x - lastSentX) > 0.02 ||
    Math.abs(myPlayer.position.z - lastSentZ) > 0.02;

  if (
    moved &&
    time - lastMoveSent >= 250 &&
    socket.readyState === WebSocket.OPEN
  ) {
    lastMoveSent = time;
    lastSentX = myPlayer.position.x;
    lastSentZ = myPlayer.position.z;

    // Der aktuelle Worker nutzt x und y; y enthält hier die 3D-z-Position.
    socket.send(JSON.stringify({
      type: "move",
      x: myPlayer.position.x,
      y: myPlayer.position.z
    }));
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

// Bei Fenstergrößenänderung Kamera und Renderer anpassen.
addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
