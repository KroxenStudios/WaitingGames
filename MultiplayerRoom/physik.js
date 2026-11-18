
import {
  TEILE, ORIENT, ZELLE, RAD_TIEFE, analysiere, zellMitte, teilAchse, radRadius, matVec, sprengZiele,
  STANDARD_MOTOR_PS, munitionKapazitaet, teilMasse
} from "./bau.js";

export const PHYSIK_TAKT = 1 / 60;
export const ignoriere = new Set();

export const LUFT0 = 1.2;
export const dichte = h => LUFT0 * Math.exp(-Math.max(0, h) / 1500);
const glatt = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const gravFaktor = h => 1 - glatt(3000, 7000, h);

const MOTOR_LEISTUNG = 55000;
const MOTOR_KRAFT = 5200;
const HOECHST_TEMPO = 32;
const FEDER_WEG = 0.2;
const BREMSE = 60;

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
  const masse = teilMasse(part);
  let desc;

  switch (part.t) {
    case "block":
    case "panzer":
    case "glas":
    case "sitz":
    case "tank":
    case "munition":
    case "verschluss":
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

export function erzeugeFahrzeug(R, world, bauplan, opts = {}) {
  const basis = opts.basis || [0, 0, 0];
  const dreh = opts.drehung || { x: 0, y: 0, z: 0, w: 1 };
  const kin = !!opts.kinematisch;
  const ana = analysiere(bauplan);
  const parts = bauplan.parts;

  const sitz = ana.sitz >= 0 ? parts[ana.sitz] : null;
  const vorwaerts = sitz ? teilAchse(sitz, [0, 0, -1]) : [0, 0, -1];

  let gm = 0, gs = [0, 0, 0];
  for (const b of ana.bodies) { gm += b.masse; gs = add(gs, scale(b.ursprung, b.masse)); }
  const schwerpunkt = gm > 0 ? scale(gs, 1 / gm) : [0, 0, 0];

  const veh = {
    plan: bauplan, ana, kin, vorwaerts, bodies: [], gelenke: [],
    colliderSet: new Set(), motorAn: true, lenkung: 0,
    fx: new Map(), nebelAn: new Map(), raketen: new Map(), schirme: new Map(), ruder: new Map(), servoZiel: new Map(),
    tasteVorher: new Set(), angetrieben: new Set(),
    licht: new Map(), hebel: new Map(), gruppe: [], sprengung: new Map(),
    sprengPos: new Map(), R, world, colliderVon: new Map(), neuGetrennt: [], sprengReihe: [], abgeloest: new Set(),
    tank: { menge: new Map(), aktiv: false }, verbrauch: opts.verbrauch !== false,
    // kampf: nur im fight-modus verwundbar (schiessen geht auch im test-modus)
    kampf: !!opts.kampf, zerstoert: new Set(), nachladen: new Map(), geschossArt: new Map(), schussReihe: [], schussZaehler: 0
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
        const md = R.ColliderDesc.ball(0.1).setTranslation(...lokal).setMass(teilMasse(p))
          .setCollisionGroups(0).setSolverGroups(0);
        veh.colliderSet.add(world.createCollider(md, rb).handle);
        continue;
      }

      let cd;
      if (def.rad) {
        cd = R.ColliderDesc.cylinder(0.11, radRadius(p)).setTranslation(...lokal)
          .setRotation(matQuat(ORIENT[p.o])).setMass(teilMasse(p)).setFriction(1.0);
      } else {
        cd = colliderFuer(R, p, lokal);
      }
      const col = world.createCollider(cd, rb);
      veh.colliderSet.add(col.handle);
      veh.colliderVon.set(i, col);
    }

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
        if (dot(cross([0, 1, 0], achse), vorwaerts) < 0) achse = scale(achse, -1);

        vc.addWheel(vec(add(mitte, [0, FEDER_WEG - RAD_TIEFE, 0])), { x: 0, y: -1, z: 0 }, vec(achse), FEDER_WEG, r);
        const w = vc.numWheels() - 1;
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
          achsVz: dot(achse, teilAchse(p)) < 0 ? -1 : 1
        });
      }
    }
    veh.bodies.push(body);
  }

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
        // maximale haltekraft des stellmotors (kn)
        j.setMotorMaxForce((teil.k.haltekraft ?? 100) * 1000);
      }
      veh.gelenke.push(gel);
    }
  }

  let gesamtMasse = 0;
  for (const b of veh.bodies) gesamtMasse += b.rb.mass();
  veh.motorFaktor = Math.max(1, Math.min(3, Math.sqrt(gesamtMasse / 450)));

  for (let i = 0; i < parts.length; i++) {
    if (parts[i].t === "tank") veh.tank.menge.set(i, parts[i].k.kapazitaet ?? 60);
  }
  veh.tank.aktiv = veh.tank.menge.size > 0;
  // munitionslager starten voll (patronen nach kaliber)
  veh.munition = new Map();
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].t === "munition") veh.munition.set(i, munitionKapazitaet(parts[i].k.kaliber));
  }
  berechneGruppen(veh);

  aktualisiereAntrieb(veh);
  return veh;
}

// verhältnis der gesamten motorleistung zur standardleistung (1 = wie bisher).
// ohne motor-baustein gilt der standard, damit alte fahrzeuge weiterfahren.
// zerstörte oder abgetrennte motoren liefern nichts, sind alle kaputt, ist das ergebnis 0.
export function motorFaktor(veh) {
  let hat = false, summe = 0;
  veh.plan.parts.forEach((p, i) => {
    if (p.t !== "motor") return;
    hat = true;
    const bi = veh.ana.bodyOf[i];
    if (veh.zerstoert.has(i) || (veh.angetrieben.size && !veh.angetrieben.has(bi))) return;
    summe += p.k?.ps ?? STANDARD_MOTOR_PS;
  });
  return (hat ? summe : STANDARD_MOTOR_PS) / STANDARD_MOTOR_PS;
}

// gesamtleistung der arbeitenden motoren in ps (für die anzeige)
export function motorPS(veh) {
  return Math.round(motorFaktor(veh) * STANDARD_MOTOR_PS);
}

// masse des fahrzeugs in kg: alles, was noch am sitzkörper hängt (abgesprengte teile zählen nicht mehr)
export function fahrzeugMasse(veh) {
  let m = 0;
  for (const b of veh.bodies) if (!veh.angetrieben.size || veh.angetrieben.has(b.index)) m += b.rb.mass();
  return m;
}

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

export function punktGeschw(rb, p) {
  const v = rb.linvel(), w = rb.angvel(), c = rb.translation();
  const r = [p[0] - c.x, p[1] - c.y, p[2] - c.z];
  return add(arr(v), cross(arr(w), r));
}

export function sitzKoerper(veh) {
  return veh.ana.sitzBody >= 0 ? veh.bodies[veh.ana.sitzBody] : veh.bodies[0];
}

export function tempo(veh) {
  const b = sitzKoerper(veh);
  if (!b) return 0;
  const f = quatRot(b.rb.rotation(), veh.vorwaerts);
  return dot(arr(b.rb.linvel()), f);
}

export function steuere(world, veh, eingabe, dt) {
  const parts = veh.plan.parts;
  const tasten = eingabe.tasten || new Set();
  const neu = new Set([...tasten].filter(t => !veh.tasteVorher.has(t)));
  veh.tasteVorher = new Set(tasten);
  veh.fx.clear();

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
  // motor-bausteine: summe der leistung, mehr leistung braucht mehr treibstoff
  const ml = motorFaktor(veh);
  let gas = veh.motorAn && ml > 0 ? eingabe.gas : 0;
  if (gas !== 0) gas *= entnimm(veh, Math.max(0, veh.ana.sitzBody), 0.15 * ml * Math.abs(gas) * dt);

  const mf = veh.motorFaktor || 1;
  const hoechst = HOECHST_TEMPO * Math.min(1.5, 0.5 + 0.5 * ml);
  let kraft = 0, bremsen = eingabe.bremse ? BREMSE * mf : 0;
  if (gas > 0) {
    if (v < -0.8) bremsen = Math.max(bremsen, BREMSE * mf * gas);
    else if (v < hoechst) kraft = Math.min(MOTOR_KRAFT * mf * ml, (MOTOR_LEISTUNG * mf * ml) / Math.max(Math.abs(v), 1)) * gas;
  } else if (gas < 0) {
    if (v > 0.8) bremsen = Math.max(bremsen, BREMSE * mf * -gas);
    else if (v > -9) kraft = MOTOR_KRAFT * mf * ml * 0.45 * gas;
  } else if (!eingabe.bremse) {
    bremsen = 1.2 * mf;
  }

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
      b.vc.setWheelSteering(r.w, verbunden ? -veh.lenkung * r.lenkFaktor * lenkTempo : 0);
    }
  }

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
            const luft = dichte(punkt[1]) / LUFT0;
            const n = (k.schub ?? 4) * 1000 * h * f * luft;
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
      case "verschluss": {
        if (veh.zerstoert.has(i)) break;
        const rest = Math.max(0, (veh.nachladen.get(i) ?? 0) - dt);
        veh.nachladen.set(i, rest);
        // geschossart durchschalten: he, ap, heat
        if (k.wechsel && neu.has(k.wechsel)) veh.geschossArt.set(i, (artVon(veh, i) + 1) % ARTEN.length);
        if (rest <= 0 && tasten.has(k.taste)) {
          // schwerere geschosse brauchen länger zum nachladen, ein lager direkt am verschluss halbiert die zeit
          const faktor = schiesse(veh, i);
          if (faktor) veh.nachladen.set(i, (0.4 + ((k.durchmesser ?? 75) / 155) * 1.6) * faktor);
        }
        break;
      }
      case "schnellfeuer": {
        if (veh.zerstoert.has(i)) break;
        const rest = Math.max(0, (veh.nachladen.get(i) ?? 0) - dt);
        veh.nachladen.set(i, rest);
        if (rest <= 0 && tasten.has(k.taste) && schnellSchuss(veh, i)) veh.nachladen.set(i, SCHNELL_TAKT);
        break;
      }
      case "explosive": {
        let st = veh.sprengung.get(i);
        if (!st && neu.has(k.taste)) {
          st = { zeit: 0 };
          veh.sprengung.set(i, st);
          sprenge(veh, i);
          if (veh.kampf) schadenAn(veh, veh.sprengPos.get(i), k.reichweite ?? 3, -1);
        } else if (st) {
          st.zeit += dt;
        }
        if (st && st.zeit < BLITZ_DAUER) veh.fx.set(i, 1 - st.zeit / BLITZ_DAUER);
        break;
      }
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
        const analog = eingabe.achsen?.[k.kanal] ?? 0;
        const richtung = Math.max(-1, Math.min(1, (tasten.has(k.plus) ? 1 : 0) - (tasten.has(k.minus) ? 1 : 0) + analog)) * (k.gegenlauf ? -1 : 1);
        let d = veh.ruder.get(i) ?? 0;
        const schritt = 3 * dt;
        d += Math.max(-schritt, Math.min(schritt, richtung * max - d));
        veh.ruder.set(i, d);
        aero(veh, i, k.flaeche ?? 1.5, d, dt);
        veh.fx.set(i, 0.5 + (0.5 * d) / max);
        break;
      }
      case "fallschirm": {
        const st = veh.schirme.get(i) || { an: false, offen: 0 };
        if (neu.has(k.taste)) st.an = !st.an;
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
    // beim drehen gilt die drehkraft, im stand die haltekraft (kn)
    g.j.setMotorMaxForce((richtung !== 0 ? (k.drehkraft ?? 100) : (k.haltekraft ?? 100)) * 1000);
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
  const grenze = b.rb.mass() * tempo * 0.4;
  const betrag = Math.hypot(...impuls);
  if (betrag > grenze) impuls = scale(impuls, grenze / betrag);
  b.rb.applyImpulseAtPoint(vec(impuls), vec(punkt), true);
}

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
  const A = veh.bodies[g.bodyA], B = veh.bodies[g.bodyB];
  const dir = quatRot(A.rb.rotation(), g.dir);
  const m = Math.min(A.rb.mass(), B.rb.mass());
  const stoss = scale(dir, m * 1.2);
  B.rb.applyImpulse(vec(stoss), true);
  A.rb.applyImpulse(vec(scale(stoss, -1)), true);
}

const BLITZ_DAUER = 10;
const STOSS_DAUER = 0.02;

// löst ein einzelnes teil aus seinem starren körper und gibt ihm einen eigenen körper
// (mit der geschwindigkeit, die es gerade hatte). gibt den index des körpers zurück.
function loeseTeil(veh, n) {
  const { R, world } = veh;
  const part = veh.plan.parts[n];
  if (TEILE[part.t].rad) return loeseRad(veh, n);
  const bi = veh.ana.bodyOf[n];
  const alt = veh.bodies[bi];
  const col = veh.colliderVon.get(n);
  if (!alt || !col || veh.abgeloest.has(n) || alt.parts.length < 2) return bi;

  const rot = alt.rb.rotation();
  const mitte = zellMitte(part);
  const pos = add(arr(alt.rb.translation()), quatRot(rot, sub(mitte, alt.ursprung)));
  const v = punktGeschw(alt.rb, pos), w = alt.rb.angvel();

  veh.colliderSet.delete(col.handle);
  world.removeCollider(col, true);

  const desc = veh.kin ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic();
  desc.setTranslation(...pos).setRotation(rot).setCanSleep(false);
  if (!veh.kin) desc.setLinearDamping(0.05).setAngularDamping(0.3).setCcdEnabled(true);
  const rb = world.createRigidBody(desc);
  const neu = world.createCollider(colliderFuer(R, part, [0, 0, 0]), rb);
  veh.colliderSet.add(neu.handle);
  veh.colliderVon.set(n, neu);
  if (!veh.kin) {
    rb.setLinvel(vec(v), true);
    rb.setAngvel(w, true);
  }

  const body = { rb, index: veh.bodies.length, ursprung: mitte, parts: [n], vc: null, raeder: [], loseRaeder: false };
  veh.bodies.push(body);
  alt.parts.splice(alt.parts.indexOf(n), 1);
  veh.ana.bodyOf[n] = body.index;
  veh.ana.bodies.push({ parts: [n], masse: teilMasse(part), ursprung: mitte });
  veh.abgeloest.add(n);
  veh.neuGetrennt.push({ teil: n, index: body.index, von: bi });
  return body.index;
}

// ein rad am fahrwerk eines körpers abreissen: das rad bekommt einen eigenen rollenden körper, die feder am
// fahrzeug wird stillgelegt (kein antrieb, keine kraft, keine bremse)
function loeseRad(veh, n) {
  const { R, world } = veh;
  const part = veh.plan.parts[n];
  const bi = veh.ana.bodyOf[n];
  const alt = veh.bodies[bi];
  if (!alt || veh.abgeloest.has(n) || alt.parts.length < 2) return bi;
  const rot = alt.rb.rotation();
  const mitte = zellMitte(part);
  const pos = add(arr(alt.rb.translation()), quatRot(rot, sub(mitte, alt.ursprung)));
  const v = punktGeschw(alt.rb, pos), w = alt.rb.angvel();

  const rec = alt.raeder.find(r => r.teil === n);
  if (rec && alt.vc) {
    alt.vc.setWheelEngineForce(rec.w, 0);
    alt.vc.setWheelBrake(rec.w, 0);
    alt.vc.setWheelSuspensionStiffness(rec.w, 0);
    alt.vc.setWheelMaxSuspensionForce(rec.w, 0);
    alt.vc.setWheelFrictionSlip(rec.w, 0);
    alt.vc.setWheelSideFrictionStiffness(rec.w, 0);
  }
  if (rec) alt.raeder.splice(alt.raeder.indexOf(rec), 1);

  const desc = veh.kin ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic();
  desc.setTranslation(...pos).setRotation(rot).setCanSleep(false);
  if (!veh.kin) desc.setLinearDamping(0.05).setAngularDamping(0.3).setCcdEnabled(true);
  const rb = world.createRigidBody(desc);
  const neu = world.createCollider(
    R.ColliderDesc.cylinder(0.11, radRadius(part)).setRotation(matQuat(ORIENT[part.o])).setMass(teilMasse(part)).setFriction(1.0), rb);
  veh.colliderSet.add(neu.handle);
  veh.colliderVon.set(n, neu);
  if (!veh.kin) {
    rb.setLinvel(vec(v), true);
    rb.setAngvel(w, true);
  }
  const body = { rb, index: veh.bodies.length, ursprung: mitte, parts: [n], vc: null, raeder: [], loseRaeder: true };
  veh.bodies.push(body);
  alt.parts.splice(alt.parts.indexOf(n), 1);
  veh.ana.bodyOf[n] = body.index;
  veh.ana.bodies.push({ parts: [n], masse: teilMasse(part), ursprung: mitte });
  veh.abgeloest.add(n);
  veh.neuGetrennt.push({ teil: n, index: body.index, von: bi });
  return body.index;
}

// panzerblöcke halten nicht ewig: jeder treffer und jede grosse explosion nutzt sie ab
const PANZER_HP = 120;
// wandstärke eines panzerblocks relativ zu 100 mm (haltbarkeit und was eine hohlladung zum durchschlagen braucht)
export const wandFaktor = p => Math.max(20, Math.min(300, p?.k?.staerke ?? 100)) / 100;
function panzerAbnutzung(veh, n, schaden) {
  veh.panzerSchaden ||= new Map();
  const summe = (veh.panzerSchaden.get(n) ?? 0) + schaden;
  veh.panzerSchaden.set(n, summe);
  return summe >= PANZER_HP * wandFaktor(veh.plan.parts[n]);
}

// zündet eine ladung: löst alle teile im bereich ab und schleudert sie nach aussen.
// der körper bleibt bis zur zündung starr, es ändert sich nichts durchs platzieren.
// bei fremden (kinematischen) fahrzeugen wird nur aufgeteilt, ohne stösse.
// weltposition der mitte von teil n, abhängig vom körper, an dem es gerade sitzt
function teilWeltPos(veh, n) {
  const b = veh.bodies[veh.ana.bodyOf[n]];
  return add(arr(b.rb.translation()), quatRot(b.rb.rotation(), sub(zellMitte(veh.plan.parts[n]), b.ursprung)));
}

// vorgabe: fertige liste der abzulösenden teile (vom zündenden spieler), damit alle dieselbe trennung sehen
// opts: reichweite/kraft überschreiben die werte der ladung (explodierende tanks, geplatzte geschosse)
export function sprenge(veh, i, vorgabe = null, opts = null) {
  const parts = veh.plan.parts;
  const p = parts[i];
  const k = p.k || {};
  if (!veh.bodies[veh.ana.bodyOf[i]]) return;
  // ursprung ist die weltposition genau dieses blocks, nicht die des fahrzeugs
  const ursprung = teilWeltPos(veh, i);
  // ort der zündung merken: licht, glühen und rauch bleiben dort stehen
  veh.sprengPos.set(i, ursprung);
  const reichweite = opts?.reichweite ?? k.reichweite ?? 3;
  const impuls = (opts?.kraft ?? k.kraft ?? 25) * 1000 * STOSS_DAUER;

  const ziele = vorgabe || sprengZiele(veh.plan, veh.ana, i, n => teilWeltPos(veh, n), reichweite);
  // panzerblöcke in reichweite nutzen sich ab und brechen bei grossen explosionen weg (andere spieler sehen es über die zielliste)
  if (!vorgabe && !veh.kin) {
    parts.forEach((q, n) => {
      if (!TEILE[q.t].sprengfest || veh.abgeloest.has(n) || !veh.bodies[veh.ana.bodyOf[n]]) return;
      const c = teilWeltPos(veh, n);
      const d = Math.hypot(c[0] - ursprung[0], c[1] - ursprung[1], c[2] - ursprung[2]);
      if (d > reichweite) return;
      if (panzerAbnutzung(veh, n, (opts?.kraft ?? k.kraft ?? 25) * (1 - d / Math.max(reichweite, 0.01)))) ziele.push(n);
    });
  }
  // aufzeichnung für andere spieler: ladung, anzahl, teile
  if (!vorgabe) veh.sprengReihe.push(i, ziele.length, ...ziele);
  for (const n of ziele) loeseTeil(veh, n);
  berechneGruppen(veh);
  aktualisiereAntrieb(veh);
  if (veh.kin) return;

  // jedes teil im bereich bekommt einen stoss weg von der ladung, nach aussen schwächer
  for (let n = 0; n < parts.length; n++) {
    const q = parts[n];
    const b = veh.bodies[veh.ana.bodyOf[n]];
    if (!b || n === i) continue;
    // ein körper mit panzerblock bleibt ruhig liegen: er ist zu schwer und fest verbunden
    if (b.parts.some(j => TEILE[parts[j].t].sprengfest)) continue;
    const rot = b.rb.rotation();
    const punkt = add(arr(b.rb.translation()), quatRot(rot, sub(zellMitte(q), b.ursprung)));
    const d = sub(punkt, ursprung);
    const abstand = Math.hypot(...d);
    if (abstand > reichweite) continue;
    const richtung = abstand > 0.05 ? scale(d, 1 / abstand) : [0, 1, 0];
    const faktor = 1 - 0.7 * (abstand / Math.max(reichweite, 0.01));
    b.rb.applyImpulseAtPoint(vec(scale(richtung, impuls * faktor)), vec(punkt), true);
    // etwas drall, damit die trümmer trudeln
    if (b.parts.length === 1) {
      const dreh = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
      b.rb.applyTorqueImpulse(vec(scale(dreh, impuls * faktor * 0.04)), true);
    }
  }
}

// ---- kampf (fight-modus) ----
// geschosse gibt es nur als punkte mit flugbahn: jeder client simuliert alle, aber nur das opfer
// wertet den treffer auf sein eigenes fahrzeug aus (opfer entscheidet).
// TREFFER_AUTORITAET: "opfer" (jetzt) oder später "server", dann melden clients nur noch schüsse
export const TREFFER_AUTORITAET = "opfer";
export const geschosse = [];
// einschläge zum abholen für effekte: { p, kal, treffer }
export const einschlaege = [];

// mündungsgeschwindigkeit in m/s (wie eine panzerkanone, kein paintball); der strahl pro schritt (~13 m) fängt auch dünne ziele ab
const GESCHOSS_TEMPO = 800;
const GESCHOSS_LEBEN = 4;
// masse einer 155-mm-granate in kg, und der anteil des impulses, der als rückstoss beim fahrzeug ankommt
const GESCHOSS_MASSE_155 = 43;
const RUECKSTOSS_ANTEIL = 0.06;
// geschossarten: he (sprengwirkung im umkreis), ap (wuchtgeschoss: wenig umkreis, viel schaden am getroffenen teil und
// grosser stoss), heat (hohlladung: durchschlägt blöcke, dafür weniger schaden als ap). durch = durchschlagskraft in lagen.
// art 3: geschoss der schnellfeuerkanone (schnell, wenig wirkung)
export const ARTEN = ["he", "ap", "heat"];
export const ART_KURZ = ["HE", "AP", "HEAT", "MK"];
const ART_WERTE = [
  { tempo: 1, direkt: 1, radius: 1, impuls: 1 },
  { tempo: 1.2, direkt: 2.2, radius: 0.45, impuls: 1.7 },
  { tempo: 0.85, direkt: 1.3, radius: 0.5, impuls: 0.5 },
  { tempo: 1.2, direkt: 0.35, radius: 0.3, impuls: 0.25 }
];
// aktuell gewählte art des verschlusses n (taste oder voreinstellung)
export function artVon(veh, n) {
  return veh.geschossArt.get(n) ?? Math.max(0, ARTEN.indexOf(veh.plan.parts[n].k.geschoss));
}
const KAMPF_TEILE = new Set(["motor", "geschuetz", "verschluss", "tank", "munition", "schnellfeuer"]);
// nachladezeit-faktor, wenn die munition aus einem lager direkt am verschluss kommt
const NAHLAGER_FAKTOR = 0.5;

// direkt angrenzende zelle (flächen berühren sich)?
function angrenzend(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
}

// lager für den schuss: gleicher festverbundener körperverbund, kaliber = geschossdurchmesser, noch patronen übrig.
// ein direkt am verschluss sitzendes lager wird bevorzugt. gibt den teil-index zurück oder -1.
function munitionQuelle(veh, iv, dm, art = 0) {
  const parts = veh.plan.parts;
  const gid = veh.gruppe[veh.ana.bodyOf[iv]];
  let beste = -1;
  for (const [n, rest] of veh.munition) {
    if (rest <= 0 || veh.zerstoert.has(n) || veh.gruppe[veh.ana.bodyOf[n]] !== gid) continue;
    if (Math.round(parts[n].k.kaliber ?? 75) !== Math.round(dm)) continue;
    if (Math.max(0, ARTEN.indexOf(parts[n].k.geschoss)) !== art) continue;
    if (angrenzend(parts[n], parts[iv])) return n;
    if (beste < 0) beste = n;
  }
  return beste;
}

// übrige patronen je kaliber (nur lager, die noch ganz sind), für die anzeige
export function munitionStand(veh) {
  const out = new Map();
  for (const [n, rest] of veh.munition) {
    if (veh.zerstoert.has(n)) continue;
    const k = veh.plan.parts[n].k;
    const name = `${Math.round(k.kaliber ?? 75)} mm ${ART_KURZ[Math.max(0, ARTEN.indexOf(k.geschoss))]}`;
    out.set(name, (out.get(name) || 0) + rest);
  }
  return out;
}
// unter diesem füllstand (0..1) explodiert ein getroffener tank nicht mehr
const TANK_MIN = 0.1;

// geschütze, die an diesem verschluss sitzen: das rohr zeigt mit seiner oberseite vom verschluss weg
function rohreAn(veh, iv) {
  const v = veh.plan.parts[iv];
  const out = [];
  veh.plan.parts.forEach((p, n) => {
    if (p.t !== "geschuetz") return;
    const d = teilAchse(p).map(Math.round);
    if (p.x - d[0] === v.x && p.y - d[1] === v.y && p.z - d[2] === v.z) out.push(n);
  });
  return out;
}

// reichweite der sprengung für andere spieler, die nur teil und ort kennen
export function sprengReichweite(p) {
  if (p.t === "tank") return 2.5;
  if (p.t === "munition") return 3.5;
  return p.k?.reichweite ?? 3;
}

function fuellstand(veh, n) {
  const kap = Math.max(1, veh.plan.parts[n].k?.kapazitaet ?? 60);
  return Math.min(1, (veh.tank.menge.get(n) ?? 0) / kap);
}

// macht ein teil kaputt. ein gefüllter tank explodiert dabei, ein leerer nicht.
function zerstoere(veh, n) {
  if (veh.zerstoert.has(n) || !KAMPF_TEILE.has(veh.plan.parts[n].t)) return;
  veh.zerstoert.add(n);
  const typ = veh.plan.parts[n].t;
  if (typ !== "tank" && typ !== "munition") return;
  // munitionslager: die restlichen patronen gehen hoch, stärker als ein tank (sprengstoff statt treibstoff)
  let fuell, reichweite, kraft;
  if (typ === "tank") {
    fuell = fuellstand(veh, n);
    veh.tank.menge.set(n, 0);
    reichweite = 1 + 3 * fuell;
    kraft = 10 + 40 * fuell;
  } else {
    const kap = munitionKapazitaet(veh.plan.parts[n].k.kaliber);
    fuell = Math.min(1, (veh.munition.get(n) ?? 0) / kap);
    veh.munition.set(n, 0);
    reichweite = 1 + 3.5 * fuell;
    kraft = 15 + 60 * fuell;
  }
  if (fuell < TANK_MIN) return;
  veh.sprengung.set(n, { zeit: 0 });
  sprenge(veh, n, null, { reichweite, kraft });
  schadenAn(veh, veh.sprengPos.get(n), reichweite, n, kraft);
}

// zerstört alle kampfteile um einen punkt (und das getroffene teil selbst)
// kraft: explosionskraft in kN (nutzt panzerblöcke im radius ab), direkt: schaden am direkt getroffenen teil
export function schadenAn(veh, punkt, radius, treffer, kraft = 0, direkt = 0) {
  if (!veh.kampf) return;
  veh.plan.parts.forEach((p, n) => {
    if (veh.zerstoert.has(n) || !KAMPF_TEILE.has(p.t) || !veh.bodies[veh.ana.bodyOf[n]]) return;
    const c = teilWeltPos(veh, n);
    if (n === treffer || Math.hypot(c[0] - punkt[0], c[1] - punkt[1], c[2] - punkt[2]) <= radius) zerstoere(veh, n);
  });
  if (!veh.kin && (kraft || direkt)) {
    const bruch = [];
    veh.plan.parts.forEach((p, n) => {
      if (!TEILE[p.t].sprengfest || veh.abgeloest.has(n) || !veh.bodies[veh.ana.bodyOf[n]]) return;
      const c = teilWeltPos(veh, n);
      const d = Math.hypot(c[0] - punkt[0], c[1] - punkt[1], c[2] - punkt[2]);
      const schaden = (n === treffer ? direkt : 0) + (kraft && d <= radius ? kraft * (1 - d / Math.max(radius, 0.01)) : 0);
      if (schaden > 0 && panzerAbnutzung(veh, n, schaden)) bruch.push(n);
    });
    for (const n of bruch) {
      loeseTeil(veh, n);
      veh.sprengReihe.push(n, 1, n);
    }
    if (bruch.length) berechneGruppen(veh);
  }
  aktualisiereAntrieb(veh);
}

// wirkung eines geschosstreffers auf das eigene fahrzeug (opfer entscheidet):
// kampfteile im umkreis gehen kaputt, normale teile im umkreis fliegen weg (ausser panzerblöcke),
// das getroffene fahrzeug bekommt einen stoss in flugrichtung. je grösser das kaliber, desto grösser der radius.
export function trefferWirkung(veh, punkt, dir, kal, teil, art = 0) {
  if (!veh.kampf) return;
  const k = Math.max(0.15, kal / 155);
  const A = ART_WERTE[art] || ART_WERTE[0];
  const radius = (0.3 + 1.7 * k) * A.radius;
  // ein volltreffer nutzt den getroffenen panzerblock stark ab (155 mm: fast ein ganzer block)
  schadenAn(veh, punkt, radius, teil, 0, 100 * k * k * A.direkt);
  if (veh.kin) return;
  const parts = veh.plan.parts;
  const gebunden = new Set();
  for (const g of veh.ana.gelenke) { gebunden.add(g.teil); gebunden.add(g.other); }
  const ziele = [];
  parts.forEach((p, n) => {
    const def = TEILE[p.t];
    if (veh.abgeloest.has(n) || def.sprengfest || def.gelenk || p.t === "sitz" || gebunden.has(n)) return;
    if (!veh.bodies[veh.ana.bodyOf[n]]) return;
    const c = teilWeltPos(veh, n);
    if (Math.hypot(c[0] - punkt[0], c[1] - punkt[1], c[2] - punkt[2]) > radius * 0.7 && n !== teil) return;
    // teile direkt an einem panzerblock bleiben (wie bei sprengladungen)
    const cell = parts[n];
    const map = zellenKarte(veh);
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const j = map.get(`${cell.x + d[0]},${cell.y + d[1]},${cell.z + d[2]}`);
      if (j !== undefined && TEILE[parts[j].t].sprengfest) return;
    }
    ziele.push(n);
  });
  for (const n of ziele) loeseTeil(veh, n);
  if (ziele.length) {
    // andere spieler lösen dieselben teile ab (gleiches format wie bei sprengungen: ladung, anzahl, teile)
    if (teil >= 0) veh.sprengReihe.push(teil, ziele.length, ...ziele);
    berechneGruppen(veh);
    aktualisiereAntrieb(veh);
  }
  // abgelöste teile fliegen in schussrichtung davon, der rest des fahrzeugs bekommt einen stoss
  const impuls = GESCHOSS_MASSE_155 * Math.pow(k, 3) * GESCHOSS_TEMPO * 0.08 * A.impuls;
  for (const n of ziele) {
    const b = veh.bodies[veh.ana.bodyOf[n]];
    b.rb.applyImpulse(vec(scale(dir, Math.min(impuls * 0.5, b.rb.mass() * 12))), true);
    b.rb.applyTorqueImpulse(vec([(Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2].map(x => x * b.rb.mass() * 0.6)), true);
  }
  if (teil >= 0) {
    const b = veh.bodies[veh.ana.bodyOf[teil]];
    if (b) b.rb.applyImpulseAtPoint(vec(scale(dir, Math.min(impuls, b.rb.mass() * 8))), vec(punkt), true);
  }
}

// zellen-karte des plans (zelle -> teil-index), einmal je fahrzeug
function zellenKarte(veh) {
  if (!veh.zellenMap) {
    veh.zellenMap = new Map();
    veh.plan.parts.forEach((p, i) => veh.zellenMap.set(`${p.x},${p.y},${p.z}`, i));
  }
  return veh.zellenMap;
}

// eine fremde sprengung kann auch das eigene fahrzeug treffen
export function explosionSchaden(veh, punkt, reichweite) {
  schadenAn(veh, punkt, reichweite, -1, 8 * reichweite);
}

// mündungsfeuer zum abholen für effekte (gilt für eigene und fremde schüsse): { p, dir, kal, von }
export const muendungen = [];

// weltposition der mündung und richtung des rohrs n (oder null, wenn es das nicht mehr gibt)
export function muendungPos(veh, n) {
  const b = veh.bodies[veh.ana.bodyOf[n]];
  if (!b) return null;
  const dir = quatRot(b.rb.rotation(), teilAchse(veh.plan.parts[n]));
  return { pos: add(teilWeltPos(veh, n), scale(dir, ZELLE * 0.6)), dir };
}

// neues geschoss. von: das fahrzeug des schützen (kein selbsttreffer in den ersten momenten)
export function feuere(von, p, v, kal, art = 0) {
  // durch: wie viele lagen das geschoss durchschlägt (nur heat)
  geschosse.push({ p: [...p], v: [...v], kal, art, durch: art === 2 ? 2 + Math.floor(kal / 40) : 0, t: 0, von });
  const l = Math.hypot(...v) || 1;
  muendungen.push({ p: [...p], dir: [v[0] / l, v[1] / l, v[2] / l], kal, von });
}

function schiesse(veh, iv) {
  const parts = veh.plan.parts;
  const dm = parts[iv].k.durchmesser ?? 75;
  const rohre = rohreAn(veh, iv);
  if (!rohre.length) return 0;
  // falsches kaliber (oder keine patronen mehr): der verschluss schiesst nicht
  const art = artVon(veh, iv);
  const lager = munitionQuelle(veh, iv, dm, art);
  if (lager < 0) return 0;
  veh.munition.set(lager, veh.munition.get(lager) - 1);
  const faktor = angrenzend(parts[lager], parts[iv]) ? NAHLAGER_FAKTOR : 1;
  const lebend = rohre.filter(n => !veh.zerstoert.has(n));
  const rohr = lebend.length ? lebend[0] : rohre[0];
  const kal = parts[rohr].k.kaliber ?? 75;

  // zu dickes geschoss: es geht schon im rohr los und nimmt rohr und verschluss mit
  if (dm > kal) {
    veh.zerstoert.add(iv);
    veh.zerstoert.add(rohr);
    veh.sprengung.set(iv, { zeit: 0 });
    sprenge(veh, iv, null, { reichweite: 1 + (dm / 155) * 1.5, kraft: 8 + (dm / 155) * 25 });
    schadenAn(veh, veh.sprengPos.get(iv), 1 + (dm / 155) * 1.5, -1);
    return faktor;
  }

  // dünner als das rohr: langsamer und ungenauer. kaputtes rohr: noch langsamer und streuender.
  const r = dm / kal;
  let tempo = GESCHOSS_TEMPO * (0.4 + 0.6 * r) * ART_WERTE[art].tempo;
  let streu = 0.004 + 0.08 * (1 - r);
  if (!lebend.length) { tempo *= 0.5; streu += 0.06; }

  const b = veh.bodies[veh.ana.bodyOf[rohr]];
  const dir = quatRot(b.rb.rotation(), teilAchse(parts[rohr]));
  const mund = add(teilWeltPos(veh, rohr), scale(dir, ZELLE * 0.6));
  const zufall = () => (Math.random() * 2 - 1) * streu;
  const roh = [dir[0] + zufall(), dir[1] + zufall(), dir[2] + zufall()];
  const len = Math.hypot(...roh) || 1;
  const vel = add(scale(roh, tempo / len), punktGeschw(b.rb, mund));

  feuere(veh, mund, vel, dm, art);
  veh.schussZaehler++;
  // rückstoss: impuls ~ geschossmasse * mündungsgeschwindigkeit, ein grossteil wird von der rohrbremse geschluckt;
  // er greift am rohr an, das fahrzeug kippt und rutscht deshalb spürbar
  const gm = GESCHOSS_MASSE_155 * Math.pow(dm / 155, 3);
  const rueck = Math.min(gm * tempo * RUECKSTOSS_ANTEIL, b.rb.mass() * 6);
  b.rb.applyImpulseAtPoint(vec(scale(dir, -rueck)), vec(teilWeltPos(veh, rohr)), true);
  // aufzeichnung für andere spieler: mündung, geschwindigkeit, durchmesser
  veh.schussReihe.push(mund[0], mund[1], mund[2], vel[0], vel[1], vel[2], dm + 1000 * art);
  // nur die letzten 8 schüsse behalten (der server relayt höchstens so viele)
  if (veh.schussReihe.length > 56) veh.schussReihe.splice(0, veh.schussReihe.length - 56);
  return faktor;
}

// schnellfeuerkanone: etwa neun schuss pro sekunde aus einem lager mit gleichem kaliber (jede art) am selben festen teil
const SCHNELL_TAKT = 0.11;
const SCHNELL_TEMPO = 950;
function schnellSchuss(veh, n) {
  const parts = veh.plan.parts;
  const kal = Math.max(25, Math.min(40, parts[n].k.kaliber ?? 30));
  const gid = veh.gruppe[veh.ana.bodyOf[n]];
  let lager = -1;
  for (const [m, rest] of veh.munition) {
    if (rest <= 0 || veh.zerstoert.has(m) || veh.gruppe[veh.ana.bodyOf[m]] !== gid) continue;
    if (Math.round(parts[m].k.kaliber ?? 75) !== Math.round(kal)) continue;
    lager = m;
    break;
  }
  if (lager < 0) return false;
  veh.munition.set(lager, veh.munition.get(lager) - 1);
  const b = veh.bodies[veh.ana.bodyOf[n]];
  if (!b) return false;
  const dir = quatRot(b.rb.rotation(), teilAchse(parts[n]));
  const mund = add(teilWeltPos(veh, n), scale(dir, ZELLE * 0.6));
  const streu = 0.012;
  const roh = dir.map(v => v + (Math.random() * 2 - 1) * streu);
  const len = Math.hypot(...roh) || 1;
  const vel = add(scale(roh, SCHNELL_TEMPO / len), punktGeschw(b.rb, mund));
  feuere(veh, mund, vel, kal, 3);
  veh.schussZaehler++;
  const gm = GESCHOSS_MASSE_155 * Math.pow(kal / 155, 3);
  b.rb.applyImpulseAtPoint(vec(scale(dir, -Math.min(gm * SCHNELL_TEMPO * RUECKSTOSS_ANTEIL, b.rb.mass() * 2))), vec(teilWeltPos(veh, n)), true);
  veh.schussReihe.push(mund[0], mund[1], mund[2], vel[0], vel[1], vel[2], kal + 3000);
  if (veh.schussReihe.length > 56) veh.schussReihe.splice(0, veh.schussReihe.length - 56);
  return true;
}

// wo landet der nächste schuss? simuliert die flugbahn (ohne streuung) des ersten schussbereiten verschlusses
// oder der ersten schnellfeuerkanone. gibt { punkte, ende, treffer } zurück oder null.
export function vorhersage(world, veh, maxZeit = 4) {
  const parts = veh.plan.parts;
  let start = null, tempo = 0;
  for (let i = 0; i < parts.length && !start; i++) {
    if (veh.zerstoert.has(i)) continue;
    if (parts[i].t === "verschluss") {
      const rohre = rohreAn(veh, i);
      if (!rohre.length) continue;
      const lebend = rohre.filter(n => !veh.zerstoert.has(n));
      const rohr = lebend[0] ?? rohre[0];
      const mp = muendungPos(veh, rohr);
      if (!mp) continue;
      const dm = parts[i].k.durchmesser ?? 75, kal = parts[rohr].k.kaliber ?? 75;
      tempo = GESCHOSS_TEMPO * (0.4 + 0.6 * Math.min(1, dm / kal)) * ART_WERTE[artVon(veh, i)].tempo * (lebend.length ? 1 : 0.5);
      start = mp;
    } else if (parts[i].t === "schnellfeuer") {
      const b = veh.bodies[veh.ana.bodyOf[i]];
      if (!b) continue;
      const dir = quatRot(b.rb.rotation(), teilAchse(parts[i]));
      start = { pos: add(teilWeltPos(veh, i), scale(dir, ZELLE * 0.6)), dir };
      tempo = SCHNELL_TEMPO;
    }
  }
  if (!start || !veh.R) return null;
  let p = [...start.pos], v = scale(start.dir, tempo);
  const punkte = [[...p]];
  const dt = 1 / 30;
  for (let t = 0; t < maxZeit; t += dt) {
    v = [v[0], v[1] - 9.81 * dt, v[2]];
    const weg = scale(v, dt), len = Math.hypot(...weg);
    const d = scale(weg, 1 / len);
    const hit = world.castRay(new veh.R.Ray(vec(p), vec(d)), len, true, undefined, undefined, undefined, undefined, col => !veh.colliderSet.has(col.handle));
    if (hit) {
      const ende = add(p, scale(d, hit.timeOfImpact ?? hit.toi ?? 0));
      punkte.push(ende);
      return { punkte, ende, treffer: true, zeit: t };
    }
    p = add(p, weg);
    punkte.push([...p]);
  }
  return { punkte, ende: p, treffer: false, zeit: maxZeit };
}

// bewegt alle geschosse. eigenes: das fahrzeug dieses clients (opfer). boden(x,z): optionale geländehöhe.
// eigenes: ein fahrzeug oder eine liste (spieler plus von diesem client gesteuerte npcs)
export function bewegeGeschosse(world, dt, eigene, boden = null) {
  const liste = (Array.isArray(eigene) ? eigene : [eigene]).filter(Boolean);
  for (let g = geschosse.length - 1; g >= 0; g--) {
    const s = geschosse[g];
    s.v[1] -= 9.81 * dt;
    s.t += dt;
    const weg = scale(s.v, dt);
    const len = Math.hypot(...weg);
    let treffer = null, hitPos = null;
    if (len > 1e-6) {
      const R = (liste[0] || s.von)?.R;
      if (R) {
        const dirN = scale(weg, 1 / len);
        const hit = world.castRay(
          new R.Ray(vec(s.p), vec(dirN)), len, true, undefined, undefined, undefined, undefined,
          // in den ersten momenten das eigene fahrzeug des schützen ignorieren
          col => !(s.t < 0.25 && s.von && s.von.colliderSet.has(col.handle))
        );
        if (hit) {
          treffer = hit.collider;
          hitPos = add(s.p, scale(dirN, hit.timeOfImpact ?? hit.toi ?? 0));
        }
      }
    }
    const neuP = add(s.p, weg);
    if (!hitPos && boden && neuP[1] < boden(neuP[0], neuP[2])) hitPos = neuP;
    if (hitPos || s.t > GESCHOSS_LEBEN) {
      if (hitPos) {
        let teil = -1;
        const eigenes = treffer ? liste.find(v => v.colliderSet.has(treffer.handle)) : null;
        if (eigenes) {
          for (const [n, col] of eigenes.colliderVon) if (col.handle === treffer.handle) { teil = n; break; }
          // test-fahrzeuge sind unverwundbar (veh.kampf = false)
          const dirT = scale(s.v, 1 / (Math.hypot(...s.v) || 1));
          const hart = teil >= 0 && TEILE[eigenes.plan.parts[teil].t].sprengfest ? 2 * wandFaktor(eigenes.plan.parts[teil]) : 0;
          trefferWirkung(eigenes, hitPos, dirT, s.kal, teil, s.art);
          // hohlladung: durch den block hindurch weiterfliegen, panzerblöcke kosten zwei lagen
          if (s.art === 2 && s.durch > 0) {
            s.durch -= hart || 1;
            einschlaege.push({ p: hitPos, kal: s.kal, treffer: true, dir: dirT, art: 2 });
            s.p = add(hitPos, scale(dirT, ZELLE * 1.05));
            s.v = scale(s.v, 0.92);
            continue;
          }
        }
        einschlaege.push({ p: hitPos, kal: s.kal, art: s.art, treffer: teil >= 0, dir: scale(s.v, 1 / (Math.hypot(...s.v) || 1)) });
      }
      geschosse.splice(g, 1);
      continue;
    }
    s.p = neuP;
  }
}

export function aktualisiereRaeder(veh, dt, filter) {
  for (const b of veh.bodies) {
    if (!b.vc) continue;
    b.vc.updateVehicle(dt, undefined, undefined, filter);
  }
}

export function radZustand(veh, dt) {
  const out = [];
  for (const b of veh.bodies) {
    if (!b.vc) continue;
    const rot = b.rb.rotation();
    const inv = { x: -rot.x, y: -rot.y, z: -rot.z, w: rot.w };
    for (const r of b.raeder) {
      const feder = (b.vc.wheelSuspensionLength(r.w) ?? FEDER_WEG) - RAD_TIEFE;
      if (r.bock) {
        const welt = add(arr(b.rb.translation()), quatRot(rot, r.mitte));
        const vw = punktGeschw(b.rb, welt);
        const vl = quatRot(inv, vw);
        const p = veh.plan.parts[r.teil];
        const vt = matVec(transpose(ORIENT[p.o]), vl);
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

export function schritt(world, veh, eingabe, dt) {
  steuere(world, veh, eingabe, dt);
  const filter = c => !veh.colliderSet.has(c.handle) && !c.isSensor() && !ignoriere.has(c.handle);
  aktualisiereRaeder(veh, dt, filter);
}
