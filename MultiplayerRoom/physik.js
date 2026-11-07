// Bastelkarre: Fahrzeugphysik mit Rapier (ohne Grafik, läuft auch in Node).
//
// Aus dem Bauplan entstehen:
//  - ein starrer Körper je Gruppe fest verbundener Teile,
//  - Raycast-Räder (Federung, Antrieb, Lenkung) an den Körpern mit Rädern,
//  - Drehgelenke mit Motor für Stellmotoren, feste Gelenke für Sollbruchstellen.
// Lose Teile sind eigene Körper; Triebwerke schieben den Körper, an dem sie sitzen.

import {
  TEILE, ORIENT, ZELLE, RAD_TIEFE, analysiere, zellMitte, teilAchse, radRadius, matVec
} from "./bau.js";

export const PHYSIK_TAKT = 1 / 60;
// Collider-Handles, die die Radstrahlen nicht treffen sollen (zu Fuß gehende Spieler)
export const ignoriere = new Set();

// Höhenmodell: Luftdichte nimmt mit der Höhe exponentiell ab, die Schwerkraft verschwindet
// zwischen 3000 und 7000 m ("Weltraum": schwerelos, praktisch keine Luft).
export const LUFT0 = 1.2;
export const dichte = h => LUFT0 * Math.exp(-Math.max(0, h) / 1500);
const glatt = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const gravFaktor = h => 1 - glatt(3000, 7000, h);

const MOTOR_LEISTUNG = 55000;   // W
const MOTOR_KRAFT = 5200;       // N, gesamt an allen angetriebenen Rädern
const HOECHST_TEMPO = 32;       // m/s
const FEDER_WEG = 0.2;          // m, Ruhelänge der Federung
const BREMSE = 60;

// Drehmatrix (zeilenweise) -> Quaternion
export function matQuat(m) {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
  }
  return { x, y, z, w };
}

export function quatRot(q, v) {
  const { x, y, z, w } = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x
  ];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vec = a => ({ x: a[0], y: a[1], z: a[2] });
const arr = v => [v.x, v.y, v.z];

// Form der Kollisionskörper in lokalen Teilkoordinaten
const H = ZELLE / 2 - 0.004;
const KEIL_PUNKTE = [
  [-H, -H, -H], [H, -H, -H], [-H, -H, H], [H, -H, H],
  [-H, H, H], [H, H, H]
];
const ECKE_PUNKTE = [
  [-H, -H, -H], [H, -H, -H], [-H, -H, H], [H, -H, H],
  [H, H, H]
];

function colliderFuer(R, part, lokal) {
  const m = ORIENT[part.o];
  const q = matQuat(m);
  const masse = TEILE[part.t].masse;
  let desc;

  switch (part.t) {
    case "block":
    case "sitz":
    case "tank":
      desc = R.ColliderDesc.cuboid(H, H, H);
      break;
    case "halb": {
      desc = R.ColliderDesc.cuboid(H, H / 2, H);
      lokal = add(lokal, matVec(m, [0, -ZELLE / 4, 0]));
      break;
    }
    case "keil":
    case "ecke": {
      const pts = (part.t === "keil" ? KEIL_PUNKTE : ECKE_PUNKTE).flatMap(p => matVec(m, p));
      desc = R.ColliderDesc.convexHull(new Float32Array(pts));
      return desc.setTranslation(...lokal).setMass(masse).setFriction(0.7);
    }
    case "leiter":
      desc = R.ColliderDesc.cuboid(0.2, H, 0.05);
      break;
    case "fluegel":
    case "steuerflaeche":
      desc = R.ColliderDesc.cuboid(H, 0.04, H);
      break;
    case "servo":
    case "bruch":
      desc = R.ColliderDesc.cuboid(0.2, H, 0.2);
      break;
    case "auspuff":
      desc = R.ColliderDesc.cuboid(0.07, 0.2, 0.07);
      break;
    default:
      desc = R.ColliderDesc.cuboid(0.18, 0.22, 0.18);
  }
  return desc.setTranslation(...lokal).setRotation(q).setMass(masse).setFriction(0.7);
}

// ---------------------------------------------------------------------------
// Fahrzeug erzeugen
// ---------------------------------------------------------------------------
// opts.basis: Weltposition des Bauraum-Ursprungs (inkl. Anhebung)
// opts.drehung: Quaternion für das ganze Fahrzeug
// opts.kinematisch: true für Fahrzeuge anderer Spieler (nur Kollision)
export function erzeugeFahrzeug(R, world, bauplan, opts = {}) {
  const basis = opts.basis || [0, 0, 0];
  const dreh = opts.drehung || { x: 0, y: 0, z: 0, w: 1 };
  const kin = !!opts.kinematisch;
  const ana = analysiere(bauplan);
  const parts = bauplan.parts;

  const sitz = ana.sitz >= 0 ? parts[ana.sitz] : null;
  const vorwaerts = sitz ? teilAchse(sitz, [0, 0, -1]) : [0, 0, -1];

  // Gesamtschwerpunkt für die automatische Lenkrichtung (Hinterachslenkung)
  let gm = 0, gs = [0, 0, 0];
  for (const b of ana.bodies) { gm += b.masse; gs = add(gs, scale(b.ursprung, b.masse)); }
  const schwerpunkt = gm > 0 ? scale(gs, 1 / gm) : [0, 0, 0];

  const veh = {
    plan: bauplan, ana, kin, vorwaerts, bodies: [], gelenke: [],
    colliderSet: new Set(), motorAn: true, lenkung: 0,
    fx: new Map(), nebelAn: new Map(), raketen: new Map(), schirme: new Map(), ruder: new Map(), servoZiel: new Map(),
    tasteVorher: new Set(), angetrieben: new Set(),
    licht: new Map(), hebel: new Map(), gruppe: [],
    tank: { menge: new Map(), aktiv: false }, verbrauch: opts.verbrauch !== false
  };

  for (let bi = 0; bi < ana.bodies.length; bi++) {
    const b = ana.bodies[bi];
    const pos = add(basis, quatRot(dreh, b.ursprung));
    const desc = kin ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic();
    desc.setTranslation(...pos).setRotation(dreh).setCanSleep(false);
    if (!kin) desc.setLinearDamping(0.05).setAngularDamping(0.3).setCcdEnabled(true);
    const rb = world.createRigidBody(desc);

    const nurRaeder = b.parts.every(i => TEILE[parts[i].t].rad);
    const body = { rb, index: bi, ursprung: b.ursprung, parts: b.parts, vc: null, raeder: [], loseRaeder: nurRaeder };

    for (const i of b.parts) {
      const p = parts[i];
      const lokal = sub(zellMitte(p), b.ursprung);
      const def = TEILE[p.t];

      if (def.rad && !nurRaeder) {
        // Masse des Rads ohne Kollision (das Rad selbst ist ein Strahl)
        const md = R.ColliderDesc.ball(0.1).setTranslation(...lokal).setMass(def.masse)
          .setCollisionGroups(0).setSolverGroups(0);
        veh.colliderSet.add(world.createCollider(md, rb).handle);
        continue;
      }

      let cd;
      if (def.rad) {
        // loses Rad: echter Zylinder entlang der Radachse
        cd = R.ColliderDesc.cylinder(0.11, radRadius(p)).setTranslation(...lokal)
          .setRotation(matQuat(ORIENT[p.o])).setMass(def.masse).setFriction(1.0);
      } else {
        cd = colliderFuer(R, p, lokal);
      }
      const col = world.createCollider(cd, rb);
      veh.colliderSet.add(col.handle);
    }

    // Raycast-Räder
    const radTeile = nurRaeder ? [] : b.parts.filter(i => TEILE[parts[i].t].rad);
    if (radTeile.length && !kin) {
      const vc = world.createVehicleController(rb);
      body.vc = vc;
      for (const i of radTeile) {
        const p = parts[i];
        const r = radRadius(p);
        const mitte = sub(zellMitte(p), b.ursprung);
        let achse = teilAchse(p);
        achse = [achse[0], 0, achse[2]];
        if (!achse[0] && !achse[2]) achse = cross(vorwaerts, [0, 1, 0]);
        // Rollrichtung = oben x Achse; so drehen, dass "Gas" nach vorne fährt
        if (dot(cross([0, 1, 0], achse), vorwaerts) < 0) achse = scale(achse, -1);

        // Unbelastet hängt das Rad RAD_TIEFE tiefer, belastet steht es in der Zellmitte.
        vc.addWheel(vec(add(mitte, [0, FEDER_WEG - RAD_TIEFE, 0])), { x: 0, y: -1, z: 0 }, vec(achse), FEDER_WEG, r);
        const w = vc.numWheels() - 1;
        // Steifigkeit wirkt je Rad (pro Masse): bei vielen Rädern weicher, damit
        // die Einfederung unabhängig von der Radzahl etwa RAD_TIEFE beträgt.
        // Einkaufswagenräder haben fast keine Federung.
        const hart = p.t === "rad_bock" ? 3 : 1;
        vc.setWheelSuspensionStiffness(w, (hart * 9.81) / (RAD_TIEFE * radTeile.length));
        vc.setWheelSuspensionCompression(w, 2.6 * Math.sqrt(hart));
        vc.setWheelSuspensionRelaxation(w, 3.4 * Math.sqrt(hart));
        vc.setWheelMaxSuspensionTravel(w, p.t === "rad_bock" ? 0.08 : 0.18);
        vc.setWheelMaxSuspensionForce(w, 200000);
        vc.setWheelFrictionSlip(w, p.t === "rad_bock" ? 0.6 : 2.2);
        vc.setWheelSideFrictionStiffness(w, p.t === "rad_bock" ? 0 : 1.1);

        let lenkFaktor = 0;
        if (p.t === "rad_lenk") {
          const hinten = dot(sub(zellMitte(p), schwerpunkt), vorwaerts) < 0;
          const umkehr = p.k.umkehr === "ja" || (p.k.umkehr !== "nein" && hinten);
          lenkFaktor = (umkehr ? -1 : 1) * (p.k.winkel ?? 35) * Math.PI / 180;
        }
        body.raeder.push({
          teil: i, w, r, lenkFaktor,
          antrieb: p.t !== "rad_bock" && p.k.antrieb !== false,
          bock: p.t === "rad_bock",
          mitte, drehung: 0, schwenk: 0,
          // Drehsinn der Grafik: Rad-Modell dreht um seine lokale Y-Achse
          achsVz: dot(achse, teilAchse(p)) < 0 ? -1 : 1
        });
      }
    }
    veh.bodies.push(body);
  }

  // Gelenke
  if (!kin) {
    for (const g of ana.gelenke) {
      const A = veh.bodies[g.bodyA], B = veh.bodies[g.bodyB];
      const teil = parts[g.teil];
      const anker = add(zellMitte(teil), scale(g.dir, ZELLE / 2));
      const a1 = vec(sub(anker, A.ursprung));
      const a2 = vec(sub(anker, B.ursprung));
      let data;
      if (g.art === "servo") data = R.JointData.revolute(a1, a2, vec(g.dir));
      else data = R.JointData.fixed(a1, { x: 0, y: 0, z: 0, w: 1 }, a2, { x: 0, y: 0, z: 0, w: 1 });
      const j = world.createImpulseJoint(data, A.rb, B.rb, true);
      j.setContactsEnabled(false);

      const gel = { ...g, j, aktiv: true, ziel: 0 };
      if (g.art === "servo") {
        const w = (teil.k.winkel ?? 90) * Math.PI / 180;
        if (teil.k.modus !== "dauer" && w < Math.PI - 0.01) j.setLimits(-w, w);
        j.configureMotorPosition(0, 600, 60);
      }
      veh.gelenke.push(gel);
    }
  }

  // Schwere Fahrzeuge bekommen einen stärkeren Motor und stärkere Bremsen (ab ca. 450 kg, höchstens Faktor 3)
  let gesamtMasse = 0;
  for (const b of veh.bodies) gesamtMasse += b.rb.mass();
  veh.motorFaktor = Math.max(1, Math.min(3, Math.sqrt(gesamtMasse / 450)));

  // Treibstoff: jeder Tank startet voll; das System ist nur mit mindestens einem Tank aktiv
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].t === "tank") veh.tank.menge.set(i, parts[i].k.kapazitaet ?? 60);
  }
  veh.tank.aktiv = veh.tank.menge.size > 0;
  berechneGruppen(veh);

  aktualisiereAntrieb(veh);
  return veh;
}

// Gruppen fest (über intakte Gelenke) verbundener Körper: jede Gruppe hat ihren eigenen Treibstoffvorrat
function berechneGruppen(veh) {
  const n = veh.bodies.length;
  veh.gruppe = new Array(n).fill(-1);
  let id = 0;
  for (let s = 0; s < n; s++) {
    if (veh.gruppe[s] >= 0) continue;
    veh.gruppe[s] = id;
    const stack = [s];
    while (stack.length) {
      const b = stack.pop();
      for (const g of veh.gelenke) {
        if (!g.aktiv) continue;
        const o = g.bodyA === b ? g.bodyB : g.bodyB === b ? g.bodyA : -1;
        if (o >= 0 && veh.gruppe[o] < 0) {
          veh.gruppe[o] = id;
          stack.push(o);
        }
      }
    }
    id++;
  }
}

// Treibstoff entnehmen: liefert den Anteil (0..1) der gewünschten Menge, der tatsächlich da war.
// Ohne Tanks oder bei abgeschaltetem Verbrauch ist immer genug da.
export function entnimm(veh, koerper, menge) {
  const t = veh.tank;
  if (!t.aktiv || !veh.verbrauch) return 1;
  const gid = veh.gruppe[koerper];
  let summe = 0;
  const liste = [];
  for (const [i, m] of t.menge) {
    if (m > 0 && veh.gruppe[veh.ana.bodyOf[i]] === gid) {
      liste.push(i);
      summe += m;
    }
  }
  if (summe <= 0) return 0;
  if (menge <= 0) return 1;
  const nimm = Math.min(menge, summe);
  for (const i of liste) t.menge.set(i, t.menge.get(i) - nimm * (t.menge.get(i) / summe));
  return nimm / menge;
}

// Füllstand der Gruppe eines Körpers
export function tankStand(veh, koerper) {
  let menge = 0, kap = 0;
  for (const [i, m] of veh.tank.menge) {
    if (veh.gruppe[veh.ana.bodyOf[i]] === veh.gruppe[koerper]) {
      menge += m;
      kap += veh.plan.parts[i].k.kapazitaet ?? 60;
    }
  }
  return { menge, kap, aktiv: veh.tank.aktiv && veh.verbrauch };
}

// Welche Körper hängen (über intakte Gelenke) am Sitz? Nur deren Räder treibt der Motor an.
function aktualisiereAntrieb(veh) {
  veh.angetrieben.clear();
  const start = veh.ana.sitzBody;
  if (start < 0) return;
  const stack = [start];
  veh.angetrieben.add(start);
  while (stack.length) {
    const b = stack.pop();
    for (const g of veh.gelenke) {
      if (!g.aktiv) continue;
      const other = g.bodyA === b ? g.bodyB : g.bodyB === b ? g.bodyA : -1;
      if (other >= 0 && !veh.angetrieben.has(other)) {
        veh.angetrieben.add(other);
        stack.push(other);
      }
    }
  }
}

export function entferneFahrzeug(world, veh) {
  for (const b of veh.bodies) {
    if (b.vc) world.removeVehicleController(b.vc);
    world.removeRigidBody(b.rb);
  }
  veh.bodies = [];
}

// Geschwindigkeit eines Weltpunkts auf einem Körper
export function punktGeschw(rb, p) {
  const v = rb.linvel(), w = rb.angvel(), c = rb.translation();
  const r = [p[0] - c.x, p[1] - c.y, p[2] - c.z];
  return add(arr(v), cross(arr(w), r));
}

export function sitzKoerper(veh) {
  return veh.ana.sitzBody >= 0 ? veh.bodies[veh.ana.sitzBody] : veh.bodies[0];
}

// Tempo in Fahrtrichtung (m/s)
export function tempo(veh) {
  const b = sitzKoerper(veh);
  if (!b) return 0;
  const f = quatRot(b.rb.rotation(), veh.vorwaerts);
  return dot(arr(b.rb.linvel()), f);
}

// ---------------------------------------------------------------------------
// Steuerung pro Physikschritt
// ---------------------------------------------------------------------------
// eingabe: { gas: -1..1, lenk: -1..1, bremse: bool, tasten: Set }
// "tasten" sind die gerade gedrückten Tasten (Kleinbuchstaben, " " = "space").
export function steuere(world, veh, eingabe, dt) {
  const parts = veh.plan.parts;
  const tasten = eingabe.tasten || new Set();
  const neu = new Set([...tasten].filter(t => !veh.tasteVorher.has(t)));
  veh.tasteVorher = new Set(tasten);
  veh.fx.clear();

  // Höhe: Schwerkraft und Dämpfung (Luftreibung) je Körper anpassen
  for (const b of veh.bodies) {
    const h = b.rb.translation().y;
    const luft = dichte(h) / LUFT0;
    b.rb.setGravityScale(gravFaktor(h), false);
    if (!veh.kin) {
      b.rb.setLinearDamping(0.05 * luft);
      b.rb.setAngularDamping(0.02 + 0.28 * luft);
    }
  }

  const v = tempo(veh);
  let gas = veh.motorAn ? eingabe.gas : 0;
  // Fahrmotor braucht Treibstoff (nur wenn das Fahrzeug Tanks hat und der Verbrauch an ist)
  if (gas !== 0) gas *= entnimm(veh, Math.max(0, veh.ana.sitzBody), 0.15 * Math.abs(gas) * dt);

  // Antriebskraft: begrenzt durch Kraft und Leistung
  const mf = veh.motorFaktor || 1;
  let kraft = 0, bremsen = eingabe.bremse ? BREMSE * mf : 0;
  if (gas > 0) {
    if (v < -0.8) bremsen = Math.max(bremsen, BREMSE * mf * gas);
    else if (v < HOECHST_TEMPO) kraft = Math.min(MOTOR_KRAFT * mf, (MOTOR_LEISTUNG * mf) / Math.max(Math.abs(v), 1)) * gas;
  } else if (gas < 0) {
    if (v > 0.8) bremsen = Math.max(bremsen, BREMSE * mf * -gas);
    else if (v > -9) kraft = MOTOR_KRAFT * mf * 0.45 * gas;
  } else if (!eingabe.bremse) {
    bremsen = 1.2 * mf; // Rollwiderstand und Motorbremse
  }

  // Lenkung weich nachführen, bei hohem Tempo weniger Einschlag
  veh.lenkung += (eingabe.lenk - veh.lenkung) * Math.min(1, dt * 9);
  const lenkTempo = 1 / (1 + Math.abs(v) / 18);

  let anzahlAntrieb = 0;
  for (const b of veh.bodies) {
    if (!b.vc || !veh.angetrieben.has(b.index)) continue;
    for (const r of b.raeder) if (r.antrieb) anzahlAntrieb++;
  }

  for (const b of veh.bodies) {
    if (!b.vc) continue;
    const verbunden = veh.angetrieben.has(b.index);
    for (const r of b.raeder) {
      const f = verbunden && r.antrieb && anzahlAntrieb ? kraft / anzahlAntrieb : 0;
      b.vc.setWheelEngineForce(r.w, f);
      b.vc.setWheelBrake(r.w, r.bock ? 0.02 : verbunden ? bremsen : 0.8);
      // Rapier: positiver Einschlag lenkt nach links, "lenk" ist positiv nach rechts
      b.vc.setWheelSteering(r.w, verbunden ? -veh.lenkung * r.lenkFaktor * lenkTempo : 0);
    }
  }

  // Anbauteile
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const k = p.k || {};
    switch (p.t) {
      case "auspuff":
        if (veh.motorAn) veh.fx.set(i, 0.25 + 0.75 * Math.abs(eingabe.gas));
        break;
      case "nebel": {
        if (neu.has(k.taste)) veh.nebelAn.set(i, !veh.nebelAn.get(i));
        if (veh.nebelAn.get(i)) veh.fx.set(i, 1);
        break;
      }
      case "duese":
        if (tasten.has(k.taste)) {
          const f = entnimm(veh, veh.ana.bodyOf[i], 0.6 * (k.schub ?? 4) * dt);
          if (f > 0) {
            schub(veh, i, (k.schub ?? 4) * 1000 * f, dt);
            veh.fx.set(i, 1);
          }
        }
        break;
      case "propeller": {
        // Gashebel: bleibt eingestellt. Schub sinkt mit Tempo und Luftdichte (Vakuum = kein Schub).
        const richtung = (tasten.has(k.plus) ? 1 : 0) - (tasten.has(k.minus) ? 1 : 0);
        const h = Math.max(0, Math.min(1, (veh.hebel.get(i) ?? 0) + richtung * 0.7 * dt));
        veh.hebel.set(i, h);
        if (h > 0.01) {
          const bi = veh.ana.bodyOf[i];
          const b = veh.bodies[bi];
          const f = entnimm(veh, bi, 0.3 * (k.schub ?? 4) * h * dt);
          if (f > 0) {
            const rot = b.rb.rotation();
            const dir = quatRot(rot, scale(teilAchse(p), -1));
            const punkt = add(arr(b.rb.translation()), quatRot(rot, sub(zellMitte(p), b.ursprung)));
            const vax = dot(punktGeschw(b.rb, punkt), dir);
            const luft = dichte(punkt[1]) / LUFT0;
            const n = (k.schub ?? 4) * 1000 * h * f * luft * Math.max(0, 1 - Math.max(0, vax) / Math.max(10, k.tempo ?? 80));
            b.rb.applyImpulseAtPoint(vec(scale(dir, n * dt)), vec(punkt), true);
            veh.fx.set(i, Math.max(0.05, h * f));
          }
        }
        break;
      }
      case "scheinwerfer":
        if (neu.has(k.taste)) veh.licht.set(i, !veh.licht.get(i));
        if (veh.licht.get(i)) veh.fx.set(i, 1);
        break;
      case "tank":
        veh.fx.set(i, Math.min(1, (veh.tank.menge.get(i) ?? 0) / Math.max(1, k.kapazitaet ?? 60)));
        break;
      case "rakete": {
        const dauer = k.dauer ?? 3;
        const st = veh.raketen.get(i) || { treibstoff: dauer, leer: false };
        if (tasten.has(k.taste) && !st.leer && st.treibstoff > 0) {
          st.treibstoff -= dt;
          schub(veh, i, (k.schub ?? 14) * 1000, dt);
          veh.fx.set(i, 1);
          if (st.treibstoff <= 0) st.leer = true;
        } else {
          st.treibstoff = Math.min(dauer, st.treibstoff + dt * dauer / 6);
          if (st.leer && st.treibstoff >= dauer) st.leer = false;
        }
        veh.raketen.set(i, st);
        break;
      }
      case "fluegel":
        aero(veh, i, k.flaeche ?? 4, 0, dt);
        break;
      case "steuerflaeche": {
        const max = Math.max(0.01, ((k.winkel ?? 25) * Math.PI) / 180);
        const richtung = ((tasten.has(k.plus) ? 1 : 0) - (tasten.has(k.minus) ? 1 : 0)) * (k.gegenlauf ? -1 : 1);
        let d = veh.ruder.get(i) ?? 0;
        const schritt = 3 * dt;
        d += Math.max(-schritt, Math.min(schritt, richtung * max - d));
        veh.ruder.set(i, d);
        aero(veh, i, k.flaeche ?? 1.5, d, dt);
        veh.fx.set(i, 0.5 + (0.5 * d) / max); // für die Darstellung (0..1, 0,5 = neutral)
        break;
      }
      case "fallschirm": {
        // Taste öffnet, nochmal drücken packt ihn wieder ein
        const st = veh.schirme.get(i) || { an: false, offen: 0 };
        if (neu.has(k.taste)) st.an = !st.an;
        // Aufblasen dauert etwa eine halbe Sekunde, Einpacken geht schneller
        st.offen = st.an ? Math.min(1, st.offen + dt * 2) : Math.max(0, st.offen - dt * 4);
        if (st.offen > 0) {
          luftwiderstand(veh, i, (k.flaeche ?? 12) * st.offen, dt);
          veh.fx.set(i, st.offen);
        }
        veh.schirme.set(i, st);
        break;
      }
    }
  }

  // Gelenke: Stellmotoren und Sollbruchstellen
  let getrennt = false;
  for (const g of veh.gelenke) {
    if (!g.aktiv) continue;
    const k = parts[g.teil].k || {};
    if (g.art === "bruch") {
      if (neu.has(k.taste)) {
        trenne(world, veh, g);
        getrennt = true;
      }
      continue;
    }
    const richtung = (tasten.has(k.plus) ? 1 : 0) - (tasten.has(k.minus) ? 1 : 0);
    const tempoRad = (k.tempo ?? 90) * Math.PI / 180;
    if (k.modus === "dauer") {
      g.j.configureMotorVelocity(richtung * tempoRad, 40);
    } else {
      const max = (k.winkel ?? 90) * Math.PI / 180;
      g.ziel += richtung * tempoRad * dt;
      if (max < Math.PI - 0.01) g.ziel = Math.max(-max, Math.min(max, g.ziel));
      g.j.configureMotorPosition(g.ziel, 600, 60);
    }
  }
  if (getrennt) aktualisiereAntrieb(veh);
}

// Tragfläche / Steuerfläche: ebene Platte im Luftstrom.
// Lokal: Spannweite = X, Flügeltiefe = Z (hinten = +Z), Plattennormale = Y.
// delta kippt die Hinterkante nach oben (Ruderausschlag, positiv = Hinterkante hoch).
// Auftrieb ~ CL(Anstellwinkel), Luftwiderstand ~ CD0 + k·sin²(Anstellwinkel); ab etwa 17° Strömungsabriss.
const STALL = 0.3;
function aero(veh, i, flaeche, delta, dt) {
  const b = veh.bodies[veh.ana.bodyOf[i]];
  if (!b) return;
  const p = veh.plan.parts[i];
  const rot = b.rb.rotation();
  const n = quatRot(rot, matVec(ORIENT[p.o], [0, Math.cos(delta), -Math.sin(delta)]));
  const punkt = add(arr(b.rb.translation()), quatRot(rot, sub(zellMitte(p), b.ursprung)));
  const v = punktGeschw(b.rb, punkt);
  const tempo = Math.hypot(...v);
  if (tempo < 1) return;
  const vh = scale(v, 1 / tempo);
  const vn = dot(vh, n);
  const alpha = Math.asin(Math.min(1, Math.abs(vn)));
  const cl = alpha < STALL ? 4.5 * alpha : Math.sin(2 * alpha);
  const cd = 0.05 + 1.2 * vn * vn;
  const q = 0.5 * dichte(punkt[1]) * tempo * tempo * flaeche;
  const quer = sub(n, scale(vh, vn));
  const ql = Math.hypot(...quer);
  let kraft = scale(vh, -q * cd);
  if (ql > 1e-4) kraft = add(kraft, scale(quer, (-Math.sign(vn) * q * cl) / ql));
  let impuls = scale(kraft, dt);
  const grenze = b.rb.mass() * tempo * 0.4; // nie stärker, als der Körper Schwung hat
  const betrag = Math.hypot(...impuls);
  if (betrag > grenze) impuls = scale(impuls, grenze / betrag);
  b.rb.applyImpulseAtPoint(vec(impuls), vec(punkt), true);
}

// Fallschirm: Luftwiderstand F = 1/2 * rho * cw * A * v^2 gegen die Bewegung,
// angreifend am Befestigungspunkt (dreht das Fahrzeug mit dem Schirm-Ende in den Wind).
const CW = 1.3;
function luftwiderstand(veh, i, flaeche, dt) {
  const b = veh.bodies[veh.ana.bodyOf[i]];
  if (!b) return;
  const p = veh.plan.parts[i];
  const rot = b.rb.rotation();
  const punkt = add(arr(b.rb.translation()), quatRot(rot, sub(zellMitte(p), b.ursprung)));
  const v = punktGeschw(b.rb, punkt);
  const tempo = Math.hypot(...v);
  if (tempo < 0.05) return;
  let impuls = 0.5 * dichte(punkt[1]) * CW * flaeche * tempo * tempo * dt;
  // nie stärker bremsen, als der Körper Schwung hat (sonst schwingt es zurück)
  impuls = Math.min(impuls, b.rb.mass() * tempo * 0.5);
  b.rb.applyImpulseAtPoint(vec(scale(v, -impuls / tempo)), vec(punkt), true);
}

function schub(veh, i, newton, dt) {
  const b = veh.bodies[veh.ana.bodyOf[i]];
  if (!b) return;
  const p = veh.plan.parts[i];
  const rot = b.rb.rotation();
  const dir = quatRot(rot, scale(teilAchse(p), -1));
  const punkt = add(arr(b.rb.translation()), quatRot(rot, sub(zellMitte(p), b.ursprung)));
  b.rb.applyImpulseAtPoint(vec(scale(dir, newton * dt)), vec(punkt), true);
}

export function trenne(world, veh, g) {
  if (!g.aktiv) return;
  g.aktiv = false;
  berechneGruppen(veh);
  world.removeImpulseJoint(g.j, true);
  // kleiner Stoß auseinander, damit die Trennung sichtbar ist
  const A = veh.bodies[g.bodyA], B = veh.bodies[g.bodyB];
  const dir = quatRot(A.rb.rotation(), g.dir);
  const m = Math.min(A.rb.mass(), B.rb.mass());
  const stoss = scale(dir, m * 1.2);
  B.rb.applyImpulse(vec(stoss), true);
  A.rb.applyImpulse(vec(scale(stoss, -1)), true);
}

// Räder nach dem Schritt aktualisieren (vor world.step aufrufen: updateVehicle)
export function aktualisiereRaeder(veh, dt, filter) {
  for (const b of veh.bodies) {
    if (!b.vc) continue;
    b.vc.updateVehicle(dt, undefined, undefined, filter);
  }
}

// Daten für die Darstellung der Räder (lokal zum Körper)
export function radZustand(veh, dt) {
  const out = [];
  for (const b of veh.bodies) {
    if (!b.vc) continue;
    const rot = b.rb.rotation();
    const inv = { x: -rot.x, y: -rot.y, z: -rot.z, w: rot.w };
    for (const r of b.raeder) {
      const feder = (b.vc.wheelSuspensionLength(r.w) ?? FEDER_WEG) - RAD_TIEFE;
      if (r.bock) {
        // Einkaufswagenrad dreht sich in die Bewegungsrichtung
        const welt = add(arr(b.rb.translation()), quatRot(rot, r.mitte));
        const vw = punktGeschw(b.rb, welt);
        const vl = quatRot(inv, vw);
        const p = veh.plan.parts[r.teil];
        const vt = matVec(transpose(ORIENT[p.o]), vl); // in Teilkoordinaten
        const sp = Math.hypot(vt[0], vt[2]);
        if (sp > 0.15) {
          const ziel = Math.atan2(vt[0], vt[2]);
          let d = ziel - r.schwenk;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          r.schwenk += d * Math.min(1, dt * 10);
        }
        r.drehung += (sp / r.r) * dt * Math.sign(Math.cos(Math.atan2(vt[0], vt[2]) - r.schwenk) || 1);
        out.push({ teil: r.teil, feder: feder - FEDER_WEG, lenk: r.schwenk, dreh: r.drehung });
      } else {
        out.push({
          teil: r.teil,
          feder: feder - FEDER_WEG,
          lenk: b.vc.wheelSteering(r.w) || 0,
          dreh: (b.vc.wheelRotation(r.w) || 0) * r.achsVz
        });
      }
    }
  }
  return out;
}

function transpose(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

// Ein ganzer Physikschritt für das eigene Fahrzeug
export function schritt(world, veh, eingabe, dt) {
  steuere(world, veh, eingabe, dt);
  const filter = c => !veh.colliderSet.has(c.handle) && !c.isSensor() && !ignoriere.has(c.handle);
  aktualisiereRaeder(veh, dt, filter);
}
