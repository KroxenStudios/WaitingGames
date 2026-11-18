// npc-panzer für die fight-warteschlange: der client des ersten wartenden steuert sie mit der echten physik und
// meldet sie dem raum wie normale spieler (je npc eine eigene verbindung, join mit npc: true).
// ki: nächstes ziel anfahren, turm und rohr darauf ausrichten, schiessen; ohne gegner die nächste freie base anfahren.
import * as PH from "./physik.js";
import * as BAU from "./bau.js";

export const NPC_NAMEN = ["Rocky", "Blitz", "Mammut", "Kolbenfresser", "Dosenöffner", "Schrottpresse"];
const NPC_FARBEN = ["#c0504d", "#e0a030", "#8a63d2", "#2bb3a3", "#d96aa7", "#6b8f3a"];
// vorzeichen der lenkung: +1 heisst lenk > 0 dreht den kurs (atan2(x, -z)) nach oben, wird in der simulation geprüft
export const LENK_VORZEICHEN = 1;
const POSE_MS = 33;
const SICHT_MAX = 450;
const ZIEL_MAX = 600;
const wickel = a => Math.atan2(Math.sin(a), Math.cos(a));
const kl = (v, a, b) => Math.max(a, Math.min(b, v));
const r3 = v => Math.round(v * 1000) / 1000;

// eine denkrunde: gibt die eingabe für PH.schritt zurück. umg: { ziele: [{ pos, npc }], basen: [[x, z]], fb: [[besitzer, ...]], meineId }
export function denke(bot, umg, dt) {
  const veh = bot.veh;
  const sb = PH.sitzKoerper(veh);
  const ein = { gas: 0, lenk: 0, bremse: false, tasten: new Set() };
  if (!sb) return ein;
  const t = sb.rb.translation(), q = sb.rb.rotation();
  const f = PH.quatRot(q, veh.vorwaerts);
  const kurs = Math.atan2(f[0], -f[2]);
  const v = PH.tempo(veh);

  // ziel wählen: nächster gegner (npcs zählen weniger), sonst die nächste base, die nicht mir gehört
  let ziel = null, zielWert = Infinity;
  for (const z of umg.ziele) {
    const d = Math.hypot(z.pos[0] - t.x, z.pos[2] - t.z);
    const wert = d * (z.npc ? 1.8 : 1);
    if (d < ZIEL_MAX && wert < zielWert) { ziel = z; zielWert = wert; }
  }
  let punkt = null;
  if (ziel) punkt = ziel.pos;
  else {
    let best = Infinity;
    umg.basen.forEach(([bx, bz], i) => {
      if (umg.fb?.[i]?.[0] === umg.meineId) return;
      const d = Math.hypot(bx - t.x, bz - t.z);
      if (d < best) { best = d; punkt = [bx, t.y, bz]; }
    });
    if (!punkt) punkt = [t.x + Math.sin(bot.zeit * 0.05) * 200, t.y, t.z + Math.cos(bot.zeit * 0.05) * 200];
  }

  // fahren: auf das ziel zudrehen, gegner auf abstand halten
  const dx = punkt[0] - t.x, dz = punkt[2] - t.z;
  const dist = Math.hypot(dx, dz);
  const fehler = wickel(Math.atan2(dx, -dz) - kurs);
  let gas = Math.abs(fehler) > 1.3 ? 0.25 : 0.85;
  let lenk = kl(fehler * 1.6, -1, 1) * LENK_VORZEICHEN;
  const halten = ziel ? 70 : 12;
  if (dist < halten) { gas = 0; ein.bremse = true; }
  // festgefahren: wenn trotz gas kaum bewegung, kurz rückwärts mit gegenlenkung
  bot.ruckZeit = (bot.ruckZeit || 0) - dt;
  bot.festZeit = (bot.festZeit || 0) + (gas > 0.2 && Math.abs(v) < 0.6 ? dt : -bot.festZeit);
  if (bot.festZeit > 3) { bot.ruckZeit = 2.5; bot.festZeit = 0; }
  if (bot.ruckZeit > 0) { gas = -1; lenk = -lenk; ein.bremse = false; }
  ein.gas = gas;
  ein.lenk = lenk;

  // zielen und schiessen
  const rohr = veh.plan.parts.findIndex((p, i) => p.t === "geschuetz" && !veh.zerstoert.has(i));
  const verschluss = veh.plan.parts.findIndex((p, i) => p.t === "verschluss" && !veh.zerstoert.has(i));
  const m = rohr >= 0 ? PH.muendungPos(veh, rohr) : null;
  if (ziel && m && verschluss >= 0) {
    const zx = ziel.pos[0] - m.pos[0], zz = ziel.pos[2] - m.pos[2];
    const d3 = Math.hypot(zx, zz);
    // flugzeit grob schätzen und die schwerkraft ausgleichen
    const flug = d3 / 760;
    const zy = ziel.pos[1] + 0.2 - m.pos[1] + 0.5 * 9.81 * flug * flug;
    const sollYaw = Math.atan2(zx, -zz), istYaw = Math.atan2(m.dir[0], -m.dir[2]);
    const fehlerYaw = wickel(sollYaw - istYaw);
    const sollNick = Math.atan2(zy, d3), istNick = Math.asin(kl(m.dir[1], -1, 1));
    const fehlerNick = sollNick - istNick;
    // turm: e dreht den winkel kleiner, q grösser (arrowup hebt das rohr)
    if (Math.abs(fehlerYaw) > 0.012) ein.tasten.add(fehlerYaw > 0 ? "q" : "e");
    if (Math.abs(fehlerNick) > 0.012) ein.tasten.add(fehlerNick > 0 ? "arrowup" : "arrowdown");
    // geschossart nach entfernung: nah hohlladung, mittel wuchtgeschoss, fern sprenggranate
    const wunsch = d3 < 120 ? 2 : d3 < 300 ? 1 : 0;
    if (PH.artVon(veh, verschluss) !== wunsch && !bot.cVorher) ein.tasten.add("c");
    bot.cVorher = ein.tasten.has("c");
    const bereit = (veh.nachladen.get(verschluss) ?? 0) <= 0;
    let frei = d3 < SICHT_MAX;
    if (frei && bot.R) {
      const richtung = [zx, ziel.pos[1] - m.pos[1], zz];
      const l = Math.hypot(...richtung) || 1;
      const hit = veh.world.castRay(
        new bot.R.Ray({ x: m.pos[0], y: m.pos[1], z: m.pos[2] }, { x: richtung[0] / l, y: richtung[1] / l, z: richtung[2] / l }),
        l, true, undefined, undefined, undefined, undefined, c => !veh.colliderSet.has(c.handle)
      );
      // etwas anderes als das ziel in der schusslinie (hügel, wand): nicht schiessen
      if (hit && (hit.timeOfImpact ?? hit.toi ?? l) < l - 6) frei = false;
    }
    if (frei && bereit && Math.abs(fehlerYaw) < 0.045 && Math.abs(fehlerNick) < 0.045) ein.tasten.add("x");
  }
  return ein;
}

// kampfunfähig: kein motor, kein rohr oder kein verschluss mehr ganz
function kampfunfaehig(veh) {
  const lebt = typ => veh.plan.parts.some((p, i) => p.t === typ && !veh.zerstoert.has(i));
  return !lebt("motor") || !lebt("geschuetz") || !lebt("verschluss");
}

// steuerung der npcs eines clients. kontext (alles vom spiel):
//  R, world, plan, url(), startBasis(lot), umgebung() -> { ziele, basen, fb, meineId }, melde(text)
export function erzeugeNpcSteuerung(ctx) {
  const bots = [];
  let laeuft = false;

  function neuesFahrzeug(bot) {
    if (bot.veh) PH.entferneFahrzeug(ctx.world, bot.veh);
    const lift = BAU.bodenAbstand(ctx.plan, BAU.RAD_TIEFE) + 0.03;
    const s = ctx.startBasis(bot.lot, lift);
    bot.veh = PH.erzeugeFahrzeug(ctx.R, ctx.world, ctx.plan, { basis: s.basis, drehung: s.dreh, kampf: true });
    bot.veh.world = ctx.world;
    bot.spawn = (bot.spawn || 0) + 1;
    bot.tot = 0;
    bot.zeit = 0;
    bot.radZ = [];
  }

  function sende(bot, daten) {
    if (bot.sock?.readyState === WebSocket.OPEN) bot.sock.send(JSON.stringify(daten));
  }

  function pose(bot) {
    const v = bot.veh;
    if (!v) return;
    const msg = { type: "pose", m: "fahr", s: bot.spawn, b: [], w: [], fx: [], g: [], sp: v.sprengReihe, fm: true };
    for (const b of v.bodies) {
      const t = b.rb.translation(), q = b.rb.rotation();
      msg.b.push([r3(t.x), r3(t.y), r3(t.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w)]);
    }
    for (const z of bot.radZ) msg.w.push(z.teil, r3(z.feder), r3(z.lenk), r3(z.dreh % 1000));
    for (const [i, s] of v.fx) msg.fx.push([i, r3(s * 10)]);
    v.gelenke.forEach((g, i) => { if (!g.aktiv) msg.g.push(i); });
    msg.sh = [v.schussZaehler, ...v.schussReihe];
    msg.zs = [...v.zerstoert];
    sende(bot, msg);
  }

  function starteBot(name, farbe) {
    const bot = { name, farbe, id: null, lot: 0, veh: null, sock: null, R: ctx.R, zeit: 0 };
    try { bot.sock = new WebSocket(ctx.url()); } catch { return; }
    bot.sock.addEventListener("open", () => {
      sende(bot, { type: "join", npc: true, name, color: farbe });
    });
    bot.sock.addEventListener("message", e => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.type !== "welcome" || bot.id) return;
      bot.id = String(m.id);
      bot.lot = Number(m.lot) || 0;
      neuesFahrzeug(bot);
      sende(bot, { type: "plan", plan: JSON.stringify(ctx.plan) });
    });
    bot.sock.addEventListener("close", () => { bot.sock = null; });
    bot.timer = setInterval(() => {
      if (bot.veh) pose(bot);
      if (bot.sock?.readyState === WebSocket.OPEN) { bot.ping = (bot.ping || 0) + POSE_MS; if (bot.ping > 5000) { bot.ping = 0; sende(bot, { type: "ping" }); } }
    }, POSE_MS);
    bots.push(bot);
  }

  return {
    get aktiv() { return laeuft; },
    ids: () => bots.map(b => b.id).filter(Boolean),
    fahrzeuge: () => bots.map(b => b.veh).filter(Boolean),
    radZ: veh => bots.find(b => b.veh === veh)?.radZ || [],
    start(anzahl) {
      this.stop();
      laeuft = true;
      for (let i = 0; i < anzahl; i++) setTimeout(() => { if (laeuft) starteBot(NPC_NAMEN[i % NPC_NAMEN.length], NPC_FARBEN[i % NPC_FARBEN.length]); }, i * 400);
    },
    stop() {
      laeuft = false;
      for (const b of bots) {
        clearInterval(b.timer);
        if (b.veh) PH.entferneFahrzeug(ctx.world, b.veh);
        try { b.sock?.close(1000, "npc"); } catch {}
      }
      bots.length = 0;
    },
    // vor jedem physikschritt: ki rechnen und die npcs steuern
    schritt(dt) {
      if (!laeuft) return;
      const umg = ctx.umgebung();
      for (const b of bots) {
        if (!b.veh) continue;
        b.zeit += dt;
        // andere npcs dieses clients zählen als (weniger bevorzugte) ziele
        const andere = bots.filter(o => o !== b && o.veh && o.id).map(o => { const t = PH.sitzKoerper(o.veh)?.rb.translation(); return t ? { id: o.id, pos: [t.x, t.y, t.z], npc: true } : null; }).filter(Boolean);
        const ein = denke(b, { ...umg, meineId: b.id, ziele: [...umg.ziele.filter(z => z.id !== b.id), ...andere] }, dt);
        PH.schritt(ctx.world, b.veh, ein, dt);
        // umgekippt oder kampfunfähig: nach einer weile neu aufstellen
        const sb = PH.sitzKoerper(b.veh);
        const oben = sb ? PH.quatRot(sb.rb.rotation(), [0, 1, 0])[1] : 1;
        b.tot += (oben < 0.25 || kampfunfaehig(b.veh) || (sb && sb.rb.translation().y < -30)) ? dt : -b.tot;
        if (b.tot > 8) neuesFahrzeug(b);
      }
    },
    // nach dem physikschritt: radzustand für die pose
    nachSchritt(dt) {
      for (const b of bots) if (b.veh) b.radZ = PH.radZustand(b.veh, dt);
    }
  };
}
