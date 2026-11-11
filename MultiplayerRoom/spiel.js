// bastelkarre: fahrzeuge aus teilen bauen und online zusammen fahren.
// grundlage ist der multiplayerroom (three.js, cloudflare-worker per websocket).
import * as THREE from "three";
import RAPIER from "./lib/rapier.mjs";   // lokale kopie von @dimforge/rapier3d-compat 0.21.0 (kein fremdcode von cdns)
import * as BAU from "./bau.js";
import * as PH from "./physik.js";
import {
  fahrzeugGrafik, setzeRaeder, geistModell, schirmModell, spielfigur, figurAktualisieren, setzeSitzen, textSprite, entsorge, mat
} from "./teile3d.js";
import { lookAus } from "./look.js";
import { Partikel } from "./partikel.js";
import { ladeWeltDaten, baueGelaende, hoeheBei } from "./gelaende.js";
import { Konto } from "./accounts.js";
import { startModelle } from "./modelle.js";
import { zeigeProfil } from "./profil.js";
import { startRaeume, raumName, raumTitel } from "./raeume.js";

const $ = s => document.querySelector(s);

// ---------------------------------------------------------------------------
// sprache (deutsch/englisch): texte im code sind deutsch, tr() liefert die englische fassung.
// die sprachwahl kommt aus lang.js (gleicher schlüssel wie die anderen waiting games).
// ---------------------------------------------------------------------------
const EN = !!window.WG && WG.lang === "en";
const TEXTE = {
  // teile und gruppen
  "Block": "Block", "Glas": "Glass","Stufe (halb)": "Slab (half)", "Schräge": "Wedge", "Eckschräge": "Corner wedge", "Sitz": "Seat",
  "Lenkrad (lenkbar)": "Steerable wheel", "Starres Rad": "Fixed wheel", "Einkaufswagenrad": "Caster wheel",
  "Auspuff": "Exhaust", "Nebelgenerator": "Fog generator", "Triebwerk": "Jet engine", "Raketentriebwerk": "Rocket engine",
  "Tragfläche": "Wing", "Steuerfläche": "Control surface", "Kamera": "Camera", "Fallschirm": "Parachute",
  "Stellmotor": "Servo motor", "Sollbruchstelle": "Breakaway joint",
  "Verkleidung": "Body", "Fahrer": "Driver", "Räder": "Wheels", "Effekte": "Effects", "Antrieb": "Drive",
  "Mechanik": "Mechanics", "Flug": "Flight",
  // einstellungen
  "Eigene Farbe": "Custom colour", "Max. Lenkwinkel": "Max. steering angle", "Größe": "Size", "Klein": "Small",
  "Mittel": "Medium", "Groß": "Large", "angetrieben": "driven", "frei rollend": "free-rolling",
  "Lenkrichtung": "Steering direction", "automatisch": "automatic", "normal": "normal", "umgekehrt": "reversed",
  "Abgasfarbe": "Exhaust colour", "Nebelfarbe": "Fog colour", "An/Aus": "On/Off", "Schub (halten)": "Thrust (hold)",
  "Schub": "Thrust", "Zünden (halten)": "Ignite (hold)", "Brenndauer": "Burn time", "Auftriebsfläche": "Lift area",
  "Fläche": "Area", "Max. Ausschlag": "Max. deflection", "Kanal": "Channel",
  "Nicken (Höhenruder)": "Pitch (elevator)", "Rollen (Querruder)": "Roll (aileron)", "Gieren (Seitenruder)": "Yaw (rudder)",
  "Richtung": "Direction", "gegenläufig": "opposite", "Ausschlag +": "Deflection +", "Ausschlag −": "Deflection −",
  "Ansicht umschalten": "Switch view", "Blickfeld": "Field of view", "Öffnen/Einpacken": "Open/pack",
  "Schirmfläche": "Canopy area", "Schirmfarbe": "Canopy colour", "Drehen +": "Rotate +", "Drehen −": "Rotate −",
  "Modus": "Mode", "Winkel halten": "Hold angle", "Dauerdrehung": "Continuous rotation", "Max. Winkel": "Max. angle",
  "Tempo": "Speed", "Trennen": "Detach", "Teil entfernen": "Remove part", "Taste drücken …": "Press a key …",
  // tasten
  "Leertaste": "Space", "Strg": "Ctrl",
  // hinweise zu den teilen
  "Hier sitzt du (X zum Ein-/Aussteigen). Beliebig viele Sitze möglich; der zuerst gebaute legt fest, wo vorne ist.":
    "This is where you sit (X to get in/out). Any number of seats; the first one built defines where forward is.",
  "Lenkt mit A/D. Räder hinter dem Schwerpunkt lenken automatisch gegenläufig.":
    "Steers with A/D. Wheels behind the centre of mass steer in the opposite direction automatically.",
  "Starres Rad: rollt nur geradeaus.": "Fixed wheel: only rolls straight.",
  "Dreht sich frei um 360° und folgt der Bewegung. Kein Antrieb.": "Swivels freely through 360° and follows the motion. No drive.",
  "Raucht, solange der Motor läuft (M schaltet ihn aus und an).": "Smokes while the engine runs (M switches it off and on).",
  "Nebelt auf Knopfdruck, auch ohne Motor.": "Fogs at the press of a key, even without the engine.",
  "Schiebt den Körper, an dem es sitzt, auch wenn es nicht verbunden ist.": "Pushes the body it sits on, even if it is not connected.",
  "Erzeugt Auftrieb und Luftwiderstand, je nach Anstellwinkel zur Anströmung (Strömungsabriss ab ca. 17°). Schräg einbauen (T kippt) oder das Fahrzeug nach oben nicken, damit er trägt. Die Fläche ist die wirksame Auftriebsfläche.":
    "Creates lift and drag depending on the angle of attack to the airflow (stalls above about 17°). Mount it tilted (T tilts) or pitch the vehicle up so it carries. The area is the effective lift area.",
  "Ruder: kippt ihre Hinterkante mit den Tasten. Kanal Nicken = Höhenruder (hinten), Rollen = Querruder (links und rechts gegenläufig!), Gieren = Seitenruder (senkrecht stellen mit T). Hinterkante ist die gelbe Seite.":
    "Rudder: tilts its trailing edge with the keys. Pitch = elevator (at the back), Roll = aileron (left and right opposite!), Yaw = rudder (stand it upright with T). The trailing edge is the yellow side.",
  "Schalte mit der Taste auf den Blick durch die Kamera um (ohne im Fahrzeug zu sein). Sie schaut in Richtung der Linse.":
    "Press the key to look through the camera (without being in the vehicle). It looks in the direction of the lens.",
  "Taste öffnet den Schirm, nochmal drücken packt ihn ein. Er bremst umso stärker, je schneller du bist – auch beim Fallen.":
    "The key opens the canopy, press again to pack it. It brakes harder the faster you are – also when falling.",
  "Sehr starker Schub, aber nur für die Brenndauer. Danach lädt sie wieder auf.": "Very strong thrust, but only for the burn time. Then it recharges.",
  "Alles, was oben (an der Drehscheibe) angebaut ist, dreht sich gegen den Rest.": "Everything attached on top (the turntable) turns against the rest.",
  "Hält fest, bis du die Taste drückst. Dann trennt sie die Teile.": "Holds firmly until you press the key. Then it separates the parts.",
  // hinweiszeilen
  "Tippen = Werkzeug · Ziehen = drehen · Zwei Finger = zoomen/schieben": "Tap = tool · drag = rotate · two fingers = zoom/pan",
  "Linksklick setzen · Rechtsklick entfernen · Mittelklick einstellen · Ziehen dreht die Ansicht · WASD schiebt · R/T drehen/kippen":
    "Left-click place · right-click remove · middle-click adjust · drag rotates the view · WASD moves · R/T rotate/tilt",
  "Joystick fahren · Knöpfe rechts für Teile": "Joystick drives · buttons on the right for parts",
  "Joystick: Nicken und Rollen · Knöpfe rechts: Gieren und Teile": "Joystick: pitch and roll · buttons on the right: yaw and parts",
  "WASD fahren · Leertaste bremsen · X aus-/einsteigen oder Klick auf einen Sitz · M Motor · C Kamera · Tab zurück zum Bauen · Rücktaste neu starten":
    "WASD drive · Space brake · X get out/in or click a seat · M engine · C camera · Tab back to building · Backspace restart",
  // meldungen
  "Jede Farbe = ein starrer Körper. Gleiche Farbe = fest verbunden.": "Each colour = one rigid body. Same colour = firmly connected.",
  "Ungültige Fahrzeug-Datei": "Invalid vehicle file",
  "Fahrzeug importiert (Rückgängig mit Strg+Z)": "Vehicle imported (undo with Ctrl+Z)",
  "Normale Farben": "Normal colours", "Nichts rückgängig zu machen": "Nothing to undo",
  "Alles entfernt (Rückgängig mit Strg+Z)": "Everything removed (undo with Ctrl+Z)",
  "X ist zum Ein- und Aussteigen reserviert": "X is reserved for getting in and out",
  "Motor an": "Engine on", "Motor aus": "Engine off",
  "Nicht verbunden: das Teil liegt lose herum": "Not connected: the part lies around loose",
  "Der Sitz ist besetzt": "The seat is taken", "Du fährst mit": "You ride along", "Eingestiegen": "Seated",
  "Ausgestiegen – X zum Einsteigen": "Got out – X to get in", "Kein freier Sitz in der Nähe": "No free seat nearby",
  "Erst etwas bauen!": "Build something first!", "Kein Sitz eingebaut: du gehst zu Fuß": "No seat built: you're on foot",
  "Neu gestartet": "Restarted",
  "Außerhalb des Bauraums": "Outside the build area", "Platz belegt": "Space occupied",
  "Räder gehören an eine Seitenfläche": "Wheels belong on a side face",
  // fahren
  "Gas / Rückwärts": "Throttle / Reverse", "Lenken": "Steer", "Bremse": "Brake", "Motor an/aus": "Engine on/off",
  "Bauen": "Build", "Neu starten": "Restart", "Aus-/Einsteigen": "Get out/in", "Nebel": "Fog", "Rakete": "Rocket",
  "Motor +": "Servo +", "Motor −": "Servo −", "Nicken +": "Pitch +", "Nicken −": "Pitch −", "Rollen +": "Roll +",
  "Rollen −": "Roll −", "Gieren +": "Yaw +", "Gieren −": "Yaw −", "Ruder +": "Rudder +", "Ruder −": "Rudder −",
  "Bremse / Sprung": "Brake / Jump", "Aus/Ein": "Out/In", "Raketen-Treibstoff": "Rocket fuel",
  // status und anzeigen
  "Zum Laden erst in den Baumodus wechseln": "Switch to build mode to load", "Fahrzeug aus dem Konto geladen": "Vehicle loaded from your account", "Fahrzeug geladen": "Vehicle loaded", "du": "you", "Zum Chatten anmelden (👤)": "Sign in to chat (👤)", "gehört einem registrierten Konto. Du heißt hier „Gast“ – melde dich an oder wähle im Konto einen anderen Namen.": "belongs to a registered account. You are called “Guest” here – sign in or pick another name in your account.", "Auch Werte außerhalb des Reglers sind möglich": "Values outside the slider range are possible too", "Wert auf die zulässige Grenze begrenzt": "Value limited to the allowed maximum", "Ansicht umschalten (C)": "Switch view (C)", "Ansicht: Verfolger": "View: chase", "Ansicht: Verfolger nah": "View: chase close", "Ansicht: Ich-Perspektive": "View: first person", "Raum": "Room", "Raum voll": "Room full", "Du bist vom Moderator stummgeschaltet": "You have been muted by a moderator", "Zum Chatten musst du angemeldet sein": "You need to be signed in to chat", "Zum Chatten bitte anmelden (👤)": "Sign in to chat (👤)", "Nachricht (Enter)": "Message (Enter)", "Profil ansehen": "View profile", "Gast ohne Konto": "Guest without account",
  "Offline": "Offline", "Verbinde …": "Connecting …", "Online": "Online",
  "Offline – du kannst trotzdem bauen und fahren": "Offline – you can still build and drive",
  "frei": "free", "Aussteigen (X)": "Get out (X)", "Einsteigen (X)": "Get in (X)", "schwerelos": "weightless",
  "Losfahren": "Drive", "Zum Parkplatz": "To parking lot", "zurück": "back", "KAMERA": "CAMERA", "Gast": "Guest",
  "Startbahn · 1,4 km": "Runway · 1.4 km",
  "Kart": "Kart", "Dragster": "Dragster", "Einkaufswagen": "Shopping cart", "Geländewagen": "Off-roader",
  "Flugzeug": "Plane", "Kranwagen": "Crane truck", "Zugmaschine mit Anhänger": "Truck with trailer",
  "Vorlage laden …": "Load a preset …", "Vorlage": "Preset",
  "Reisebus": "Coach", "Raumrakete": "Space rocket", "Propellerflugzeug": "Propeller plane", "Feuerwehrauto": "Fire truck",
  "Propeller-Buggy": "Propeller buggy", "Zug mit zwei Wagen": "Train with two cars",
  "Scheinwerfer": "Headlight", "Leiter": "Ladder", "Propellermotor": "Propeller engine", "Treibstofftank": "Fuel tank",
  "Lichtfarbe": "Light colour", "Gashebel +": "Throttle +", "Gashebel −": "Throttle −",
  "Max. Fluggeschwindigkeit": "Max. airspeed", "Kapazität": "Capacity", "Verbrauch": "Fuel use",
  "Treibstoffverbrauch an/aus": "Fuel use on/off", "Treibstoffverbrauch an": "Fuel use on",
  "Treibstoffverbrauch aus (unbegrenzt)": "Fuel use off (unlimited)", "Tank leer": "Tank empty", "Kein Tank verbunden": "No tank connected", "Treibstoff": "Fuel", "Tank": "Tank",
  "Leuchtet nach vorn (in Richtung der Linse). Die Taste schaltet ihn an und aus.":
    "Shines forward (in the direction of the lens). The key switches it on and off.",
  "Zu Fuß hochklettern: W/S an der Leiter, Leertaste springt ab. Mehrere Leitern übereinander ergeben eine lange Leiter (R/T dreht sie).":
    "Climb on foot: W/S at the ladder, Space jumps off. Several ladders stacked make a long ladder (R/T rotates it).",
  "Schiebt wie ein Propeller: Die Gashebel-Tasten stellen die Leistung ein und sie bleibt eingestellt. Der Schub sinkt in dünner Luft; im Weltraum gibt es keinen.":
    "Pushes like a propeller: the throttle keys set the power and it stays set. Thrust falls in thin air; there is none in space.",
  "Treibstoff für Triebwerke, Propeller und den Motor (Raketen haben eigenen). Mit Tank geht ohne Treibstoff nichts, ohne Tank ist der Verbrauch aus. K schaltet den Verbrauch aus und an.":
    "Fuel for jet engines, propellers and the drive motor (rockets have their own). With a tank nothing runs without fuel, without a tank fuel use is off. K switches fuel use off and on.",
};
window.bastelkarreTr = s => tr(s);   // für den hangar (modelle.js), der die vorlagen-namen übersetzt
function tr(s) {
  if (!EN || typeof s !== "string") return s;
  if (TEXTE[s] !== undefined) return TEXTE[s];
  const m = /^Höchstens (\d+) Teile$/.exec(s);
  return m ? `At most ${m[1]} parts` : s;
}
// knopf mit symbol und text (im handheld-modus wird nur das symbol gezeigt)
function setBtn(sel, ico, txt) {
  const b = $(sel);
  b.querySelector(".ico").textContent = ico;
  b.querySelector(".txt").textContent = txt;
}

const game = $("#game");
const statusEl = $("#status");
const hintEl = $("#hint");
const meldungEl = $("#meldung");

// ---------------------------------------------------------------------------
// spieler (name und aussehen kommen aus den konto-einstellungen, konto.html)
// ---------------------------------------------------------------------------
let charakter = {};
try {
  charakter = JSON.parse(localStorage.getItem("characterSettings") || "{}");
} catch {
  charakter = {};
}
// ohne eigenen namen gilt der kontoname (falls angemeldet), sonst "gast"
let kontoName = "";
try { kontoName = localStorage.getItem("krox-user") || ""; } catch {}
const spielerName = (charakter.name || kontoName || tr("Gast")).trim().slice(0, 20) || "Gast";
const spielerFarbe = /^#[0-9a-f]{6}$/i.test(charakter.color || "") ? charakter.color : "#62e6b2";
const spielerLook = lookAus(charakter);   // kleidung, frisur, haar- und hautfarbe

function meldung(text, ms = 2200) {
  meldungEl.textContent = tr(text);
  meldungEl.classList.add("zeigen");
  clearTimeout(meldung.t);
  meldung.t = setTimeout(() => meldungEl.classList.remove("zeigen"), ms);
}

// ---------------------------------------------------------------------------
// szene
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color("#000008");
scene.fog = new THREE.Fog("#cdebf5", 150, 1300);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2500);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.id = "scene";
game.prepend(renderer.domElement);
const canvas = renderer.domElement;

const hemi = new THREE.HemisphereLight(0xcfeaff, 0x5a5f55, 1.6);
scene.add(hemi);
const sonne = new THREE.DirectionalLight(0xfff0d2, 2.6);
sonne.castShadow = true;
sonne.shadow.mapSize.set(2048, 2048);
Object.assign(sonne.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
sonne.shadow.camera.updateProjectionMatrix();
sonne.shadow.bias = -0.0004;
sonne.shadow.normalBias = 0.03;
scene.add(sonne, sonne.target);

// ---------------------------------------------------------------------------
// himmel, sterne und kleine erde: mit der höhe geht das blau ins schwarze des weltraums über
// ---------------------------------------------------------------------------
const himmel = new THREE.Mesh(
  new THREE.SphereGeometry(2300, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { raum: { value: 0 } },
    vertexShader: "varying vec3 vR; void main() { vR = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      varying vec3 vR;
      uniform float raum;
      void main() {
        vec3 horizont = vec3(0.847, 0.941, 0.969);
        vec3 oben = vec3(0.373, 0.706, 0.941);
        vec3 himmel = mix(horizont, oben, smoothstep(0.0, 0.75, vR.y));
        gl_FragColor = vec4(mix(himmel, vec3(0.0, 0.0, 0.01), raum), 1.0);
      }`
  })
);
himmel.renderOrder = -10;
himmel.frustumCulled = false;
scene.add(himmel);

const sterne = (() => {
  const n = 1800, pos = new Float32Array(n * 3);
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < n; i++) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    pos.set([Math.cos(a) * r * 2200, z * 2200, Math.sin(a) * r * 2200], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  p.renderOrder = -9;
  p.frustumCulled = false;
  scene.add(p);
  return p;
})();

function erdTextur() {
  const w = 1024, h = 512;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1d5fa8";
  ctx.fillRect(0, 0, w, h);
  let seed = 77;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w, y = h * (0.12 + rnd() * 0.76), r = 14 + rnd() * 70;
    ctx.fillStyle = ["#3f8f4a", "#4f9a55", "#b7a26b", "#2f7a3f"][i % 4];
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.ellipse(x + (rnd() - 0.5) * r, y + (rnd() - 0.5) * r * 0.6, r * (0.4 + rnd() * 0.6), r * (0.25 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#f4f8ff";
  ctx.fillRect(0, 0, w, 26);
  ctx.fillRect(0, h - 26, w, 26);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 90, 4 + rnd() * 12, (rnd() - 0.5) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const erde = new THREE.Group();
erde.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ map: erdTextur(), roughness: 1, fog: false })));
const erdHuelle = new THREE.Mesh(
  new THREE.SphereGeometry(1.05, 48, 32),
  new THREE.MeshBasicMaterial({ color: "#6bb8ff", transparent: true, opacity: 0.2, side: THREE.BackSide, depthWrite: false, fog: false })
);
erde.add(erdHuelle);
erde.scale.setScalar(420);
erde.visible = false;
scene.add(erde);
const ERDE_RICHTUNG = new THREE.Vector3(0.35, -0.7, -0.6).normalize();
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// pro bild: himmel, nebel und licht an die kamerahöhe anpassen
const nebelFarbe = new THREE.Color("#cdebf5"), schwarz = new THREE.Color("#000008");
function aktualisiereHimmel(zeit) {
  const raum = smooth(1500, 5000, camera.position.y);
  const nah = aktiveKamera !== null ? 0.1 : Math.min(1, 0.1 + Math.max(0, camera.position.y) * 0.002);
  if (camera.near !== nah) {
    camera.near = nah;
    camera.updateProjectionMatrix();
  }
  himmel.position.copy(camera.position);
  sterne.position.copy(camera.position);
  himmel.material.uniforms.raum.value = raum;
  sterne.material.opacity = smooth(0.35, 0.9, raum);
  scene.fog.color.copy(nebelFarbe).lerp(schwarz, raum);
  scene.fog.near = 150 + raum * 3000;
  scene.fog.far = 1300 + raum * 40000;
  hemi.intensity = 1.6 * (1 - 0.82 * raum);
  erde.visible = raum > 0.2;
  if (erde.visible) {
    erde.position.copy(camera.position).addScaledVector(ERDE_RICHTUNG, 1800);
    erde.rotation.y = zeit * 0.00002;
    erdHuelle.material.opacity = 0.2 * raum;
  }
}

const rauch = new Partikel(scene, 2600, false);
const feuer = new Partikel(scene, 1400, true);

// ---------------------------------------------------------------------------
// physikwelt
// ---------------------------------------------------------------------------
await RAPIER.init();
$("#laden").hidden = true;
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

// welt: fahrfläche mit rampen, parkplätze am südrand
const LOT_ANZAHL = 20;
const LOT_Z = 70;
const lotPos = i => new THREE.Vector3((((i % LOT_ANZAHL) + LOT_ANZAHL) % LOT_ANZAHL - (LOT_ANZAHL - 1) / 2) * 14, 0, LOT_Z);
const WELT_X = 400, WELT_N = -1500, WELT_S = 84;

function asphaltTextur() {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#5a5e63";
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 9000; i++) {
    const v = 70 + rnd() * 40;
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 5},${0.25 + rnd() * 0.3})`;
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function statischeBox(pos, halb, quat, farbe, { schatten = true, kollision = true } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(halb[0] * 2, halb[1] * 2, halb[2] * 2), mat(farbe, { roughness: 0.85 }));
  mesh.position.copy(pos);
  if (quat) mesh.quaternion.copy(quat);
  mesh.castShadow = schatten;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (!kollision) return mesh;
  const desc = RAPIER.ColliderDesc.cuboid(...halb).setTranslation(pos.x, pos.y, pos.z).setFriction(0.9);
  if (quat) desc.setRotation(quat);
  world.createCollider(desc);
  return mesh;
}

// rampe: beginnt bei "start" auf dem boden und steigt in richtung "dir" auf höhe h.
function rampe(x, z, dir, laenge, breite, h, farbe = "#c98f4a", stuetze = true) {
  const d = new THREE.Vector3(dir[0], 0, dir[1]).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const a = Math.atan2(h, laenge);
  const t = 0.4;
  const lang = Math.hypot(laenge, h);
  const entlang = d.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
  const normal = d.clone().multiplyScalar(-Math.sin(a)).addScaledVector(up, Math.cos(a));
  const seite = new THREE.Vector3().crossVectors(normal, entlang);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(seite, normal, entlang));
  const mitte = new THREE.Vector3(x, 0, z)
    .addScaledVector(d, laenge / 2)
    .addScaledVector(up, h / 2)
    .addScaledVector(normal, -t / 2);
  statischeBox(mitte, [breite / 2, t / 2, lang / 2], q, farbe);
  if (stuetze && h > 0.6) {
    const ende = new THREE.Vector3(x, 0, z).addScaledVector(d, laenge - 0.25);
    statischeBox(ende.setY((h - 0.3) / 2), [breite / 2 - 0.05, (h - 0.3) / 2, 0.2], new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d), "#8a6a45");
  }
}

// durchsichtiges raster mit flecken (kachel = 120 m)
function rasterTextur() {
  const s = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  let seed = 31;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 28; i++) {
    ctx.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${0.06 + rnd() * 0.1})` : `rgba(255,255,255,${0.03 + rnd() * 0.05})`;
    ctx.fillRect(rnd() * s, rnd() * s, 80 + rnd() * 300, 80 + rnd() * 300);
  }
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  for (let k = 1; k < 4; k++) {
    ctx.fillRect(k * 256 - 1, 0, 3, s);
    ctx.fillRect(0, k * 256 - 1, s, 3);
  }
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillRect(0, 0, 9, s);
  ctx.fillRect(0, 0, s, 9);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// felder und flecken für die wiese außerhalb (kachel = 400 m)
function wiesenTextur() {
  const s = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#5aa04f";
  ctx.fillRect(0, 0, s, s);
  let seed = 909;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const felder = ["#6aae55", "#4d9448", "#8fb35a", "#a58b55", "#76b25d", "#3f8a45"];
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = felder[Math.floor(rnd() * felder.length)];
    ctx.fillRect(rnd() * s, rnd() * s, 90 + rnd() * 260, 60 + rnd() * 200);
  }
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? "20,60,25" : "190,220,120"},${0.05 + rnd() * 0.1})`;
    ctx.beginPath();
    ctx.arc(rnd() * s, rnd() * s, 10 + rnd() * 50, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function baueWelt() {
  const tex = asphaltTextur();
  tex.repeat.set((WELT_X * 2) / 6, (WELT_S - WELT_N) / 6);
  const boden = new THREE.Mesh(
    new THREE.PlaneGeometry(WELT_X * 2, WELT_S - WELT_N),
    // polygonoffset: boden gewinnt gegen die wiese darunter, egal wie weit weg (kein flackern beim überfliegen)
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  );
  boden.rotation.x = -Math.PI / 2;
  boden.position.set(0, 0, (WELT_S + WELT_N) / 2);
  boden.receiveShadow = true;
  scene.add(boden);

  // großes raster (120 m, 30 m) und flecken: damit man höhe und tempo am boden erkennt
  const rt = rasterTextur();
  rt.repeat.set((WELT_X * 2) / 120, (WELT_S - WELT_N) / 120);
  const raster = new THREE.Mesh(
    new THREE.PlaneGeometry(WELT_X * 2, WELT_S - WELT_N),
    new THREE.MeshBasicMaterial({ map: rt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  );
  raster.rotation.x = -Math.PI / 2;
  raster.position.set(0, 0.002, (WELT_S + WELT_N) / 2);
  scene.add(raster);

  // große karte aus welt.json (gelände, straßen, dörfer, wald); ohne die datei bleibt die flache arena mit wiese und wänden
  if (WELTDATEN) {
    baueGelaende({ d: WELTDATEN, RAPIER, world, scene, box: statischeBox });
  } else {
  const wt = wiesenTextur();
  wt.repeat.set(15, 15);
  const wiese = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ map: wt, roughness: 1 })
  );
  wiese.rotation.x = -Math.PI / 2;
  wiese.position.y = -0.15;
  wiese.receiveShadow = true;
  scene.add(wiese);

  // bäume außerhalb der arena: maßstab und höhe sind aus der luft gut zu erkennen
  {
    const n = 1400;
    const kronen = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.4, 7), new THREE.MeshStandardMaterial({ roughness: 1 }), n);
    const staemme = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), new THREE.MeshStandardMaterial({ color: "#6b4a2d", roughness: 1 }), n);
    const m4 = new THREE.Matrix4(), farbe = new THREE.Color();
    let seed = 515;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let k = 0;
    for (let tries = 0; k < n && tries < 20000; tries++) {
      const x = (rnd() * 2 - 1) * 2900, z = (rnd() * 2 - 1) * 2900;
      if (Math.abs(x) < WELT_X + 25 && z > WELT_N - 25 && z < WELT_S + 25) continue;
      const s = 4 + rnd() * 9;
      m4.compose(new THREE.Vector3(x, s * 0.5, z), new THREE.Quaternion(), new THREE.Vector3(s * 0.45, s * 0.5, s * 0.45));
      staemme.setMatrixAt(k, m4);
      m4.compose(new THREE.Vector3(x, s * 0.5 + s * 0.55, z), new THREE.Quaternion(), new THREE.Vector3(s * 0.7, s * 0.7, s * 0.7));
      kronen.setMatrixAt(k, m4);
      kronen.setColorAt(k, farbe.set(["#2f8f4e", "#3aa35a", "#2a7d46", "#4a9a40"][k % 4]));
      k++;
    }
    kronen.count = staemme.count = k;
    scene.add(kronen, staemme);
  }

  world.createCollider(RAPIER.ColliderDesc.cuboid(3000, 1, 3000).setTranslation(0, -1, 0).setFriction(0.95));

  // begrenzung: betonwände
  const wand = "#b9b4a8";
  const lx = WELT_X * 2, lz = WELT_S - WELT_N, mz = (WELT_S + WELT_N) / 2;
  statischeBox(new THREE.Vector3(0, 0.6, WELT_N), [lx / 2 + 0.5, 0.6, 0.5], null, wand);
  statischeBox(new THREE.Vector3(0, 0.6, WELT_S), [lx / 2 + 0.5, 0.6, 0.5], null, wand);
  statischeBox(new THREE.Vector3(-WELT_X, 0.6, mz), [0.5, 0.6, lz / 2], null, wand);
  statischeBox(new THREE.Vector3(WELT_X, 0.6, mz), [0.5, 0.6, lz / 2], null, wand);
  }

  // startbahn östlich der hindernisse (nur optik), 1,4 km lang
  const flach = (breite, laenge, farbe, x, y, z, lage = -3) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(breite, laenge),
      new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: lage, polygonOffsetUnits: lage })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  const BAHN_X = 180;
  flach(40, 1400, "#3b3e42", BAHN_X, 0.03, -620);
  flach(0.6, 1400, "#f2f2f2", BAHN_X - 18.5, 0.04, -620, -5);
  flach(0.6, 1400, "#f2f2f2", BAHN_X + 18.5, 0.04, -620, -5);
  for (let z = 50; z > -1300; z -= 30) flach(0.6, 14, "#f2f2f2", BAHN_X, 0.04, z, -5);
  for (let z = 60; z > -1300; z -= 300) {
    for (let k = -3; k <= 3; k++) if (k) flach(1.2, 20, "#f2f2f2", BAHN_X + k * 4.5, 0.04, z - 10, -5);
  }
  const bahnSchild = textSprite(tr("Startbahn · 1,4 km"), { skala: 9, bg: "rgba(20,60,160,0.92)" });
  bahnSchild.position.set(BAHN_X, 7, 80);
  scene.add(bahnSchild);

  if (!WELTDATEN) {
  // ferne hügel als kulisse
  let seed = 99;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 22; i++) {
    const ang = (i / 22) * Math.PI * 2;
    const dist = 1250 + rnd() * 250;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mat(["#4f9a55", "#468c4d", "#5aa65c"][i % 3], { roughness: 1 }));
    hill.scale.set(160 + rnd() * 160, 40 + rnd() * 60, 160 + rnd() * 160);
    hill.position.set(Math.cos(ang) * dist, -10, Math.sin(ang) * dist + (WELT_S + WELT_N) / 2);
    scene.add(hill);
  }
  }

  // parkplätze
  for (let i = 0; i < LOT_ANZAHL; i++) {
    const p = lotPos(i);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.04, 12.4), new THREE.MeshStandardMaterial({ color: "#cfcac0", roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    pad.position.set(p.x, 0.02, p.z);
    pad.receiveShadow = true;
    scene.add(pad);
    // rasterlinien alle 0,5 m (fein) und alle 2 m (kräftig)
    const pts = [];
    for (let k = -12; k <= 12; k++) {
      const v = k * 0.5;
      pts.push(p.x + v, 0.045, p.z - 6, p.x + v, 0.045, p.z + 6, p.x - 6, 0.045, p.z + v, p.x + 6, 0.045, p.z + v);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const linien = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: "#9b968c", transparent: true, opacity: 0.6 }));
    scene.add(linien);
    // markierung vorne (fahrtrichtung) und seitenstreifen
    statischeBox(new THREE.Vector3(p.x, 0.05, p.z - 6.35), [6.2, 0.01, 0.12], null, "#ffd43b", { schatten: false, kollision: false });
    for (const sx of [-1, 1]) {
      statischeBox(new THREE.Vector3(p.x + sx * 6.6, 0.05, p.z), [0.1, 0.01, 6.2], null, "#f2f2f2", { schatten: false, kollision: false });
    }
    // schild mit nummer
    const pfosten = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 8), mat("#3a4352", { metalness: 0.4 }));
    pfosten.position.set(p.x - 6.6, 1.5, p.z + 6.6);
    scene.add(pfosten);
    const schild = textSprite(`P${i + 1}`, { skala: 2.2, bg: "rgba(20,60,160,0.92)" });
    schild.position.set(p.x - 6.6, 3.3, p.z + 6.6);
    scene.add(schild);
    lotSchilder.push({ pfosten, schild, name: null });
  }

  // hindernisse und rampen (fahrtrichtung vom parkplatz aus: -z)
  rampe(0, 46, [0, -1], 7, 5, 1.2);
  rampe(-14, 46, [0, -1], 5, 3, 0.5, "#d9a35a");
  rampe(14, 46, [0, -1], 5, 3, 0.5, "#d9a35a");

  // großer sprung mit landerampe
  rampe(-32, 34, [0, -1], 11, 7, 3.2, "#c46a3f");
  rampe(-32, -8, [0, 1], 11, 7, 3.2, "#c46a3f", false);
  statischeBox(new THREE.Vector3(-32, 1.6, 3.2), [3.45, 1.6, 0.2], null, "#8a6a45");

  // tafelberg mit auffahrten
  statischeBox(new THREE.Vector3(36, 1.5, 6), [8, 1.5, 8], null, "#9aa3ab");
  rampe(36, 24, [0, -1], 10, 6, 3, "#8f979e", false);
  rampe(36, -12, [0, 1], 10, 6, 3, "#8f979e", false);
  rampe(54, 6, [-1, 0], 10, 6, 3, "#8f979e", false);

  // wellenbahn
  for (let i = 0; i < 9; i++) {
    const z = 40 - i * 4.5;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 8, 20), mat("#e0d6c2", { roughness: 0.9 }));
    m.rotation.z = Math.PI / 2;
    m.position.set(-66, 0, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(4, 0.55).setTranslation(-66, 0, z)
        .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2))).setFriction(0.9)
    );
  }

  // treppe
  for (let i = 0; i < 8; i++) {
    statischeBox(new THREE.Vector3(72, 0.125 + i * 0.125, -30 - i * 1.6), [4, 0.125 + i * 0.125, 0.8], null, i % 2 ? "#a7a097" : "#b8b1a7");
  }

  // viertelröhre an der nordwand
  const R = 7;
  for (let i = 0; i < 7; i++) {
    const a0 = (i / 7) * (Math.PI / 2), a1 = ((i + 1) / 7) * (Math.PI / 2);
    const am = (a0 + a1) / 2;
    const len = R * (a1 - a0) + 0.05;
    const y = R - Math.cos(am) * R;
    const z = WELT_N + 0.5 + R - Math.sin(am) * R;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(am, 0, 0));
    const pos = new THREE.Vector3(0, y, z).addScaledVector(new THREE.Vector3(0, Math.cos(am), Math.sin(am)), -0.2);
    statischeBox(pos, [30, 0.2, len / 2], q, i % 2 ? "#8fb3c9" : "#9cc0d6");
  }

  // pylonen (beweglich, nur lokal simuliert)
  for (let i = 0; i < 12; i++) {
    const x = 66 + (i % 2 ? 2.5 : -2.5);
    const z = 44 - i * 5;
    const mesh = new THREE.Group();
    const kegel = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 16), mat("#ff6a1a"));
    kegel.position.y = 0.375;
    const streifen = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.12, 16), mat("#ffffff"));
    streifen.position.y = 0.42;
    const fuss = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.6), mat("#222222"));
    fuss.position.y = 0.025;
    for (const m of [kegel, streifen, fuss]) { m.castShadow = true; mesh.add(m); }
    scene.add(mesh);
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 0, z));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.025, 0.3).setTranslation(0, 0.025, 0).setMass(2), rb);
    world.createCollider(RAPIER.ColliderDesc.cone(0.375, 0.28).setTranslation(0, 0.375, 0).setMass(1), rb);
    pylonen.push({ rb, mesh });
  }
}

// die große karte kommt fertig erzeugt aus welt.json (nicht zur laufzeit generiert)
const WELTDATEN = await ladeWeltDaten("welt.json");
const bodenHoehe = (x, z) => (WELTDATEN ? hoeheBei(WELTDATEN, x, z) : 0);
const lotSchilder = [];
const pylonen = [];
baueWelt();

// ---------------------------------------------------------------------------
// zustand
// ---------------------------------------------------------------------------
const PLAN_KEY = "bastelkarre-plan";
let plan;
try {
  plan = BAU.bereinige(JSON.parse(localStorage.getItem(PLAN_KEY) || "null"));
} catch {
  plan = null;
}
if (!plan || !plan.parts.length) plan = BAU.bereinige(BAU.starterKart());

let modus = "bau";
let meinLot = 0;
let meineId = null;
let spawnZaehler = 0;
let auswahlTyp = "block";
let auswahlFarbe = BAU.FARBEN[0];
let werkzeug = "setzen";
let drehY = 0, kippX = 0, drehAnbau = 0;
let koerperFarben = false;
const verlauf = [];
let geist = null;          // vorschau des nächsten teils
let geistSchluessel = "";

let meinFahrzeug = null;  // physik
let meineGrafik = null;   // gruppen je körper
let bauGrafik = null;     // anzeige auf dem parkplatz

const meineFigur = spielfigur(spielerFarbe, spielerLook);
meineFigur.scale.setScalar(0.62);
scene.add(meineFigur);
const meinNamensschild = textSprite(spielerName);
meinNamensschild.position.set(0, 2.0, 0);
meineFigur.add(meinNamensschild);

// ---------------------------------------------------------------------------
// bauansicht
// ---------------------------------------------------------------------------
function lotBasis(lot, lift) {
  return lotPos(lot).add(new THREE.Vector3(0, lift, 0));
}

function stelleAuf(grafik, basis) {
  grafik.groups.forEach((g, i) => {
    const u = grafik.ana.bodies[i].ursprung;
    g.position.set(basis.x + u[0], basis.y + u[1], basis.z + u[2]);
    g.quaternion.identity();
  });
}

function entferneGrafik(grafik) {
  if (!grafik) return;
  // figuren in den sitzen nicht mit entsorgen
  for (const s of grafik.sitze || []) {
    for (const c of [...s.obj.children]) if (c.userData.clothes) scene.attach(c);
  }
  for (const g of grafik.groups) {
    scene.remove(g);
    entsorge(g);
  }
}

function setzeFigurInSitz(figur, grafik, standort) {
  figur.removeFromParent();
  if (grafik?.sitz) {
    grafik.sitz.obj.add(figur);
    figur.position.set(0, -0.3, 0.02);
    figur.quaternion.identity();
    figur.scale.setScalar(0.62 / grafik.sitz.obj.scale.x);
    setzeSitzen(figur, true);
  } else {
    scene.add(figur);
    figur.position.copy(standort);
    figur.rotation.set(0, Math.PI * 0.75, 0);
    figur.scale.setScalar(0.62);
    setzeSitzen(figur, false);
  }
}

function baueBauansicht() {
  entferneGrafik(bauGrafik);
  bauGrafik = fahrzeugGrafik(plan, { koerperFarben });
  for (const g of bauGrafik.groups) scene.add(g);
  stelleAuf(bauGrafik, lotBasis(meinLot, BAU.bodenAbstand(plan)));
  if (modus === "bau") {
    setzeFigurInSitz(meineFigur, null, lotPos(meinLot).add(new THREE.Vector3(6.9, 0, -6.9)));
  }
  $("#teileZahl").textContent = `${plan.parts.length}`;
}

function planGeaendert(merken = true) {
  if (merken) {
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    } catch {}
  }
  baueBauansicht();
  sendePlanBald();
  if (merken) Konto.planGeaendert();
}

// fahrzeug aus dem konto übernehmen (garage oder anmeldung auf neuem gerät)
function planAusKonto(text) {
  let neu;
  try {
    neu = BAU.bereinige(JSON.parse(text));
  } catch {
    return;
  }
  if (!neu.parts.length) return;
  if (modus !== "bau") return meldung("Zum Laden erst in den Baumodus wechseln");
  merkeVerlauf();
  plan = neu;
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch {}
  baueBauansicht();
  const ausdehnung = ["x", "y", "z"].map(a => {
    const w = plan.parts.map(p => p[a]);
    return (Math.max(...w) - Math.min(...w) + 1) * BAU.ZELLE;
  });
  bauKamera.dist = THREE.MathUtils.clamp(Math.max(...ausdehnung) * 1.5 + 3, 9, 40);
  bauKamera.ziel.y = 0.4 + ausdehnung[1] * 0.4;
  sendePlanBald();
  meldung("Fahrzeug geladen");
}

function merkeVerlauf() {
  verlauf.push(JSON.stringify(plan));
  if (verlauf.length > 100) verlauf.shift();
}

// ---------------------------------------------------------------------------
// baupanel
// ---------------------------------------------------------------------------
const palette = $("#palette");
const gruppen = {};
for (const [typ, def] of Object.entries(BAU.TEILE)) (gruppen[def.gruppe] ||= []).push(typ);
for (const [name, typen] of Object.entries(gruppen)) {
  const h = document.createElement("h3");
  h.textContent = tr(name);
  palette.append(h);
  const box = document.createElement("div");
  box.className = "gruppe";
  for (const typ of typen) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = tr(BAU.TEILE[typ].name);
    b.title = tr(BAU.TEILE[typ].name);
    b.dataset.typ = typ;
    b.onclick = () => waehleTyp(typ);
    box.append(b);
  }
  palette.append(box);
}

// mausrad scrollt die (im handheld-modus waagerechte) leiste seitlich
palette.addEventListener("wheel", e => {
  if (document.body.classList.contains("touch") && palette.scrollWidth > palette.clientWidth) {
    palette.scrollLeft += e.deltaY + e.deltaX;
    e.preventDefault();
  }
}, { passive: false });

function waehleTyp(typ) {
  auswahlTyp = typ;
  for (const b of palette.querySelectorAll("button")) {
    b.classList.toggle("an", b.dataset.typ === typ);
    if (b.dataset.typ === typ && document.body.classList.contains("touch")) {
      b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }
  setzeWerkzeug("setzen");
  geistSchluessel = "";
}
waehleTyp("block");

const farbenEl = $("#farben");
function baueFarben() {
  farbenEl.innerHTML = "";
  for (const f of BAU.FARBEN) {
    const b = document.createElement("button");
    b.type = "button";
    b.style.background = f;
    b.title = f;
    b.classList.toggle("an", f === auswahlFarbe);
    b.onclick = () => { auswahlFarbe = f; baueFarben(); geistSchluessel = ""; };
    farbenEl.append(b);
  }
  const eigene = document.createElement("input");
  eigene.type = "color";
  eigene.value = auswahlFarbe;
  eigene.title = tr("Eigene Farbe");
  eigene.oninput = () => { auswahlFarbe = eigene.value; geistSchluessel = ""; };
  farbenEl.append(eigene);
}
baueFarben();

function setzeWerkzeug(w) {
  werkzeug = w;
  for (const b of document.querySelectorAll("[data-tool]")) b.classList.toggle("an", b.dataset.tool === w);
}
for (const b of document.querySelectorAll("[data-tool]")) b.onclick = () => setzeWerkzeug(b.dataset.tool);

function drehen() {
  if (BAU.TEILE[auswahlTyp].art === "anbau") drehAnbau = (drehAnbau + 1) % 4;
  else drehY = (drehY + 1) % 4;
  geistSchluessel = "";
}
function kippen() {
  kippX = (kippX + 1) % 4;
  geistSchluessel = "";
}
function schalteKoerper() {
  koerperFarben = !koerperFarben;
  $("#btnKoerper").classList.toggle("an", koerperFarben);
  baueBauansicht();
  meldung(koerperFarben ? "Jede Farbe = ein starrer Körper. Gleiche Farbe = fest verbunden." : "Normale Farben");
}
function rueckgaengig() {
  if (!verlauf.length) return meldung("Nichts rückgängig zu machen");
  plan = BAU.bereinige(JSON.parse(verlauf.pop()));
  schliesseInspector();
  planGeaendert();
}
$("#btnDrehen").onclick = drehen;
$("#btnKippen").onclick = kippen;
$("#btnKoerper").onclick = schalteKoerper;
$("#btnUndo").onclick = rueckgaengig;
// hangar-knopf im bauen-panel: öffnet denselben dialog wie das symbol oben (dort liegen auch die vorlagen)
$("#btnHangar").onclick = () => document.getElementById("modelleBtn")?.click();
// json-export/-import des fahrzeugs (import läuft durch bereinige)
$("#btnExport").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(plan)], { type: "application/json" }));
  a.download = "bastelkarre.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("#btnImport").onclick = () => $("#importDatei").click();
$("#importDatei").onchange = async e => {
  const datei = e.target.files[0];
  e.target.value = "";
  if (!datei) return;
  let neu = null;
  try {
    neu = BAU.bereinige(JSON.parse(await datei.text()));
  } catch {}
  if (!neu || !neu.parts.length) return meldung("Ungültige Fahrzeug-Datei");
  merkeVerlauf();
  plan = neu;
  schliesseInspector();
  planGeaendert();
  meldung("Fahrzeug importiert (Rückgängig mit Strg+Z)");
};
$("#btnLeeren").onclick = () => {
  if (!plan.parts.length) return;
  merkeVerlauf();
  plan = { v: 1, parts: [] };
  schliesseInspector();
  planGeaendert();
  meldung("Alles entfernt (Rückgängig mit Strg+Z)");
};

// ---------------------------------------------------------------------------
// einstellungen eines teils (inspector)
// ---------------------------------------------------------------------------
const inspector = $("#inspector");
const inspInhalt = $("#inspInhalt");
let inspTeil = -1;
let tastenWarten = null;

const TASTEN_NAMEN = {
  space: "Leertaste", shift: "Shift", control: "Strg", alt: "Alt", enter: "Enter",
  arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", tab: "Tab", backspace: "⌫"
};
const tastenText = t => (TASTEN_NAMEN[t] ? tr(TASTEN_NAMEN[t]) : (t || "–").toUpperCase());

function tasteNorm(e) {
  if (e.key === " ") return "space";
  return e.key.toLowerCase();
}

function schliesseInspector() {
  inspTeil = -1;
  tastenWarten = null;
  inspector.hidden = true;
}

function oeffneInspector(i) {
  inspTeil = i;
  inspector.hidden = false;
  zeigeInspector();
}

function zeigeInspector() {
  const p = plan.parts[inspTeil];
  if (!p) return schliesseInspector();
  const def = BAU.TEILE[p.t];
  $("#inspTitel").textContent = tr(def.name);
  inspInhalt.innerHTML = "";

  const aendern = fn => {
    merkeVerlauf();
    fn();
    planGeaendert();
    zeigeInspector();
  };

  const feld = (label, element, wert) => {
    const d = document.createElement("div");
    d.className = "feld";
    const l = document.createElement("span");
    l.textContent = tr(label);
    d.append(l);
    if (wert !== undefined) {
      const w = document.createElement("span");
      w.className = "wert";
      w.textContent = wert;
      d.append(w);
    }
    d.append(element);
    inspInhalt.append(d);
    return d;
  };

  const regler = (label, key, min, max, step, einheit) => {
    const r = document.createElement("input");
    r.type = "range";
    r.min = min; r.max = max; r.step = step;
    r.value = p.k[key];
    const d = feld(label, r, `${p.k[key]}${einheit}`);
    r.value = Math.min(max, Math.max(min, p.k[key]));   // der regler zeigt nur seinen bereich, gespeichert bleibt der echte wert
    // zahlenfeld: auch werte außerhalb des reglers (bis zur harten grenze) lassen sich eingeben und speichern
    const zahl = document.createElement("input");
    zahl.type = "number";
    zahl.className = "wertFeld";
    zahl.step = step;
    zahl.value = p.k[key];
    zahl.title = tr("Auch Werte außerhalb des Reglers sind möglich");
    const [lo, hi] = BAU.GRENZEN[key] || [-1e9, 1e9];
    const wertBox = d.querySelector(".wert");   // zahlenfeld und einheit in einer zelle des rasters
    wertBox.textContent = "";
    wertBox.append(zahl, document.createTextNode(einheit));
    r.oninput = () => { zahl.value = r.value; };
    r.onchange = () => aendern(() => { p.k[key] = Number(r.value); });
    zahl.onchange = () => {
      const v = Number(zahl.value);
      if (!Number.isFinite(v)) { zahl.value = p.k[key]; return; }
      const geklemmt = Math.min(hi, Math.max(lo, v));
      if (geklemmt !== v) meldung("Wert auf die zulässige Grenze begrenzt");
      aendern(() => { p.k[key] = geklemmt; });
    };
  };

  const auswahl = (label, key, optionen) => {
    const s = document.createElement("select");
    for (const [v, t] of optionen) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = tr(t);
      if (String(p.k[key]) === String(v)) o.selected = true;
      s.append(o);
    }
    feld(label, s);
    s.onchange = () => aendern(() => {
      p.k[key] = s.value === "true" ? true : s.value === "false" ? false : s.value;
    });
  };

  const taste = (label, key) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "taste";
    b.textContent = tastenText(p.k[key]);
    b.onclick = () => {
      b.classList.add("warte");
      b.textContent = tr("Taste drücken …");
      tastenWarten = t => aendern(() => { p.k[key] = t; });
    };
    feld(label, b);
  };

  const farbe = (label, key) => {
    const f = document.createElement("input");
    f.type = "color";
    f.value = p.k[key];
    feld(label, f);
    f.onchange = () => aendern(() => { p.k[key] = f.value; });
  };

  // teilfarbe
  const fz = document.createElement("div");
  fz.className = "zeile";
  for (const f of BAU.FARBEN) {
    const b = document.createElement("button");
    b.type = "button";
    b.style.cssText = `background:${f};width:22px;height:22px;padding:0;border-radius:50%;flex:0 0 auto`;
    if (f === p.c) b.style.outline = "2px solid #fff";
    b.onclick = () => aendern(() => { p.c = f; });
    fz.append(b);
  }
  const eigene = document.createElement("input");
  eigene.type = "color";
  eigene.value = p.c;
  eigene.onchange = () => aendern(() => { p.c = eigene.value; });
  fz.append(eigene);
  inspInhalt.append(fz);

  const groessen = [["S", "Klein"], ["M", "Mittel"], ["L", "Groß"]];
  switch (p.t) {
    case "rad_lenk":
      regler("Max. Lenkwinkel", "winkel", 5, 60, 1, "°");
      auswahl("Größe", "groesse", groessen);
      auswahl("Antrieb", "antrieb", [[true, "angetrieben"], [false, "frei rollend"]]);
      auswahl("Lenkrichtung", "umkehr", [["auto", "automatisch"], ["nein", "normal"], ["ja", "umgekehrt"]]);
      break;
    case "rad_fest":
      auswahl("Größe", "groesse", groessen);
      auswahl("Antrieb", "antrieb", [[true, "angetrieben"], [false, "frei rollend"]]);
      break;
    case "rad_bock":
      auswahl("Größe", "groesse", groessen);
      break;
    case "auspuff":
      farbe("Abgasfarbe", "farbe");
      break;
    case "nebel":
      farbe("Nebelfarbe", "farbe");
      taste("An/Aus", "taste");
      break;
    case "duese":
      taste("Schub (halten)", "taste");
      regler("Schub", "schub", 1, 200, 0.5, " kN");
      break;
    case "rakete":
      taste("Zünden (halten)", "taste");
      regler("Schub", "schub", 5, 1000, 1, " kN");
      regler("Brenndauer", "dauer", 1, 8, 0.5, " s");
      break;
    case "fluegel":
      regler("Auftriebsfläche", "flaeche", 0.5, 8, 0.5, " m²");
      break;
    case "steuerflaeche": {
      regler("Fläche", "flaeche", 0.5, 4, 0.5, " m²");
      regler("Max. Ausschlag", "winkel", 5, 45, 1, "°");
      const ks = document.createElement("select");
      for (const [v, t] of [["nick", "Nicken (Höhenruder)"], ["roll", "Rollen (Querruder)"], ["gier", "Gieren (Seitenruder)"]]) {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = tr(t);
        if (p.k.kanal === v) o.selected = true;
        ks.append(o);
      }
      feld("Kanal", ks);
      ks.onchange = () => aendern(() => {
        p.k.kanal = ks.value;
        [p.k.plus, p.k.minus] = BAU.KANAL_TASTEN[ks.value];
      });
      auswahl("Richtung", "gegenlauf", [[false, "normal"], [true, "gegenläufig"]]);
      taste("Ausschlag +", "plus");
      taste("Ausschlag −", "minus");
      break;
    }
    case "scheinwerfer":
      taste("An/Aus", "taste");
      farbe("Lichtfarbe", "farbe");
      break;
    case "propeller":
      taste("Gashebel +", "plus");
      taste("Gashebel −", "minus");
      regler("Schub", "schub", 0.5, 10, 0.5, " kN");
      break;
    case "tank":
      regler("Kapazität", "kapazitaet", 10, 300, 10, "");
      break;
    case "kamera":
      taste("Ansicht umschalten", "taste");
      regler("Blickfeld", "fov", 30, 120, 5, "°");
      break;
    case "fallschirm":
      taste("Öffnen/Einpacken", "taste");
      regler("Schirmfläche", "flaeche", 2, 40, 1, " m²");
      farbe("Schirmfarbe", "farbe");
      break;
    case "servo":
      taste("Drehen +", "plus");
      taste("Drehen −", "minus");
      auswahl("Modus", "modus", [["winkel", "Winkel halten"], ["dauer", "Dauerdrehung"]]);
      if (p.k.modus !== "dauer") regler("Max. Winkel", "winkel", 10, 180, 5, "°");
      regler("Tempo", "tempo", 10, 360, 10, "°/s");
      break;
    case "bruch":
      taste("Trennen", "taste");
      break;
  }

  const hinweis = document.createElement("p");
  hinweis.style.cssText = "color:var(--muted);margin:10px 0 6px;line-height:1.35";
  hinweis.className = "hinweis";
  hinweis.textContent = tr({
    sitz: "Hier sitzt du (X zum Ein-/Aussteigen). Beliebig viele Sitze möglich; der zuerst gebaute legt fest, wo vorne ist.",
    rad_lenk: "Lenkt mit A/D. Räder hinter dem Schwerpunkt lenken automatisch gegenläufig.",
    rad_fest: "Starres Rad: rollt nur geradeaus.",
    rad_bock: "Dreht sich frei um 360° und folgt der Bewegung. Kein Antrieb.",
    auspuff: "Raucht, solange der Motor läuft (M schaltet ihn aus und an).",
    nebel: "Nebelt auf Knopfdruck, auch ohne Motor.",
    duese: "Schiebt den Körper, an dem es sitzt, auch wenn es nicht verbunden ist.",
    fluegel: "Erzeugt Auftrieb und Luftwiderstand, je nach Anstellwinkel zur Anströmung (Strömungsabriss ab ca. 17°). Schräg einbauen (T kippt) oder das Fahrzeug nach oben nicken, damit er trägt. Die Fläche ist die wirksame Auftriebsfläche.",
    steuerflaeche: "Ruder: kippt ihre Hinterkante mit den Tasten. Kanal Nicken = Höhenruder (hinten), Rollen = Querruder (links und rechts gegenläufig!), Gieren = Seitenruder (senkrecht stellen mit T). Hinterkante ist die gelbe Seite.",
    scheinwerfer: "Leuchtet nach vorn (in Richtung der Linse). Die Taste schaltet ihn an und aus.",
    leiter: "Zu Fuß hochklettern: W/S an der Leiter, Leertaste springt ab. Mehrere Leitern übereinander ergeben eine lange Leiter (R/T dreht sie).",
    propeller: "Schiebt wie ein Propeller: Die Gashebel-Tasten stellen die Leistung ein und sie bleibt eingestellt. Der Schub sinkt in dünner Luft; im Weltraum gibt es keinen.",
    tank: "Treibstoff für Triebwerke, Propeller und den Fahrmotor (Raketen haben eigenen). Mit Tank geht ohne Treibstoff nichts, ohne Tank ist der Verbrauch aus. K schaltet den Verbrauch aus und an.",
    kamera: "Schalte mit der Taste auf den Blick durch die Kamera um (ohne im Fahrzeug zu sein). Sie schaut in Richtung der Linse.",
    fallschirm: "Taste öffnet den Schirm, nochmal drücken packt ihn ein. Er bremst umso stärker, je schneller du bist – auch beim Fallen.",
    rakete: "Sehr starker Schub, aber nur für die Brenndauer. Danach lädt sie wieder auf.",
    servo: "Alles, was oben (an der Drehscheibe) angebaut ist, dreht sich gegen den Rest.",
    bruch: "Hält fest, bis du die Taste drückst. Dann trennt sie die Teile."
  }[p.t] || "");
  if (hinweis.textContent) inspInhalt.append(hinweis);

  const weg = document.createElement("button");
  weg.type = "button";
  weg.textContent = tr("Teil entfernen");
  weg.onclick = () => { entferneTeil(inspTeil); };
  const z = document.createElement("div");
  z.className = "zeile";
  z.append(weg);
  inspInhalt.append(z);
}
$("#inspZu").onclick = schliesseInspector;

function entferneTeil(i) {
  if (i < 0 || !plan.parts[i]) return;
  merkeVerlauf();
  plan.parts.splice(i, 1);
  schliesseInspector();
  planGeaendert();
}

// ---------------------------------------------------------------------------
// kamera
// ---------------------------------------------------------------------------
const bauKamera = { yaw: 0.75, pitch: 0.55, dist: 9, ziel: new THREE.Vector3() };
const fahrKamera = { yawOffset: 0, pitch: 0.28, dist: 8, zuletztGezogen: 0, pos: new THREE.Vector3(), blick: new THREE.Vector3(), yaw: 0 };
let fov = 60;

function setzeBauZiel() {
  bauKamera.ziel.copy(lotPos(meinLot)).add(new THREE.Vector3(0, 0.8, 0));
}
setzeBauZiel();

function kameraBau() {
  const k = bauKamera;
  camera.position.set(
    k.ziel.x + Math.sin(k.yaw) * Math.cos(k.pitch) * k.dist,
    k.ziel.y + Math.sin(k.pitch) * k.dist,
    k.ziel.z + Math.cos(k.yaw) * Math.cos(k.pitch) * k.dist
  );
  camera.lookAt(k.ziel);
}

// ---------------------------------------------------------------------------
// eingabe
// ---------------------------------------------------------------------------
const gedrueckt = new Set();
const touchGedrueckt = new Set();
// kurz angetippte tasten: bleiben bis zum nächsten physikschritt gemerkt,
// auch wenn sie schon vor dem nächsten frame losgelassen wurden.
const angetippt = new Set();
let touchModus = matchMedia("(pointer: coarse)").matches;
let joyX = 0, joyY = 0, joyPointer = null;
// welche kanäle der steuerflächen das fahrzeug hat: dann übernimmt der joystick nicken (y) und rollen (x) statt gas und lenken
let steuerKanaele = { nick: false, roll: false };
const chatInput = $("#chatInput");
const tippt = () => document.activeElement === chatInput;

function setzeTouch(an) {
  touchModus = an;
  document.body.classList.toggle("touch", an);
  zeigeHinweis();
}

function zeigeHinweis() {
  let text;
  if (modus === "bau") {
    text = touchModus
      ? "Tippen = Werkzeug · Ziehen = drehen · Zwei Finger = zoomen/schieben"
      : "Linksklick setzen · Rechtsklick entfernen · Mittelklick einstellen · Ziehen dreht die Ansicht · WASD schiebt · R/T drehen/kippen";
  } else {
    text = touchModus
      ? (steuerKanaele.nick || steuerKanaele.roll ? "Joystick: Nicken und Rollen · Knöpfe rechts: Gieren und Teile" : "Joystick fahren · Knöpfe rechts für Teile")
      : "WASD fahren · Leertaste bremsen · X aus-/einsteigen oder Klick auf einen Sitz · M Motor · C Kamera · Tab zurück zum Bauen · Rücktaste neu starten";
  }
  hintEl.textContent = tr(text);
  hintEl.hidden = false;
  clearTimeout(zeigeHinweis.t);
  zeigeHinweis.t = setTimeout(() => (hintEl.hidden = true), 9000);
}
setzeTouch(touchModus);

addEventListener("keydown", e => {
  if (tastenWarten) {
    e.preventDefault();
    const fn = tastenWarten;
    tastenWarten = null;
    if (e.key === "Escape") return zeigeInspector();
    if (tasteNorm(e) === "x") {
      meldung("X ist zum Ein- und Aussteigen reserviert");
      return zeigeInspector();
    }
    fn(tasteNorm(e));
    return;
  }
  if (tippt()) {
    if (e.key === "Escape") chatInput.blur();
    return;
  }
  if (document.activeElement && ["INPUT", "SELECT"].includes(document.activeElement.tagName)) {
    if (e.key !== "Escape") return;
    document.activeElement.blur();
  }
  const t = tasteNorm(e);
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "space", "tab", "backspace"].includes(t)) e.preventDefault();

  if (t === "enter") {
    e.preventDefault();
    chatInput.focus();
    return;
  }
  if (t === "tab") return wechsleModus();

  if (modus === "bau") {
    if ((e.ctrlKey || e.metaKey) && t === "z") return rueckgaengig();
    if (t === "r") drehen();
    if (t === "t") kippen();
    if (t === "v") schalteKoerper();
    if (t === "escape") schliesseInspector();
    if (t === "delete" && inspTeil >= 0) entferneTeil(inspTeil);
  } else {
    if (t === "backspace") return neuStarten();
    if (t === "x" && !e.repeat) return ausEinsteigen();
    if (t === "k" && !e.repeat) return schalteVerbrauch();
    if (t === "m" && !e.repeat && meinFahrzeug) {
      meinFahrzeug.motorAn = !meinFahrzeug.motorAn;
      meldung(meinFahrzeug.motorAn ? "Motor an" : "Motor aus");
    }
    if (t === "c" && !e.repeat) schalteAnsicht();
  }
  if (!e.repeat) angetippt.add(t);
  gedrueckt.add(t);
});
addEventListener("keyup", e => {
  gedrueckt.delete(tasteNorm(e));
  if (e.key === "Shift") gedrueckt.delete("shift");
});
addEventListener("blur", () => gedrueckt.clear());
chatInput.addEventListener("focus", () => gedrueckt.clear());

// zeiger: klick = werkzeug, ziehen = kamera
const zeiger = new Map();
let pinchAbstand = 0;
let zeigerStart = null;
const maus = new THREE.Vector2(-2, -2);
let mausAufCanvas = false;

canvas.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("pointerdown", e => {
  setzeTouch(e.pointerType !== "mouse");
  canvas.setPointerCapture(e.pointerId);
  zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (zeiger.size === 1) zeigerStart = { x: e.clientX, y: e.clientY, button: e.button, alt: e.altKey, shift: e.shiftKey, gezogen: false };
  else zeigerStart = null;
  if (zeiger.size === 2) pinchAbstand = pinchJetzt();
  aktualisiereMaus(e);
});

function pinchJetzt() {
  const [a, b] = [...zeiger.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function aktualisiereMaus(e) {
  const r = canvas.getBoundingClientRect();
  maus.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}

canvas.addEventListener("pointermove", e => {
  mausAufCanvas = true;
  aktualisiereMaus(e);
  const p = zeiger.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;

  if (zeiger.size >= 2) {
    const jetzt = pinchJetzt();
    if (pinchAbstand > 0) zoom(pinchAbstand / jetzt);
    pinchAbstand = jetzt;
    if (modus === "bau") schiebeBau(dx * 0.5, dy * 0.5);
    return;
  }
  if (zeigerStart && !zeigerStart.gezogen &&
      Math.hypot(e.clientX - zeigerStart.x, e.clientY - zeigerStart.y) > 6) {
    zeigerStart.gezogen = true;
  }
  if (!zeigerStart?.gezogen) return;

  if (modus === "bau") {
    if (zeigerStart.button === 2 || zeigerStart.shift) schiebeBau(dx, dy);
    else {
      bauKamera.yaw -= dx * 0.006;
      bauKamera.pitch = THREE.MathUtils.clamp(bauKamera.pitch + dy * 0.005, 0.05, 1.45);
    }
  } else {
    if (ansicht === 2) {
      // ich-perspektive: ziehen dreht den kopf (im fahrzeug) bzw. den körper (zu fuß)
      if (ichSitz) egoBlick.yaw -= dx * 0.005;
      else fuss.yaw -= dx * 0.005;
      egoBlick.pitch = THREE.MathUtils.clamp(egoBlick.pitch - dy * 0.004, -1.35, 1.35);
    } else if (istFahrer()) {
      fahrKamera.yawOffset -= dx * 0.006;
      fahrKamera.pitch = THREE.MathUtils.clamp(fahrKamera.pitch + dy * 0.004, -0.1, 1.2);
      fahrKamera.zuletztGezogen = performance.now();
    } else {
      fuss.yaw -= dx * 0.006;
      fuss.pitch = THREE.MathUtils.clamp(fuss.pitch + dy * 0.004, -0.2, 1.3);
    }
  }
});

function zeigerEnde(e) {
  const start = zeigerStart;
  zeiger.delete(e.pointerId);
  pinchAbstand = 0;
  if (zeiger.size === 0) zeigerStart = null;
  if (!start || start.gezogen) return;
  if (modus === "fahr") {
    if (e.type !== "pointercancel" && (e.pointerType !== "mouse" || start.button === 0)) {
      aktualisiereMaus(e);
      klickSitz();
    }
    return;
  }
  if (modus !== "bau") return;
  if (e.type === "pointercancel") return;
  aktualisiereMaus(e);
  let w = werkzeug;
  if (e.pointerType === "mouse") {
    if (start.button === 2) w = "entfernen";
    else if (start.button === 1 || start.alt) w = "einstellen";
  }
  bauKlick(w);
}
canvas.addEventListener("pointerup", zeigerEnde);
canvas.addEventListener("pointercancel", zeigerEnde);
canvas.addEventListener("pointerleave", () => { mausAufCanvas = false; });

canvas.addEventListener("wheel", e => {
  e.preventDefault();
  zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12);
}, { passive: false });

function zoom(f) {
  if (modus === "bau") bauKamera.dist = THREE.MathUtils.clamp(bauKamera.dist * f, 2.5, 40);
  else if (istFahrer()) fahrKamera.dist = THREE.MathUtils.clamp(fahrKamera.dist * f, 3, 30);
  else fuss.dist = THREE.MathUtils.clamp(fuss.dist * f, 2, 20);
}

function schiebeBau(dx, dy) {
  const k = bauKamera;
  const s = k.dist * 0.0018;
  const rechts = new THREE.Vector3(Math.cos(k.yaw), 0, -Math.sin(k.yaw));
  const vor = new THREE.Vector3(-Math.sin(k.yaw), 0, -Math.cos(k.yaw));
  k.ziel.addScaledVector(rechts, -dx * s).addScaledVector(vor, dy * s);
  begrenzeBauZiel();
}

function begrenzeBauZiel() {
  const lp = lotPos(meinLot);
  bauKamera.ziel.x = THREE.MathUtils.clamp(bauKamera.ziel.x, lp.x - 7, lp.x + 7);
  bauKamera.ziel.z = THREE.MathUtils.clamp(bauKamera.ziel.z, lp.z - 7, lp.z + 7);
}

// joystick
const joystick = $("#joystick"), stick = $("#stick");
joystick.addEventListener("pointerdown", e => {
  e.preventDefault();
  setzeTouch(true);
  joyPointer = e.pointerId;
  joystick.setPointerCapture(e.pointerId);
  bewegeJoystick(e);
});
joystick.addEventListener("pointermove", e => { if (e.pointerId === joyPointer) bewegeJoystick(e); });
const joyLos = e => {
  if (e.pointerId !== joyPointer) return;
  joyPointer = null;
  joyX = joyY = 0;
  stick.style.transform = "";
};
joystick.addEventListener("pointerup", joyLos);
joystick.addEventListener("pointercancel", joyLos);
function bewegeJoystick(e) {
  const r = joystick.getBoundingClientRect();
  const max = r.width * 0.32;
  const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const len = Math.hypot(dx, dy) || 1;
  const s = Math.min(1, max / len);
  joyX = THREE.MathUtils.clamp(dx / max, -1, 1);
  joyY = THREE.MathUtils.clamp(dy / max, -1, 1);
  stick.style.transform = `translate(${dx * s}px, ${dy * s}px)`;
}

// ---------------------------------------------------------------------------
// bauen: zielzelle unter dem mauszeiger, vorschau, setzen/entfernen
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const bodenEbene = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function trefferBau() {
  raycaster.setFromCamera(maus, camera);
  const objs = bauGrafik ? bauGrafik.groups : [];
  const hits = raycaster.intersectObjects(objs, true);
  for (const h of hits) {
    if (h.object.userData.teil === undefined || !h.face) continue;
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const normal = ax >= ay && ax >= az ? [Math.sign(n.x), 0, 0] : ay >= az ? [0, Math.sign(n.y), 0] : [0, 0, Math.sign(n.z)];
    return { teil: h.object.userData.teil, normal };
  }
  const p = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(bodenEbene, p)) {
    const lp = lotPos(meinLot);
    const x = Math.floor((p.x - lp.x) / BAU.ZELLE), z = Math.floor((p.z - lp.z) / BAU.ZELLE);
    if (BAU.inBauraum(x, 0, z)) return { boden: [x, 0, z], normal: [0, 1, 0] };
  }
  return null;
}

function neuesTeil(treffer) {
  let zelle;
  if (treffer.boden) zelle = treffer.boden;
  else {
    const q = plan.parts[treffer.teil];
    zelle = [q.x + treffer.normal[0], q.y + treffer.normal[1], q.z + treffer.normal[2]];
  }
  const def = BAU.TEILE[auswahlTyp];
  const o = def.art === "anbau" ? BAU.orientFromUp(treffer.normal, drehAnbau) : BAU.orientFromYawTilt(drehY, kippX);
  const p = { t: auswahlTyp, x: zelle[0], y: zelle[1], z: zelle[2], o, c: auswahlFarbe, k: BAU.standardEinstellungen(auswahlTyp, plan) };
  if (auswahlTyp.startsWith("rad") || ["auspuff", "duese", "rakete", "servo"].includes(auswahlTyp)) {
    if (auswahlFarbe === BAU.FARBEN[0]) p.c = auswahlTyp.startsWith("rad") ? "#2b2f36" : "#8b8f98";
  }
  return p;
}

// ist das neue teil mit etwas verbunden?
function verbunden(p) {
  const probe = { v: 1, parts: [...plan.parts, p] };
  const ana = BAU.analysiere(probe);
  const i = probe.parts.length - 1;
  const b = ana.bodies[ana.bodyOf[i]];
  return b.parts.length > 1 || ana.gelenke.some(g => g.bodyA === ana.bodyOf[i] || g.bodyB === ana.bodyOf[i]);
}

function aktualisiereGeist() {
  if (modus !== "bau" || !mausAufCanvas || werkzeug !== "setzen" || touchModus) {
    if (geist) geist.visible = false;
    return;
  }
  const t = trefferBau();
  if (!t) {
    if (geist) geist.visible = false;
    return;
  }
  const p = neuesTeil(t);
  const fehler = BAU.pruefePlatz(plan, p);
  const farbe = fehler ? "#ff4040" : verbunden(p) ? "#46e07a" : "#ffd43b";
  const key = `${p.t}|${p.o}|${p.c}|${JSON.stringify(p.k)}|${farbe}`;
  if (key !== geistSchluessel) {
    if (geist) scene.remove(geist);
    geist = geistModell(p, farbe);
    scene.add(geist);
    geistSchluessel = key;
  }
  const c = BAU.zellMitte(p);
  const basis = lotBasis(meinLot, BAU.bodenAbstand(plan));
  geist.position.set(basis.x + c[0], basis.y + c[1], basis.z + c[2]);
  geist.visible = true;
}

function bauKlick(w) {
  const t = trefferBau();
  if (!t) return;
  if (w === "entfernen") {
    if (t.teil !== undefined) entferneTeil(t.teil);
    return;
  }
  if (w === "einstellen") {
    if (t.teil !== undefined) oeffneInspector(t.teil);
    return;
  }
  const p = neuesTeil(t);
  const fehler = BAU.pruefePlatz(plan, p);
  if (fehler) return meldung(fehler);
  merkeVerlauf();
  plan.parts.push(p);
  if (!verbunden(p)) meldung("Nicht verbunden: das Teil liegt lose herum");
  planGeaendert();
  if (["nebel", "duese", "rakete", "servo", "bruch", "fallschirm", "kamera", "steuerflaeche", "scheinwerfer", "propeller", "tank"].includes(p.t)) {
    oeffneInspector(plan.parts.length - 1);
  }
}


// ---------------------------------------------------------------------------
// ein- und aussteigen
// ---------------------------------------------------------------------------
let ichSitz = null;        // { o: "ich" | spieler-id, i: teilindex des sitzes } oder null (zu fuß)
let ichSitzObj = null;
let fussRb = null, fussCol = null;
const fuss = { yaw: 0, pitch: 0.3, dist: 5 };
const FUSS_H = 0.5;         // kapselmitte über den füßen
const idVon = o => (o === "ich" ? meineId || "ich" : o);
const istFahrer = () => !!(ichSitz && ichSitz.o === "ich" && meinFahrzeug);

function besitzerGrafik(o) {
  if (o === "ich" || (meineId && o === meineId)) return meineGrafik;
  const r = andere.get(String(o));
  return r && r.m === "fahr" ? r.grafik : null;
}

function sitzObjekt(ref) {
  const g = ref && besitzerGrafik(ref.o);
  return g ? g.sitze.find(s => s.index === ref.i) || null : null;
}

function sitzBelegt(o, i) {
  const id = idVon(o);
  if (ichSitz && idVon(ichSitz.o) === id && ichSitz.i === i) return true;
  for (const r of andere.values()) {
    if (r.m === "fahr" && r.sit && r.sit[0] === id && r.sit[1] === i) return true;
  }
  return false;
}

const tmpSitzPos = new THREE.Vector3();
function naechsterSitz() {
  const p = meineFigur.getWorldPosition(new THREE.Vector3());
  p.y += 0.5;
  let best = null, bd = 3.2;
  const pruefe = (o, g) => {
    if (!g) return;
    for (const s of g.sitze) {
      if (sitzBelegt(o, s.index)) continue;
      const d = s.obj.getWorldPosition(tmpSitzPos).distanceTo(p);
      if (d < bd) { bd = d; best = { o, i: s.index }; }
    }
  };
  pruefe("ich", meineGrafik);
  for (const r of andere.values()) if (r.m === "fahr") pruefe(r.id, r.grafik);
  return best;
}

function figurAnSitz(figur, obj) {
  obj.add(figur);
  figur.position.set(0, -0.3, 0.02);
  figur.quaternion.identity();
  figur.scale.setScalar(0.62 / obj.scale.x);
  setzeSitzen(figur, true);
}

function figurFrei(figur) {
  if (figur.parent !== scene) {
    scene.attach(figur);
    figur.rotation.set(0, figur.rotation.y, 0);
    figur.scale.setScalar(0.62);
  }
  setzeSitzen(figur, false);
}

function gehAnim(figur, tempo) {
  const u = figur.userData;
  u.zyklus = (u.zyklus || 0) + tempo * 0.045;
  const s = tempo > 0.4 ? Math.sin(u.zyklus) * 0.55 : 0;
  u.leftLeg.rotation.x = s;
  u.rightLeg.rotation.x = -s;
  u.leftArm.rotation.x = -s * 0.6;
  u.rightArm.rotation.x = s * 0.6;
}

function entferneFuss() {
  if (!fussRb) return;
  PH.ignoriere.delete(fussCol.handle);
  world.removeRigidBody(fussRb);
  fussRb = fussCol = null;
}

function erzeugeFuss(pos, vel) {
  entferneFuss();
  fussRb = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y + FUSS_H, pos.z)
      .setLinvel(vel.x, vel.y, vel.z)
      .lockRotations().setCanSleep(false).setCcdEnabled(true)
  );
  fussCol = world.createCollider(RAPIER.ColliderDesc.capsule(0.25, 0.25).setFriction(0).setMass(70), fussRb);
  PH.ignoriere.add(fussCol.handle);
}

function setzeIchSitz(ref) {
  const s = sitzObjekt(ref);
  if (!s) return false;
  ichSitz = ref;
  ichSitzObj = s.obj;
  entferneFuss();
  figurAnSitz(meineFigur, s.obj);
  return true;
}

function steigeAus() {
  const s = ichSitz && sitzObjekt(ichSitz);
  const pos = meineFigur.getWorldPosition(new THREE.Vector3());
  const vel = { x: 0, y: 0, z: 0 };
  if (s) {
    s.obj.getWorldPosition(pos);
    const seite = new THREE.Vector3(1, 0, 0).transformDirection(s.obj.matrixWorld);
    seite.y = 0;
    if (seite.lengthSq() < 0.01) seite.set(1, 0, 0);
    seite.normalize();
    pos.addScaledVector(seite, 0.8);
    pos.y = Math.max(pos.y - 0.2, 0.05);
    if (ichSitz.o === "ich" && meinFahrzeug) {
      const b = PH.sitzKoerper(meinFahrzeug);
      if (b) { const v = b.rb.linvel(); vel.x = v.x; vel.z = v.z; }
      fuss.yaw = fahrKamera.yaw + fahrKamera.yawOffset;
    }
  }
  ichSitz = null;
  ichSitzObj = null;
  figurFrei(meineFigur);
  erzeugeFuss(pos, vel);
  meineFigur.position.copy(pos);
}

// mausklick/tippen auf einen sitz (eigenes oder fremdes fahrzeug): dort einsteigen
function klickSitz() {
  raycaster.setFromCamera(maus, camera);
  let best = null;
  const pruefe = (o, g) => {
    if (!g) return;
    for (const h of raycaster.intersectObjects(g.groups, true)) {
      if (h.object.userData.teil === undefined) continue; // spielfiguren überspringen
      if (!best || h.distance < best.d) best = { d: h.distance, o, g, teil: h.object.userData.teil };
      break; // das erste getroffene teil verdeckt alles dahinter
    }
  };
  pruefe("ich", meineGrafik);
  for (const r of andere.values()) if (r.m === "fahr") pruefe(r.id, r.grafik);
  if (!best) return;
  if (!best.g.sitze.some(s => s.index === best.teil)) {
    // klick auf ein anderes bauteil des fahrzeugs (der sitz ist oft verdeckt): nächster freier sitz in reichweite.
    // wer schon sitzt, wechselt durch einen klick auf irgendein bauteil nicht den platz.
    if (ichSitz) return;
    const ich = meineFigur.getWorldPosition(new THREE.Vector3());
    let wahl = null, bestD = 10;
    for (const s of best.g.sitze) {
      if (sitzBelegt(best.o, s.index)) continue;
      const d = s.obj.getWorldPosition(tmpSitzPos).distanceTo(ich);
      if (d < bestD) { bestD = d; wahl = s; }
    }
    if (!wahl) return;
    best.teil = wahl.index;
  }
  if (ichSitz && idVon(ichSitz.o) === idVon(best.o) && ichSitz.i === best.teil) return;
  if (sitzBelegt(best.o, best.teil)) return meldung("Der Sitz ist besetzt");
  setzeIchSitz({ o: best.o, i: best.teil });
  meldung(best.o === "ich" ? "Eingestiegen" : "Du fährst mit");
}

function ausEinsteigen() {
  if (modus !== "fahr") return;
  if (ichSitz) {
    steigeAus();
    return meldung("Ausgestiegen – X zum Einsteigen");
  }
  const s = naechsterSitz();
  if (!s) return meldung("Kein freier Sitz in der Nähe");
  setzeIchSitz(s);
  meldung(s.o === "ich" ? "Eingestiegen" : "Du fährst mit");
}

// sitz weg (besitzer neu gestartet oder gegangen)? dann aussteigen; neue sitzgrafik? dann neu hinsetzen.
function pflegeSitz() {
  if (!ichSitz) return;
  const s = sitzObjekt(ichSitz);
  if (!s) return steigeAus();
  if (s.obj !== ichSitzObj) {
    ichSitzObj = s.obj;
    figurAnSitz(meineFigur, s.obj);
  }
}

// zu fuß: eingabe in geschwindigkeit der kapsel umsetzen
// leitern: zu fuß in der nähe einer (senkrechten) leiter mit w/s klettern, leertaste springt ab
let fussKlettert = false, fussSprungSperre = 0;
function leiterNah(t) {
  const gs = [meineGrafik];
  for (const r of andere.values()) if (r.m === "fahr") gs.push(r.grafik);
  for (const g of gs) {
    if (!g) continue;
    for (const obj of g.leitern) {
      obj.updateWorldMatrix(true, false);
      const m = obj.matrixWorld.elements;
      if (Math.abs(new THREE.Vector3(m[4], m[5], m[6]).normalize().y) < 0.7) continue; // nur senkrecht
      const c = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
      if (Math.hypot(c.x - t.x, c.z - t.z) < 0.55 && Math.abs(c.y - t.y) < 0.5) return true;
    }
  }
  return false;
}

function steuereFuss() {
  if (!fussRb) return;
  const k = new Set([...gedrueckt, ...touchGedrueckt]);
  const tipp = tippt();
  const vor = tipp ? 0 : ((k.has("w") || k.has("arrowup")) ? 1 : 0) - ((k.has("s") || k.has("arrowdown")) ? 1 : 0) - joyY;
  const seite = tipp ? 0 : ((k.has("d") || k.has("arrowright")) ? 1 : 0) - ((k.has("a") || k.has("arrowleft")) ? 1 : 0) + joyX;
  const len = Math.hypot(vor, seite);
  let mx = 0, mz = 0;
  if (len > 0.08) {
    const nf = vor / Math.max(len, 1), ns = seite / Math.max(len, 1);
    mx = -Math.sin(fuss.yaw) * nf + Math.cos(fuss.yaw) * ns;
    mz = -Math.cos(fuss.yaw) * nf - Math.sin(fuss.yaw) * ns;
  }
  const tempo = (k.has("shift") && !touchModus ? 7 : 4.2) * Math.min(1, len);
  const v = fussRb.linvel();
  let vy = v.y;
  if (angetippt.has("space") && !tipp && Math.abs(v.y) < 0.3) vy = 5.5;
  const t0 = fussRb.translation();
  const nahLeiter = !tipp && leiterNah(t0);
  const hoch = (k.has("w") || k.has("arrowup")) ? 1 : 0;
  const runter = (k.has("s") || k.has("arrowdown")) ? 1 : 0;
  if (nahLeiter && (hoch || runter) && performance.now() > fussSprungSperre) fussKlettert = true;
  if (!nahLeiter || angetippt.has("space")) {
    if (fussKlettert && angetippt.has("space")) {
      vy = 5;
      fussSprungSperre = performance.now() + 500;
    }
    fussKlettert = false;
  }
  if (fussKlettert) {
    fussRb.setGravityScale(0, true);
    fussRb.setLinvel({ x: 0, y: (hoch - runter) * 2.6, z: 0 }, true); // an der leiter bleiben (leertaste springt ab)
    return;
  }
  fussRb.setGravityScale(PH.gravFaktor(t0.y), true);
  fussRb.setLinvel({ x: mx * tempo, y: vy, z: mz * tempo }, true);
}

function aktualisiereFuss(dt) {
  if (!fussRb) return;
  const t = fussRb.translation(), v = fussRb.linvel();
  meineFigur.position.set(t.x, t.y - FUSS_H, t.z);
  const sp = Math.hypot(v.x, v.z);
  if (sp > 0.4) {
    let d = Math.atan2(-v.x, -v.z) - meineFigur.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    meineFigur.rotation.y += d * Math.min(1, dt * 12);
  }
  gehAnim(meineFigur, sp);
  if (t.y < -30) {
    entferneFuss();
    erzeugeFuss(lotPos(meinLot).add(new THREE.Vector3(6.9, 0, -6.9)), { x: 0, y: 0, z: 0 });
  }
}

function setzeFov(f) {
  if (camera.fov === f) return;
  camera.fov = f;
  camera.updateProjectionMatrix();
  for (const p of [rauch, feuer]) p.setzeSkala(innerHeight * renderer.getPixelRatio(), f);
}

// blick durch ein kamera-teil: ersetzt die normale kamera, solange es angeschaltet ist
let camTextAlt = "";
function kameraVonTeil() {
  const p = aktiveKamera !== null ? plan.parts[aktiveKamera] : null;
  const e = p && p.t === "kamera" && meineGrafik ? meineGrafik.emit.get(aktiveKamera) : null;
  let text = "";
  if (e) {
    e.obj.updateWorldMatrix(true, false);
    const pos = e.obj.localToWorld(e.punkt.clone());
    const dir = new THREE.Vector3(0, 1, 0).transformDirection(e.obj.matrixWorld);
    camera.position.copy(pos);
    // "oben" bleibt die welt-oberseite, außer die kamera schaut senkrecht
    if (Math.abs(dir.y) > 0.95) camera.up.copy(new THREE.Vector3(0, 0, -1).transformDirection(e.obj.matrixWorld));
    camera.lookAt(pos.clone().add(dir));
    camera.up.set(0, 1, 0);
    setzeFov(p.k.fov ?? 70);
    const nr = plan.parts.slice(0, aktiveKamera).filter(q => q.t === "kamera").length + 1;
    text = `${tr("KAMERA")} ${nr} · ${tastenText(p.k.taste)} = ${tr("zurück")}`;
  } else {
    aktiveKamera = null;
    setzeFov(fov);
  }
  if (text !== camTextAlt) {
    camTextAlt = text;
    $("#camOverlay").hidden = !text;
    $("#camText").textContent = text;
  }
}

// ansicht: 0 verfolger fern, 1 verfolger nah, 2 ich-perspektive (aus den augen der figur)
let ansicht = 0;
let egoFahrer = false;
const egoBlick = { yaw: 0, pitch: 0 };
const AUGEN = new THREE.Vector3(0, 1.5, -0.1);   // augenpunkt im koordinatensystem der figur (sie schaut nach -z)
const ANSICHTEN = ["Ansicht: Verfolger", "Ansicht: Verfolger nah", "Ansicht: Ich-Perspektive"];
function schalteAnsicht() {
  ansicht = (ansicht + 1) % 3;
  egoBlick.yaw = 0;
  egoBlick.pitch = 0;
  meldung(ANSICHTEN[ansicht]);
}

// im fahrzeug: augen der sitzenden figur, blick folgt dem sitz (kopf lässt sich durch ziehen drehen)
const egoQ0 = new THREE.Quaternion(), egoDrehung = new THREE.Quaternion(), egoEuler = new THREE.Euler(0, 0, 0, "YXZ");
// sitzend (fahrer oder mitfahrer): die ausrichtung des sitzmodells ist die blickrichtung (die figur schaut nach -z des sitzes)
function kameraEgoSitzend() {
  const sitz = ichSitz ? sitzObjekt(ichSitz) : null;
  if (!sitz) return false;
  sitz.obj.updateWorldMatrix(true, false);
  sitz.obj.getWorldQuaternion(egoQ0);
  meineFigur.updateWorldMatrix(true, false);
  const augen = meineFigur.localToWorld(AUGEN.clone());
  egoDrehung.setFromEuler(egoEuler.set(egoBlick.pitch, egoBlick.yaw, 0));
  camera.position.copy(augen);
  camera.quaternion.copy(egoQ0).multiply(egoDrehung);
  fahrKamera.blick.copy(augen);
  fahrKamera.pos.copy(augen);
  return true;
}
function kameraEgoFahrzeug() {
  kameraEgoSitzend();
}

// zu fuß: kamera auf augenhöhe, ziehen dreht die laufrichtung
function kameraEgoFuss() {
  if (kameraEgoSitzend()) return;   // mitfahrer in einem fremden fahrzeug
  meineFigur.updateWorldMatrix(true, false);
  const augen = meineFigur.localToWorld(AUGEN.clone());
  camera.position.copy(augen);
  camera.rotation.set(egoBlick.pitch, fuss.yaw, 0, "YXZ");
  fahrKamera.blick.copy(augen);
  fahrKamera.pos.copy(augen);
}

function kameraFuss() {
  if (ansicht === 2) return kameraEgoFuss();
  const ziel = meineFigur.getWorldPosition(new THREE.Vector3());
  ziel.y += 0.7;
  fahrKamera.blick.copy(ziel);
  const d = fuss.dist, p = fuss.pitch;
  camera.position.set(
    ziel.x + Math.sin(fuss.yaw) * Math.cos(p) * d,
    Math.max(0.3, ziel.y + Math.sin(p) * d),
    ziel.z + Math.cos(fuss.yaw) * Math.cos(p) * d
  );
  camera.position.y = Math.max(camera.position.y, bodenHoehe(camera.position.x, camera.position.z) + 0.5);
  camera.lookAt(ziel);
  fahrKamera.pos.copy(camera.position);
}

// ---------------------------------------------------------------------------
// fahren
// ---------------------------------------------------------------------------
let aktiveKamera = null;   // teilindex der kamera, durch die gerade geschaut wird

// treibstoffverbrauch an/aus (gilt für alle eigenen fahrzeuge, bleibt gespeichert)
let verbrauchAn = true;
try { verbrauchAn = localStorage.getItem("bastelkarre-verbrauch") !== "0"; } catch {}
function schalteVerbrauch() {
  verbrauchAn = !verbrauchAn;
  try { localStorage.setItem("bastelkarre-verbrauch", verbrauchAn ? "1" : "0"); } catch {}
  if (meinFahrzeug) meinFahrzeug.verbrauch = verbrauchAn;
  meldung(verbrauchAn ? "Treibstoffverbrauch an" : "Treibstoffverbrauch aus (unbegrenzt)");
}

function erzeugeEigenes() {
  if (meinFahrzeug) PH.entferneFahrzeug(world, meinFahrzeug);
  entferneGrafik(meineGrafik);
  const lift = BAU.bodenAbstand(plan, BAU.RAD_TIEFE) + 0.03;
  meinFahrzeug = PH.erzeugeFahrzeug(RAPIER, world, plan, { basis: lotBasis(meinLot, lift).toArray(), verbrauch: verbrauchAn });
  meineGrafik = fahrzeugGrafik(plan, { ana: meinFahrzeug.ana });
  for (const g of meineGrafik.groups) scene.add(g);
  if (ichSitz && ichSitz.o === "ich") {
    const s = meineGrafik.sitze.find(x => x.index === ichSitz.i) || meineGrafik.sitze[0];
    if (s) setzeIchSitz({ o: "ich", i: s.index });
    else steigeAus();
  }
  spawnZaehler++;
  baueTastenListe();
}

function neuStarten() {
  if (modus !== "fahr") return;
  erzeugeEigenes();
  meldung("Neu gestartet");
}

function wechsleModus() {
  if (modus === "bau") {
    if (!plan.parts.length) return meldung("Erst etwas bauen!");
    modus = "fahr";
    schliesseInspector();
    if (geist) geist.visible = false;
    for (const g of bauGrafik.groups) g.visible = false;
    ichSitz = null;
    entferneFuss();
    erzeugeEigenes();
    fahrKamera.yawOffset = 0;
    fahrKamera.yaw = 0;
    fuss.yaw = 0;
    const erster = meineGrafik.sitze[0];
    if (erster) setzeIchSitz({ o: "ich", i: erster.index });
    else {
      steigeAus();
      meldung("Kein Sitz eingebaut: du gehst zu Fuß");
    }
  } else {
    modus = "bau";
    aktiveKamera = null;
    setzeFov(fov);
    $("#camOverlay").hidden = true;
    camTextAlt = "";
    ichSitz = null;
    ichSitzObj = null;
    entferneFuss();
    if (meinFahrzeug) PH.entferneFahrzeug(world, meinFahrzeug);
    meinFahrzeug = null;
    entferneGrafik(meineGrafik);
    meineGrafik = null;
    for (const g of bauGrafik.groups) g.visible = true;
    setzeFigurInSitz(meineFigur, null, lotPos(meinLot).add(new THREE.Vector3(6.9, 0, -6.9)));
  }
  document.body.classList.toggle("bau", modus === "bau");
  document.body.classList.toggle("fahr", modus === "fahr");
  $("#baupanel").hidden = modus !== "bau";
  $("#fahrpanel").hidden = modus !== "fahr";
  $("#tacho").hidden = modus !== "fahr";
  $("#btnNeu").hidden = modus !== "fahr";
  $("#btnAus").hidden = modus !== "fahr";
  $("#btnAnsicht").hidden = modus !== "fahr";
  setBtn("#btnModus", modus === "bau" ? "▶" : "◀", tr(modus === "bau" ? "Losfahren" : "Zum Parkplatz"));
  $("#btnModus").blur();
  zeigeHinweis();
  sendePose(true);
}
$("#btnModus").onclick = wechsleModus;
$("#btnNeu").onclick = () => { neuStarten(); $("#btnNeu").blur(); };
$("#btnAus").onclick = () => { ausEinsteigen(); $("#btnAus").blur(); };
$("#btnAnsicht").onclick = () => { schalteAnsicht(); $("#btnAnsicht").blur(); };

// tastenbelegung im fahrmodus (und touch-knöpfe)
const touchTasten = $("#touchTasten");
function baueTastenListe() {
  const liste = [["W / S", "Gas / Rückwärts"], ["A / D", "Lenken"], ["Leertaste", "Bremse"], ["M", "Motor an/aus"], ["C", "Kamera"], ["Tab", "Bauen"], ["⌫", "Neu starten"], ["X", "Aus-/Einsteigen"]];
  const aktionen = new Map(); // taste -> beschriftung
  const add = (t, text) => {
    if (!t) return;
    const alt = aktionen.get(t);
    aktionen.set(t, alt && !alt.includes(text) ? `${alt}, ${text}` : text);
  };
  const raketen = [];
  let hatTank = false;
  steuerKanaele = { nick: false, roll: false };
  const joystickTasten = new Set();   // tasten, die als touch-knopf wegfallen, weil der joystick sie ersetzt
  plan.parts.forEach((p, i) => {
    switch (p.t) {
      case "nebel": add(p.k.taste, "Nebel"); break;
      case "duese": add(p.k.taste, "Triebwerk"); break;
      case "rakete": add(p.k.taste, "Rakete"); raketen.push(i); break;
      case "fallschirm": add(p.k.taste, "Fallschirm"); break;
      case "kamera": add(p.k.taste, "Kamera"); break;
      case "scheinwerfer": add(p.k.taste, "Scheinwerfer"); break;
      case "propeller": add(p.k.plus, "Gashebel +"); add(p.k.minus, "Gashebel −"); break;
      case "tank": hatTank = true; break;
      case "steuerflaeche": {
        const n = { nick: "Nicken", roll: "Rollen", gier: "Gieren" }[p.k.kanal] || "Ruder";
        add(p.k.plus, `${n} +`);
        add(p.k.minus, `${n} −`);
        if (p.k.kanal === "nick" || p.k.kanal === "roll") {
          steuerKanaele[p.k.kanal] = true;
          joystickTasten.add(p.k.plus);
          joystickTasten.add(p.k.minus);
        }
        break;
      }
      case "servo": add(p.k.plus, "Motor +"); add(p.k.minus, "Motor −"); break;
      case "bruch": add(p.k.taste, "Trennen"); break;
    }
  });
  if (hatTank) liste.push(["K", "Treibstoffverbrauch an/aus"]);
  const el = $("#tastenListe");
  el.innerHTML = "";
  for (const [k, t] of [...liste, ...[...aktionen].map(([k, t]) => [tastenText(k), t])]) {
    const d = document.createElement("div");
    d.innerHTML = `<span></span><kbd></kbd>`;
    d.firstChild.textContent = tr(t);
    d.lastChild.textContent = tr(k);
    el.append(d);
  }
  if (raketen.length) {
    const d = document.createElement("div");
    d.style.display = "block";
    d.innerHTML = `<span>${tr("Raketen-Treibstoff")}</span><span class="treibstoff"><i id="treibstoffBalken"></i></span>`;
    el.append(d);
  }

  if (hatTank) {
    const d = document.createElement("div");
    d.style.display = "block";
    d.innerHTML = `<span>${tr("Treibstoff")}</span><span class="treibstoff"><i id="tankBalken"></i></span>`;
    el.append(d);
  }

  // touch
  touchTasten.innerHTML = "";
  const knopf = (taste, text) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = tr(text);
    const an = e => { e.preventDefault(); touchGedrueckt.add(taste); angetippt.add(taste); b.classList.add("an"); };
    const aus = () => { touchGedrueckt.delete(taste); b.classList.remove("an"); };
    b.addEventListener("pointerdown", an);
    b.addEventListener("pointerup", aus);
    b.addEventListener("pointercancel", aus);
    b.addEventListener("pointerleave", aus);
    touchTasten.append(b);
  };
  knopf("space", "Bremse / Sprung");
  const xb = document.createElement("button");
  xb.type = "button";
  xb.textContent = tr("Aus/Ein");
  xb.addEventListener("pointerdown", e => { e.preventDefault(); ausEinsteigen(); });
  touchTasten.append(xb);
  if (hatTank) {
    const kb = document.createElement("button");
    kb.type = "button";
    kb.textContent = tr("Verbrauch");
    kb.addEventListener("pointerdown", e => { e.preventDefault(); schalteVerbrauch(); });
    touchTasten.append(kb);
  }
  for (const [k, t] of aktionen) if (!joystickTasten.has(k)) knopf(k, t);
}

function eingabe() {
  const alle = new Set([...gedrueckt, ...touchGedrueckt, ...angetippt]);
  // pfeiltasten sind für die steuerflächen (fliegen) frei
  // hat das fahrzeug nick-steuerflächen, gehört die joystick-y-achse dem höhenruder (zurückziehen = nase hoch), sonst dem gas
  const gas = (alle.has("w") ? 1 : 0) - (alle.has("s") ? 1 : 0) - (steuerKanaele.nick ? 0 : joyY);
  // x steuert weiter die räder (rollen am boden) und zusätzlich das querruder, falls vorhanden
  const lenk = (alle.has("d") ? 1 : 0) - (alle.has("a") ? 1 : 0) + joyX;
  const totzone = v => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);   // kleine ausschläge des daumens ignorieren
  const achsen = {};
  if (steuerKanaele.nick) achsen.nick = totzone(joyY);
  if (steuerKanaele.roll) achsen.roll = totzone(joyX);
  return {
    gas: THREE.MathUtils.clamp(gas, -1, 1),
    lenk: THREE.MathUtils.clamp(lenk, -1, 1),
    bremse: alle.has("space"),
    achsen,
    tasten: tippt() ? new Set() : alle
  };
}

// ---------------------------------------------------------------------------
// effekte (eigene und fremde fahrzeuge)
// ---------------------------------------------------------------------------
const fxAkku = new Map();
const tmpV = new THREE.Vector3(), tmpD = new THREE.Vector3(), tmpVel = new THREE.Vector3();
const tmpFarbe = new THREE.Color();

function emitEffekte(besitzer, planX, grafik, fx, dt) {
  if (!grafik) return;
  for (const [i, staerke] of fx) {
    const p = planX.parts[i];
    const e = grafik.emit.get(i);
    if (!p || !e) continue;
    e.obj.localToWorld(tmpV.copy(e.punkt));
    tmpD.set(0, 1, 0).transformDirection(e.obj.matrixWorld);
    const key = besitzer + ":" + i;
    let akku = fxAkku.get(key) || 0;
    let rate = 0;
    switch (p.t) {
      case "auspuff": rate = 14 + 46 * staerke; break;
      case "nebel": rate = 55; break;
      case "duese": rate = 160; break;
      case "rakete": rate = 300; break;
    }
    akku += rate * dt;
    const zufall = s => (Math.random() - 0.5) * s;
    while (akku >= 1) {
      akku -= 1;
      const pos = tmpV.clone().add(new THREE.Vector3(zufall(0.05), zufall(0.05), zufall(0.05)));
      const versatz = Math.random() * dt; // teilchen über den frame verteilen, sonst entstehen perlen
      if (p.t === "auspuff") {
        tmpVel.copy(tmpD).multiplyScalar(1.5 + staerke * 2).add(new THREE.Vector3(zufall(0.4), 0.3, zufall(0.4)));
        rauch.emit(pos, tmpVel, tmpFarbe.set(p.k.farbe || "#5b5f66"), 0.12, 0.7 + staerke * 0.5, 1.1 + Math.random() * 0.6, 0.55, 0.6);
      } else if (p.t === "nebel") {
        tmpVel.copy(tmpD).multiplyScalar(2.2).add(new THREE.Vector3(zufall(0.8), zufall(0.4), zufall(0.8)));
        rauch.emit(pos, tmpVel, tmpFarbe.set(p.k.farbe || "#e8f0ff"), 0.3, 2.6, 3.2 + Math.random() * 1.5, 0.5, 0.25);
      } else {
        const rak = p.t === "rakete";
        const v = rak ? 22 : 14;
        tmpVel.copy(tmpD).multiplyScalar(v * (0.7 + Math.random() * 0.5)).add(new THREE.Vector3(zufall(1), zufall(1), zufall(1)));
        pos.addScaledVector(tmpVel, versatz);
        feuer.emit(pos, tmpVel, tmpFarbe.setHSL(0.07 + Math.random() * 0.06, 1, 0.55 + Math.random() * 0.15), rak ? 0.45 : 0.3, 0.05, rak ? 0.22 : 0.14, 0.9);
        if (Math.random() < (rak ? 0.5 : 0.18)) {
          tmpVel.multiplyScalar(0.35);
          rauch.emit(pos.addScaledVector(tmpD, 0.6), tmpVel, tmpFarbe.set(rak ? "#d8d4cc" : "#9aa0a8"), 0.3, rak ? 2.4 : 1.2, 1.6 + Math.random(), 0.4, 0.4);
        }
      }
    }
    fxAkku.set(key, akku);
  }
}

// offene fallschirme: hängen am befestigungspunkt und wehen gegen die bewegung.
// die richtung kommt aus der bewegung des punkts, damit es auch für fremde fahrzeuge geht.
const schirme = new Map();

// scheinwerfer: alle linsen leuchten, aber höchstens 4 echte lichtkegel (die nächsten zur kamera)
const lichtPool = [];
function aktualisiereLichter() {
  const kandidaten = [];
  const sammle = (planX, grafik, fx) => {
    if (!grafik) return;
    for (const [i, linse] of grafik.lampen) {
      const an = (fx.get(i) ?? 0) > 0;
      linse.material.emissiveIntensity = an ? 2.2 : 0;
      const e = grafik.emit.get(i);
      if (!an || !e) continue;
      e.obj.updateWorldMatrix(true, false);
      const pos = e.obj.localToWorld(e.punkt.clone());
      const dir = new THREE.Vector3(0, 1, 0).transformDirection(e.obj.matrixWorld);
      kandidaten.push({ pos, dir, farbe: planX.parts[i]?.k.farbe || "#fff6d0", d: pos.distanceToSquared(camera.position) });
    }
  };
  if (meinFahrzeug) sammle(plan, meineGrafik, meinFahrzeug.fx);
  for (const r of andere.values()) if (r.m === "fahr" && r.plan && r.grafik) sammle(r.plan, r.grafik, r.fx);
  kandidaten.sort((a, b) => a.d - b.d);
  // lichter werden bei bedarf angelegt und danach nie entfernt (nur helligkeit 0), sonst baut three.js die shader neu
  for (let n = 0; n < Math.min(4, kandidaten.length); n++) {
    if (!lichtPool[n]) {
      const licht = new THREE.SpotLight("#fff6d0", 0, 70, 0.5, 0.6, 2);
      scene.add(licht, licht.target);
      lichtPool[n] = licht;
    }
  }
  lichtPool.forEach((licht, n) => {
    const k = kandidaten[n];
    licht.intensity = k ? 900 : 0;
    if (!k) return;
    licht.color.set(k.farbe);
    licht.position.copy(k.pos);
    licht.target.position.copy(k.pos).addScaledVector(k.dir, 10);
  });
}

// propeller: drehen mit der leistung (fx 0..1), bei hoher drehzahl verschwimmen die blätter zur scheibe
function setzeRotoren(grafik, fx, dt) {
  for (const [i, r] of grafik.rotoren) {
    const s = fx.get(i) ?? 0;
    r.winkel += dt * (s > 0.02 ? 6 + 70 * s : 0);
    r.rotor.rotation.y = r.winkel;
    r.scheibe.visible = s > 0.4;
    r.rotor.visible = s <= 0.75;
  }
}

// ruderklappen: fx-wert 0..1 (0,5 = neutral) in ausschlag umrechnen
function setzeKlappen(grafik, planX, fx) {
  for (const [i, klappe] of grafik.klappen) {
    const p = planX.parts[i];
    const s = fx.get(i);
    const norm = s === undefined || !p ? 0 : (s - 0.5) * 2;
    klappe.rotation.x = -norm * ((p?.k.winkel ?? 25) * Math.PI) / 180;
  }
}

function aktualisiereSchirme(besitzer, planX, grafik, fx, dt, da) {
  for (const [i, offen] of fx) {
    const p = planX.parts[i];
    const e = grafik.emit.get(i);
    if (!p || p.t !== "fallschirm" || !e) continue;
    const key = besitzer + ":" + i;
    da.add(key);
    const anker = e.obj.localToWorld(e.punkt.clone());
    let s = schirme.get(key);
    if (!s) {
      const start = new THREE.Vector3(0, 1, 0).transformDirection(e.obj.matrixWorld);
      s = { obj: schirmModell(p.k.flaeche ?? 12, p.k.farbe || "#ff6a1a"), vorher: anker.clone(), richtung: start, v: new THREE.Vector3() };
      scene.add(s.obj);
      schirme.set(key, s);
    }
    if (dt > 0) s.v.lerp(anker.clone().sub(s.vorher).divideScalar(dt), Math.min(1, dt * 10));
    s.vorher.copy(anker);
    // schirm zieht hinter dem punkt her; ohne tempo bleibt er stehen und richtet sich langsam auf
    const soll = s.v.lengthSq() > 1 ? s.v.clone().negate().normalize() : s.richtung.clone();
    soll.y += 0.35; // schirm steigt leicht nach oben
    s.richtung.lerp(soll.normalize(), Math.min(1, dt * 5)).normalize();
    s.obj.position.copy(anker);
    s.obj.lookAt(anker.clone().add(s.richtung));
    const k = Math.max(0.05, offen);
    s.obj.scale.set(k, k, 0.4 + 0.6 * k);
  }
}

// ---------------------------------------------------------------------------
// chat-sprechblasen
// ---------------------------------------------------------------------------
let chatItems = [];

function sprechblase(text) {
  const breite = 560;
  const font = "bold 34px system-ui, sans-serif";
  const messen = document.createElement("canvas").getContext("2d");
  messen.font = font;
  const zeilen = [];
  let zeile = "";
  for (const wort of text.split(/\s+/)) {
    const test = zeile ? `${zeile} ${wort}` : wort;
    if (messen.measureText(test).width > breite - 70 && zeile) {
      zeilen.push(zeile);
      zeile = wort;
    } else zeile = test;
  }
  if (zeile) zeilen.push(zeile);
  const zh = 44, koerper = zeilen.length * zh + 34, hoehe = koerper + 30;
  const c = document.createElement("canvas");
  c.width = breite;
  c.height = hoehe;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.strokeStyle = "rgba(20,30,50,0.55)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(8, 6, breite - 16, koerper, 30);
  else ctx.rect(8, 6, breite - 16, koerper);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(breite / 2 - 20, koerper + 3);
  ctx.lineTo(breite / 2, hoehe - 4);
  ctx.lineTo(breite / 2 + 20, koerper + 3);
  ctx.fill();
  ctx.fillStyle = "#101827";
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  zeilen.forEach((l, i) => ctx.fillText(l.slice(0, 60), breite / 2, 23 + zh / 2 + i * zh));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.center.set(0.5, 0);
  s.scale.set(3.2, (3.2 * hoehe) / breite, 1);
  s.renderOrder = 10;
  return s;
}

function setzeBlase(figur, item) {
  const jetzt = figur.userData.blaseId || null;
  const soll = item ? item.id : null;
  if (jetzt === soll) return;
  if (figur.userData.blase) {
    figur.remove(figur.userData.blase);
    entsorge(figur.userData.blase);
    figur.userData.blase = null;
  }
  figur.userData.blaseId = soll;
  if (item) {
    const b = sprechblase(String(item.text));
    b.position.set(0, 2.4, 0);
    figur.add(b);
    figur.userData.blase = b;
  }
}

function aktualisiereBlasen() {
  const jetzt = Date.now();
  chatItems = chatItems.filter(i => i.expires > jetzt);
  const neueste = new Map();
  const blockiert = Konto.blockiert();
  for (const i of chatItems) if (!(i.acc && blockiert.has(String(i.acc).toLowerCase()))) neueste.set(String(i.playerId), i);
  setzeBlase(meineFigur, neueste.get(meineId) || null);
  for (const [id, r] of andere) setzeBlase(r.figur, neueste.get(id) || null);
}

// chat-protokoll oben links: die letzten nachrichten stehen dort auch dann, wenn der sprecher nicht im bild ist
const chatProtokoll = document.createElement("ul");
chatProtokoll.id = "chatProtokoll";
chatProtokoll.setAttribute("aria-live", "polite");
chatProtokoll.setAttribute("aria-label", "Chat");
game.append(chatProtokoll);
function chatProtokollNeu(item) {
  if (item.acc && Konto.blockiert().has(String(item.acc).toLowerCase())) return;   // blockierte bleiben unsichtbar
  const li = document.createElement("li");
  const punkt = document.createElement("i");
  const sprecher = String(item.playerId) === String(meineId) ? null : andere.get(String(item.playerId));
  punkt.style.background = sprecher ? sprecher.color : spielerFarbe;
  const name = document.createElement("b");
  name.textContent = item.name;
  li.append(punkt, name, document.createTextNode(": " + item.text));
  chatProtokoll.append(li);
  while (chatProtokoll.children.length > 6) chatProtokoll.firstElementChild.remove();
  setTimeout(() => li.classList.add("verblasst"), 12000);
  setTimeout(() => li.remove(), 14000);
}

// chatten geht nur mit konto. abgemeldet bleibt im eingabefeld dauerhaft "zum chatten anmelden" stehen
// (das feld ist gesperrt); ein klick darauf öffnet den anmelde-dialog.
function chatHinweis() {
  const an = Konto.angemeldet();
  chatInput.readOnly = !an;
  chatInput.classList.toggle("gesperrt", !an);
  chatInput.placeholder = an ? tr("Nachricht (Enter)") : tr("Zum Chatten anmelden (👤)");
  if (!an) chatInput.value = "";
  const senden = document.querySelector("#chatForm button[type=submit]");
  if (senden) senden.disabled = !an;
}
chatInput.addEventListener("focus", () => {
  if (!Konto.angemeldet()) {
    chatInput.blur();
    document.body.classList.remove("chat-offen");
    Konto.oeffneKonto();
  }
});
chatHinweis();
setInterval(chatHinweis, 1000);   // reagiert auch auf an- und abmelden im dialog
$("#chatForm").addEventListener("submit", e => {
  e.preventDefault();
  const text = chatInput.value.trim().slice(0, 100);
  if (text && !Konto.angemeldet()) {
    meldung("Zum Chatten musst du angemeldet sein");
    chatInput.blur();
    document.body.classList.remove("chat-offen");
    Konto.oeffneKonto();
    return;
  }
  if (text && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "chat", text }));
  chatInput.value = "";
  chatInput.blur();
  document.body.classList.remove("chat-offen");
});

// ---------------------------------------------------------------------------
// netz
// ---------------------------------------------------------------------------
const WORKER_HOST = "bastelkarre-online.kroxenstudios.workers.dev";
const params = new URLSearchParams(location.search);
let raumId = raumName(params.get("raum")) || raumName((() => { try { return localStorage.getItem("krox-raum"); } catch { return null; } })()) || "r1";
function serverBasis() {
  if (params.get("server")) return params.get("server").replace(/^ws/, "http").replace(/\/ws.*$/, "");
  const eigener = location.host === WORKER_HOST || location.port === "8787";
  return eigener ? `${location.protocol}//${location.host}` : `https://${WORKER_HOST}`;
}
function socketUrl() {
  const basis = serverBasis().replace(/^http/, "ws");
  return `${basis}/ws?room=${encodeURIComponent(raumId)}`;
}
let bewussterWechsel = false;
async function wechsleRaum(id) {
  if (!id || id === raumId) return;
  try {
    const r = await (await fetch(`${serverBasis()}/roominfo?room=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(6000) })).json();
    if (r.count >= r.max) { meldung("Raum voll"); return; }
  } catch {}
  raumId = id;
  try { localStorage.setItem("krox-raum", id); } catch {}
  history.replaceState(null, "", `${location.pathname}?raum=${encodeURIComponent(id)}${location.hash}`);
  chatItems = [];
  if (socket && socket.readyState <= WebSocket.OPEN) {
    bewussterWechsel = true;
    try { socket.close(1000, "raum"); } catch { bewussterWechsel = false; verbinde(); }
  } else {
    verbinde();
  }
  meldung(`${tr("Raum")}: ${raumTitel(id)}`);
}
// beim start: ist der raum voll, in den ersten freien öffentlichen wechseln
async function freienRaumWaehlen() {
  try {
    const r = await (await fetch(`${serverBasis()}/roominfo?room=${encodeURIComponent(raumId)}`, { signal: AbortSignal.timeout(6000) })).json();
    if (r.count < r.max) return;
    const alle = (await (await fetch(`${serverBasis()}/rooms`, { signal: AbortSignal.timeout(6000) })).json()).rooms;
    const frei = alle.find(x => x.count < x.max);
    if (frei) { raumId = frei.id; meldung(`${tr("Raum voll")} – ${raumTitel(frei.id)}`); }
  } catch {}
}

let socket = null;
let wiederverbinden = 0;
const andere = new Map();

let spielerListeKey = "";
function zeigeSpielerZahl() {
  const el = document.getElementById("spielerZahl");
  if (!el) return;
  const online = socket?.readyState === WebSocket.OPEN;
  el.hidden = !online;
  el.textContent = `👥 ${andere.size + 1}`;
  const liste = document.getElementById("spielerListe");
  if (!liste) return;
  if (!online) { liste.hidden = true; spielerListeKey = ""; return; }
  const freunde = Konto.freunde();
  const meinKonto = Konto.angemeldet() ? String(Konto.benutzer() || "").toLowerCase() : null;
  const eintraege = [{ name: spielerName, color: spielerFarbe, ich: true, acc: meinKonto, freund: false }];
  for (const r of andere.values()) if (r.name) eintraege.push({ name: r.name, color: r.color, ich: false, acc: r.acc || null, freund: !!r.acc && freunde.has(r.acc) });
  const key = JSON.stringify(eintraege);
  if (key === spielerListeKey) return;
  spielerListeKey = key;
  liste.replaceChildren(...eintraege.map(e => {
    const li = document.createElement("li");
    const punkt = document.createElement("i");
    punkt.style.background = e.color;
    const name = document.createElement("b");
    name.textContent = e.name;
    li.append(punkt, name);
    if (e.ich) li.append(document.createTextNode(` (${tr("du")})`));
    if (e.acc) {
      // spieler mit konto: anklickbar, öffnet das profil (bio, fahrzeuge, freund hinzufügen)
      li.className = "klick konto" + (e.freund ? " freund" : "");
      li.title = tr("Profil ansehen");
      li.addEventListener("click", () => oeffneSpielerProfil(e.acc));
    } else if (!e.ich) {
      li.title = tr("Gast ohne Konto");
    }
    return li;
  }));
}

function oeffneSpielerProfil(konto) {
  let dlg = document.getElementById("spielerDialog");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "spielerDialog";
    const inhalt = document.createElement("div");
    inhalt.className = "kontoInhalt";
    dlg.append(inhalt);
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg);
  }
  const inhalt = dlg.firstElementChild;
  const zu = document.createElement("button");
  zu.type = "button";
  zu.className = "kontoZu";
  zu.textContent = "✕";
  zu.onclick = () => dlg.close();
  const box = document.createElement("div");
  box.className = "kontoBox";
  inhalt.replaceChildren(zu, box);
  if (!dlg.open) dlg.showModal();
  zeigeProfil(box, konto, {
    onLaden: async m => {
      try {
        const d = await Konto.anfrage("POST", `/models/${m.id}/download`);
        planAusKonto(d.data);
        dlg.close();
      } catch (e) { alert(Konto.fehlerText(e.message)); }
    }
  });
}
{
  const z = document.getElementById("spielerZahl"), l = document.getElementById("spielerListe");
  z?.addEventListener("click", () => { if (l) l.hidden = !l.hidden; });
  addEventListener("pointerdown", e => { if (l && !l.hidden && !l.contains(e.target) && e.target !== z) l.hidden = true; });
}

async function verbinde() {
  if (!socket && !params.has("offline")) await freienRaumWaehlen();
  if (params.has("offline")) {
    statusEl.textContent = tr("Offline");
    statusEl.dataset.state = "offline";
    return;
  }
  try {
    socket = new WebSocket(socketUrl());
  } catch {
    return;
  }
  statusEl.textContent = tr("Verbinde …");
  delete statusEl.dataset.state;

  const sock = socket;
  sock.addEventListener("open", async () => {
    wiederverbinden = 0;
    statusEl.textContent = tr("Online");
    statusEl.dataset.state = "online";
    zeigeSpielerZahl();
    // mit konto: signiertes ticket mitschicken, damit der raum deinen kontonamen bestätigen kann
    const ticket = await Konto.ticket();
    if (sock.readyState !== WebSocket.OPEN) return;
    sock.send(JSON.stringify({ type: "join", name: spielerName, color: spielerFarbe, look: spielerLook, ...(ticket ? { ticket } : {}) }));
    sendePlan();
  });
  socket.addEventListener("message", e => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    empfange(m);
  });
  const weg = () => {
    if (bewussterWechsel) {
      bewussterWechsel = false;
      wiederverbinden = 0;
      for (const id of [...andere.keys()]) entferneAnderen(id);
      zeigeSpielerZahl();
      verbinde();
      return;
    }
    statusEl.textContent = tr("Offline – du kannst trotzdem bauen und fahren");
    statusEl.dataset.state = "offline";
    for (const id of [...andere.keys()]) entferneAnderen(id);
    zeigeSpielerZahl();
    if (wiederverbinden++ < 20) setTimeout(verbinde, Math.min(30000, 3000 * wiederverbinden));
  };
  socket.addEventListener("close", weg);
}

function empfange(m) {
  switch (m.type) {
    case "welcome": {
      meineId = String(m.id);
      const neu = Number(m.lot) || 0;
      if (neu !== meinLot) {
        meinLot = neu;
        setzeBauZiel();
        baueBauansicht();
        if (modus === "fahr") erzeugeEigenes();
      }
      $("#lotNr").textContent = `P${meinLot + 1}`;
      aktualisiereSchilder();
      break;
    }
    case "plans":
      for (const e of m.list || []) setzePlanAnderer(String(e.id), e.dv, e.plan);
      break;
    case "plan":
      setzePlanAnderer(String(m.id), m.dv, m.plan);
      break;
    case "state": {
      const da = new Set();
      for (const p of m.players || []) {
        const id = String(p.id);
        if (id === meineId) continue;
        da.add(id);
        aktualisiereAnderen(id, p);
      }
      for (const id of [...andere.keys()]) if (!da.has(id)) entferneAnderen(id);
      chatItems = Array.isArray(m.chat) ? m.chat : chatItems;
      aktualisiereSchilder();
      zeigeSpielerZahl();
      break;
    }
    case "chat":
      if (m.item) { chatItems.push(m.item); chatProtokollNeu(m.item); }
      break;
    case "nameGeaendert":
      meldung(`„${m.wunsch}“ ${tr("gehört einem registrierten Konto. Du heißt hier „Gast“ – melde dich an oder wähle im Konto einen anderen Namen.")}`, 7000);
      break;
    case "chatStumm":
      meldung("Du bist vom Moderator stummgeschaltet");
      break;
    case "chatNurKonto":
      meldung("Zum Chatten musst du angemeldet sein");
      break;
    case "leave":
      entferneAnderen(String(m.id));
      zeigeSpielerZahl();
      break;
  }
}

let planTimer = null;
function sendePlanBald() {
  clearTimeout(planTimer);
  planTimer = setTimeout(sendePlan, 400);
}
function sendePlan() {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "plan", plan: JSON.stringify(plan) }));
}

let letztePose = 0;
const r3 = v => Math.round(v * 1000) / 1000;
function sendePose(sofort = false) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  const jetzt = performance.now();
  const takt = modus === "fahr" ? 33 : 1000;
  if (!sofort && jetzt - letztePose < takt) return;
  letztePose = jetzt;
  const msg = { type: "pose", m: modus, s: spawnZaehler, b: [], w: [], fx: [], g: [] };
  if (modus === "fahr" && meinFahrzeug) {
    for (const b of meinFahrzeug.bodies) {
      const t = b.rb.translation(), q = b.rb.rotation();
      msg.b.push([r3(t.x), r3(t.y), r3(t.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w)]);
    }
    for (const z of letzterRadZustand) msg.w.push(z.teil, r3(z.feder), r3(z.lenk), r3(z.dreh % 1000));
    for (const [i, s] of meinFahrzeug.fx) msg.fx.push([i, r3(s * 10)]);
    meinFahrzeug.gelenke.forEach((g, i) => { if (!g.aktiv) msg.g.push(i); });
  }
  if (modus === "fahr") {
    if (fussRb) msg.f = [r3(meineFigur.position.x), r3(meineFigur.position.y), r3(meineFigur.position.z), r3(meineFigur.rotation.y)];
    if (ichSitz) msg.sit = [idVon(ichSitz.o), ichSitz.i];
  }
  socket.send(JSON.stringify(msg));
}
setInterval(() => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
}, 5000);
addEventListener("pagehide", () => { try { socket?.close(1000, "pagehide"); } catch {} });

// andere spieler
function anderer(id) {
  let r = andere.get(id);
  if (!r) {
    r = { id, name: "", color: "#7bb7ff", look: lookAus(null), lot: 0, m: "bau", s: -1, dv: -1, plan: null, grafik: null, kin: null, puffer: [], neu: true, fx: new Map() };
    r.figur = spielfigur(r.color, r.look);
    r.figur.scale.setScalar(0.62);
    scene.add(r.figur);
    andere.set(id, r);
  }
  return r;
}

function setzePlanAnderer(id, dv, text) {
  const r = anderer(id);
  if (dv === r.dv) return;
  r.dv = dv;
  try {
    r.plan = BAU.bereinige(JSON.parse(text));
  } catch {
    r.plan = null;
  }
  r.neu = true;
}

function aktualisiereAnderen(id, p) {
  const r = anderer(id);
  r.acc = typeof p.acc === "string" ? p.acc : null;
  const name = String(p.name || "Spieler").slice(0, 20);
  if (name !== r.name) {
    r.name = name;
    if (r.label) { r.figur.remove(r.label); entsorge(r.label); }
    r.label = textSprite(name);
    r.label.position.set(0, 2.0, 0);
    r.figur.add(r.label);
  }
  // farbe oder aussehen geändert: figur neu aufbauen (namensschild bleibt)
  const look = lookAus(p.look);
  const neueFarbe = /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : r.color;
  if (neueFarbe !== r.color || JSON.stringify(look) !== JSON.stringify(r.look)) {
    r.color = neueFarbe;
    r.look = look;
    figurAktualisieren(r.figur, r.color, r.look);
  }
  const lot = Number(p.lot) || 0;
  if (lot !== r.lot || p.m !== r.m || p.s !== r.s) {
    r.lot = lot;
    r.m = p.m === "fahr" ? "fahr" : "bau";
    r.s = p.s;
    r.puffer = [];
    r.fPuffer = [];
    r.neu = true;
  }
  r.sit = Array.isArray(p.sit) ? [String(p.sit[0]), Number(p.sit[1])] : null;
  if (r.m === "fahr" && Array.isArray(p.f) && p.f.length === 4) {
    (r.fPuffer ||= []).push({ t: performance.now(), f: p.f });
    if (r.fPuffer.length > 30) r.fPuffer.shift();
  }
  if (r.m === "fahr" && Array.isArray(p.b) && p.b.length) {
    r.puffer.push({ t: performance.now(), b: p.b, w: p.w || [], fx: p.fx || [] });
    if (r.puffer.length > 30) r.puffer.shift();
  }
}

function baueAnderen(r) {
  r.neu = false;
  entferneGrafik(r.grafik);
  if (r.kin) PH.entferneFahrzeug(world, r.kin);
  r.grafik = null;
  r.kin = null;
  const steh = lotPos(r.lot).add(new THREE.Vector3(6.9, 0, -6.9));
  r.angebunden = null;
  if (!r.plan || !r.plan.parts.length) {
    setzeFigurInSitz(r.figur, null, steh);
    return;
  }
  const fahr = r.m === "fahr";
  const lift = fahr ? BAU.bodenAbstand(r.plan, BAU.RAD_TIEFE) : BAU.bodenAbstand(r.plan);
  const basis = lotBasis(r.lot, lift);
  r.grafik = fahrzeugGrafik(r.plan);
  for (const g of r.grafik.groups) scene.add(g);
  stelleAuf(r.grafik, basis);
  r.kin = PH.erzeugeFahrzeug(RAPIER, world, r.plan, { basis: basis.toArray(), kinematisch: true });
  setzeFigurInSitz(r.figur, null, steh); // im fahrmodus setzt bewegefiguranderer die figur um
}

function entferneAnderen(id) {
  const r = andere.get(id);
  if (!r) return;
  entferneGrafik(r.grafik);
  if (r.kin) PH.entferneFahrzeug(world, r.kin);
  setzeBlase(r.figur, null);
  r.figur.removeFromParent();
  entsorge(r.figur);
  andere.delete(id);
}

// figur eines anderen spielers: im sitz (auch in fremden fahrzeugen) oder zu fuß
function bewegeFigurAnderer(r, jetzt, dt) {
  if (r.m !== "fahr") return;
  let ziel = null;
  if (r.sit) {
    const g = besitzerGrafik(r.sit[0]);
    ziel = g?.sitze.find(s => s.index === r.sit[1])?.obj || null;
  }
  if (ziel) {
    if (r.angebunden !== ziel) {
      figurAnSitz(r.figur, ziel);
      r.angebunden = ziel;
    }
    return;
  }
  const buf = r.fPuffer;
  if (!buf || !buf.length) return;
  if (r.angebunden !== "fuss") {
    figurFrei(r.figur);
    r.angebunden = "fuss";
  }
  const zeit = jetzt - 100;
  let von = buf[0], bis = buf[0];
  for (const s of buf) {
    if (s.t <= zeit) von = bis = s;
    else { bis = s; break; }
  }
  const k = bis !== von ? THREE.MathUtils.clamp((zeit - von.t) / (bis.t - von.t), 0, 1) : 0;
  const px = r.figur.position.x, pz = r.figur.position.z;
  r.figur.position.set(
    von.f[0] + (bis.f[0] - von.f[0]) * k,
    von.f[1] + (bis.f[1] - von.f[1]) * k,
    von.f[2] + (bis.f[2] - von.f[2]) * k
  );
  let d = bis.f[3] - r.figur.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  r.figur.rotation.y += d * Math.min(1, dt * 12);
  gehAnim(r.figur, dt > 0 ? Math.hypot(r.figur.position.x - px, r.figur.position.z - pz) / dt : 0);
}

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
function bewegeAndere(jetzt, dt) {
  for (const r of andere.values()) {
    if (r.neu) baueAnderen(r);
    bewegeFigurAnderer(r, jetzt, dt);
    if (!r.grafik || r.m !== "fahr" || !r.puffer.length) continue;
    const zeit = jetzt - 100;
    let von = r.puffer[0], bis = r.puffer[0];
    for (const s of r.puffer) {
      if (s.t <= zeit) von = bis = s;
      else { bis = s; break; }
    }
    const k = bis !== von ? THREE.MathUtils.clamp((zeit - von.t) / (bis.t - von.t), 0, 1) : 0;
    const n = Math.min(r.grafik.groups.length, von.b.length, bis.b.length);
    for (let i = 0; i < n; i++) {
      const a = von.b[i], b = bis.b[i];
      const g = r.grafik.groups[i];
      g.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
      qa.set(a[3], a[4], a[5], a[6]).normalize();
      qb.set(b[3], b[4], b[5], b[6]).normalize();
      g.quaternion.copy(qa.slerp(qb, k));
      const kb = r.kin?.bodies[i]?.rb;
      if (kb) {
        kb.setNextKinematicTranslation(g.position);
        kb.setNextKinematicRotation(g.quaternion);
      }
    }
    const w = bis.w;
    const zust = [];
    for (let i = 0; i + 3 < w.length; i += 4) zust.push({ teil: w[i], feder: w[i + 1], lenk: w[i + 2], dreh: w[i + 3] });
    setzeRaeder(r.grafik, zust);
    r.fx = new Map(bis.fx.map(([i, s]) => [i, s / 10]));
    if (r.plan) setzeKlappen(r.grafik, r.plan, r.fx);
    setzeRotoren(r.grafik, r.fx, dt);
  }
}

function aktualisiereSchilder() {
  const namen = new Map();
  namen.set(meinLot, spielerName);
  for (const r of andere.values()) namen.set(r.lot, r.name);
  lotSchilder.forEach((s, i) => {
    const name = namen.get(i) || "";
    if (s.name === name) return;
    s.name = name;
    const pos = s.schild.position.clone();
    scene.remove(s.schild);
    entsorge(s.schild);
    s.schild = textSprite(name ? `P${i + 1} · ${name}` : `P${i + 1} · ${tr("frei")}`, {
      skala: 2.6,
      bg: i === meinLot ? "rgba(200,120,20,0.95)" : "rgba(20,60,160,0.92)"
    });
    s.schild.position.copy(pos);
    scene.add(s.schild);
  });
}

// ---------------------------------------------------------------------------
// spielschleife
// ---------------------------------------------------------------------------
let letzteZeit = 0;
let akku = 0;
let letzterRadZustand = [];
const tmpQ = new THREE.Quaternion();

function schleife(zeit) {
  requestAnimationFrame(schleife);
  const dt = letzteZeit ? Math.min((zeit - letzteZeit) / 1000, 0.05) : 0;
  letzteZeit = zeit;

  bewegeAndere(zeit, dt);

  // physik in festen schritten
  akku += dt;
  let schritte = 0;
  const ein = modus === "fahr"
    ? (istFahrer() ? eingabe() : { gas: 0, lenk: 0, bremse: true, tasten: new Set() })
    : null;
  if (modus === "fahr") {
    pflegeSitz();
    steuereFuss();
  }
  while (akku >= PH.PHYSIK_TAKT && schritte < 4) {
    if (meinFahrzeug) PH.schritt(world, meinFahrzeug, ein, PH.PHYSIK_TAKT);
    world.step();
    akku -= PH.PHYSIK_TAKT;
    schritte++;
  }
  if (schritte && modus === "fahr") {
    plan.parts.forEach((p, i) => {
      if (p.t === "kamera" && angetippt.has(p.k.taste)) aktiveKamera = aktiveKamera === i ? null : i;
    });
  }
  if (schritte) angetippt.clear();
  if (modus === "fahr") {
    aktualisiereFuss(dt);
    const txt = tr(ichSitz ? "Aussteigen (X)" : "Einsteigen (X)");
    const knopfText = $("#btnAus .txt");
    if (knopfText.textContent !== txt) knopfText.textContent = txt;
  }
  if (schritte === 4) akku = 0;

  for (const p of pylonen) {
    p.mesh.position.copy(p.rb.translation());
    p.mesh.quaternion.copy(p.rb.rotation());
  }

  if (modus === "fahr" && meinFahrzeug) {
    meinFahrzeug.bodies.forEach((b, i) => {
      const g = meineGrafik.groups[i];
      g.position.copy(b.rb.translation());
      g.quaternion.copy(b.rb.rotation());
    });
    letzterRadZustand = PH.radZustand(meinFahrzeug, dt);
    setzeRaeder(meineGrafik, letzterRadZustand);
    setzeKlappen(meineGrafik, plan, meinFahrzeug.fx);
    setzeRotoren(meineGrafik, meinFahrzeug.fx, dt);

    const sb = PH.sitzKoerper(meinFahrzeug);
    const kmh = Math.abs(PH.tempo(meinFahrzeug)) * 3.6;
    const hoehe = sb ? sb.rb.translation().y : 0;
    const ts = PH.tankStand(meinFahrzeug, Math.max(0, meinFahrzeug.ana.sitzBody));
    const tankText = ts.aktiv ? ` · ${ts.kap <= 0 ? tr("Kein Tank verbunden") : ts.menge <= 0.01 ? tr("Tank leer") : `${tr("Tank")} ${Math.round((ts.menge / ts.kap) * 100)}%`}` : "";
    const tb = document.getElementById("tankBalken");
    if (tb) tb.style.width = `${ts.kap ? (ts.menge / ts.kap) * 100 : 0}%`;
    $("#tacho").textContent = `${kmh.toFixed(0)} km/h · ${Math.round(hoehe)} m${tankText}${PH.gravFaktor(hoehe) < 0.02 ? " · " + tr("schwerelos") : ""}${meinFahrzeug.motorAn ? "" : " · " + tr("Motor aus")}`;
    if (sb && sb.rb.translation().y < -30) neuStarten();

    const balken = document.getElementById("treibstoffBalken");
    if (balken) {
      let summe = 0, max = 0;
      plan.parts.forEach((p, i) => {
        if (p.t !== "rakete") return;
        const st = meinFahrzeug.raketen.get(i);
        summe += st ? st.treibstoff : p.k.dauer;
        max += p.k.dauer;
      });
      balken.style.width = `${max ? (summe / max) * 100 : 0}%`;
    }
    if (!!ichSitz !== egoFahrer) { egoFahrer = !!ichSitz; egoBlick.yaw = 0; egoBlick.pitch = 0; }   // kopf zurück in die mitte, wenn man sich hinsetzt oder aufsteht
    if (istFahrer()) kameraFahr(dt);
    else kameraFuss();
    kameraVonTeil();
    meineFigur.visible = !(ansicht === 2 && aktiveKamera === null);
  } else {
    begrenzeBauZiel();
    meineFigur.visible = true;
    const k = bauKamera;
    const s = dt * k.dist * 0.6;
    const vor = new THREE.Vector3(-Math.sin(k.yaw), 0, -Math.cos(k.yaw));
    const rechts = new THREE.Vector3(Math.cos(k.yaw), 0, -Math.sin(k.yaw));
    if (!tippt()) {
      if (gedrueckt.has("w") || gedrueckt.has("arrowup")) k.ziel.addScaledVector(vor, s);
      if (gedrueckt.has("s") || gedrueckt.has("arrowdown")) k.ziel.addScaledVector(vor, -s);
      if (gedrueckt.has("d") || gedrueckt.has("arrowright")) k.ziel.addScaledVector(rechts, s);
      if (gedrueckt.has("a") || gedrueckt.has("arrowleft")) k.ziel.addScaledVector(rechts, -s);
    }
    kameraBau();
    aktualisiereGeist();
  }

  scene.updateMatrixWorld();

  // effekte
  if (meinFahrzeug && meineGrafik) emitEffekte("ich", plan, meineGrafik, meinFahrzeug.fx, dt);
  for (const r of andere.values()) {
    if (r.m === "fahr" && r.grafik && r.plan) emitEffekte(r.id, r.plan, r.grafik, r.fx, dt);
  }
  rauch.update(dt);
  feuer.update(dt);
  const schirmeDa = new Set();
  if (meinFahrzeug && meineGrafik) aktualisiereSchirme("ich", plan, meineGrafik, meinFahrzeug.fx, dt, schirmeDa);
  for (const r of andere.values()) {
    if (r.m === "fahr" && r.grafik && r.plan) aktualisiereSchirme(r.id, r.plan, r.grafik, r.fx, dt, schirmeDa);
  }
  for (const [key, s] of schirme) {
    if (!schirmeDa.has(key)) {
      scene.remove(s.obj);
      schirme.delete(key);
    }
  }

  // sonne folgt der kamera
  const fokus = modus === "fahr" ? fahrKamera.blick : bauKamera.ziel;
  sonne.target.position.set(fokus.x, 0, fokus.z);
  sonne.position.set(fokus.x - 18, 34, fokus.z + 14);

  aktualisiereBlasen();
  sendePose();
  aktualisiereLichter();
  aktualisiereHimmel(zeit);
  renderer.render(scene, camera);
}

function kameraFahr(dt) {
  if (ansicht === 2) return kameraEgoFahrzeug();
  // im standardsitz (der erste sitz) bleibt alles wie bisher; in einem anderen sitz folgt die kamera diesem sitz
  const anderer = ichSitz && ichSitz.o === "ich" && ichSitz.i !== meinFahrzeug.ana.sitz ? sitzObjekt(ichSitz) : null;
  const sitzKoerperIdx = anderer ? meinFahrzeug.ana.bodyOf[ichSitz.i] : undefined;
  const b = (sitzKoerperIdx !== undefined && meinFahrzeug.bodies[sitzKoerperIdx]) || PH.sitzKoerper(meinFahrzeug);
  if (!b) return;
  const pos = b.rb.translation();
  const rot = b.rb.rotation();
  const vor = new THREE.Vector3(...meinFahrzeug.vorwaerts).applyQuaternion(tmpQ.set(rot.x, rot.y, rot.z, rot.w));
  if (Math.hypot(vor.x, vor.z) > 0.2) {
    const zielYaw = Math.atan2(-vor.x, -vor.z); // kamera hinter dem fahrzeug
    let d = zielYaw - fahrKamera.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    fahrKamera.yaw += d * Math.min(1, dt * 3.5);
  }
  if (performance.now() - fahrKamera.zuletztGezogen > 2500) {
    fahrKamera.yawOffset *= Math.exp(-dt * 2);
  }
  // offener fallschirm: kamera weiter weg und höher, damit er nicht das bild verdeckt
  let schirm = 0;
  for (const [i, s] of meinFahrzeug.fx) if (plan.parts[i]?.t === "fallschirm") schirm = Math.max(schirm, s);
  fahrKamera.schirm = (fahrKamera.schirm || 0) + (schirm - (fahrKamera.schirm || 0)) * Math.min(1, dt * 3);
  const dist = (ansicht === 1 ? 4.2 : fahrKamera.dist) + fahrKamera.schirm * 5;
  const yaw = fahrKamera.yaw + fahrKamera.yawOffset;
  const p = fahrKamera.pitch + fahrKamera.schirm * 0.6;
  const blick = new THREE.Vector3(pos.x, pos.y + 0.9, pos.z);
  if (anderer) {
    anderer.obj.updateWorldMatrix(true, false);
    anderer.obj.getWorldPosition(blick);   // auf den besetzten sitz schauen, nicht auf den schwerpunkt oder den ersten sitz
    blick.y += 0.9;
  }
  fahrKamera.blick.lerp(blick, fahrKamera.blick.lengthSq() ? Math.min(1, dt * 12) : 1);
  const soll = new THREE.Vector3(
    fahrKamera.blick.x + Math.sin(yaw) * Math.cos(p) * dist,
    Math.max(0.4, fahrKamera.blick.y + Math.sin(p) * dist),
    fahrKamera.blick.z + Math.cos(yaw) * Math.cos(p) * dist
  );
  soll.y = Math.max(soll.y, bodenHoehe(soll.x, soll.z) + 0.6);
  if (!fahrKamera.pos.lengthSq()) fahrKamera.pos.copy(soll);
  fahrKamera.pos.lerp(soll, Math.min(1, dt * 8));
  camera.position.copy(fahrKamera.pos);
  camera.position.y = Math.max(camera.position.y, bodenHoehe(camera.position.x, camera.position.z) + 0.5);
  camera.lookAt(fahrKamera.blick);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  for (const p of [rauch, feuer]) p.setzeSkala(innerHeight * renderer.getPixelRatio(), camera.fov);
});
for (const p of [rauch, feuer]) p.setzeSkala(innerHeight * renderer.getPixelRatio(), fov);

// start
// handy: kein text markieren, kein kopieren-/übersetzen-menü bei langem drücken (eingabefelder ausgenommen)
const istEingabe = el => !!(el && el.closest && el.closest("input, textarea, select"));
addEventListener("contextmenu", e => { if (!istEingabe(e.target)) e.preventDefault(); });
document.addEventListener("selectstart", e => {
  const el = e.target.nodeType === 1 ? e.target : e.target.parentElement;
  if (!istEingabe(el)) e.preventDefault();
});
setBtn("#btnModus", "▶", tr("Losfahren"));
setBtn("#btnAus", "⇄", tr("Einsteigen (X)"));
$("#btnAnsicht").title = $("#btnAnsicht").ariaLabel = tr("Ansicht umschalten (C)");
$("#langBtn").innerHTML = EN ? "DE | <b>EN</b>" : "<b>DE</b> | EN";
$("#langBtn").onclick = () => window.WG && WG.set(EN ? "de" : "en");
// höhe der bau-leiste für die position des fahren-knopfs (handheld)
if (window.ResizeObserver) {
  new ResizeObserver(() => document.documentElement.style.setProperty("--bar", `${$("#baupanel").offsetHeight || 0}px`)).observe($("#baupanel"));
}
$("#chatToggle").onclick = () => {
  const offen = document.body.classList.toggle("chat-offen");
  if (offen) chatInput.focus();
  else chatInput.blur();
};
$("#lotNr").textContent = `P${meinLot + 1}`;
document.body.classList.add("bau");
baueBauansicht();
aktualisiereSchilder();
verbinde();
Konto.start({ getPlan: () => plan, setPlan: planAusKonto });
startRaeume({ httpBasis: serverBasis(), aktuell: () => raumId, wechseln: wechsleRaum });
{
  const warnung = Konto.warnungText();   // fehlversuche seit der letzten anmeldung
  if (warnung) meldung(warnung, 12000);
}
startModelle();
requestAnimationFrame(schleife);

// besuchszählung mit goatcounter als einzelnes zählpixel (ein bild, kein fremdes skript, nicht lokal)
if (/^https?:$/.test(location.protocol) && !["localhost", "127.0.0.1"].includes(location.hostname)) {
  const pixel = new Image();
  pixel.referrerPolicy = "no-referrer";
  pixel.src = `https://kroxenstudios.goatcounter.com/count?p=${encodeURIComponent("/bastelkarre")}&t=Bastelkarre&rnd=${Math.random().toString(36).slice(2)}`;
}

// für tests im browser
window.bastelkarre = { bodenHoehe, weltDaten: () => WELTDATEN, leiterPos: () => meineGrafik.leitern.map(o => o.getWorldPosition(new THREE.Vector3()).toArray()), setzeFuss: (x, y, z) => fussRb && fussRb.setTranslation({ x, y, z }, true), lichter: () => lichtPool.map(l => +l.intensity.toFixed(0)), oeffneInspector, klickSitz, maus, treffer: () => { raycaster.setFromCamera(maus, camera); const out = []; const gs = [meineGrafik, ...[...andere.values()].map(r => r.grafik)].filter(Boolean); for (const g of gs) for (const h of raycaster.intersectObjects(g.groups, true).slice(0, 3)) out.push([h.object.userData.teil, +h.distance.toFixed(1), h.object.type]); return out; }, fussKamera: fuss, sitzPixel: (o, i) => {
    const s = sitzObjekt({ o, i });
    if (!s) return null;
    const v = s.obj.localToWorld(new THREE.Vector3(0, -0.1, 0.1)).project(camera); // sitzfläche
    const r = canvas.getBoundingClientRect();
    return [((v.x + 1) / 2) * r.width + r.left, ((1 - v.y) / 2) * r.height + r.top, v.z];
  }, planGeaendert, sitz: () => ichSitz, fuss: () => fussRb && fussRb.translation(), ausEinsteigen, plan: () => plan, modus: () => modus, wechsleModus, setzeIchSitz, kameraPos: () => camera.position.toArray(), sitzPos: (o, i) => sitzObjekt({ o, i })?.obj.getWorldPosition(new THREE.Vector3()).toArray(), fahrzeug: () => meinFahrzeug, gedrueckt, andere };
