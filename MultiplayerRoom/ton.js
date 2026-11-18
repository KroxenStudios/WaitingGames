// prozeduraler ton für den kampf: schüsse, einschläge, explosionen. keine audiodateien, alles aus rauschen und sinus.
// der browser erlaubt ton erst nach einer eingabe des spielers, deshalb wird der kontext erst dann erzeugt.

let ctx = null;
let rauschPuffer = null;
let an = true;
try { an = localStorage.getItem("bastelkarre-ton") !== "0"; } catch {}

const SCHALL = 343;

export const tonAn = () => an;

export function setzeTon(wert) {
  an = !!wert;
  try { localStorage.setItem("bastelkarre-ton", an ? "1" : "0"); } catch {}
}

// beim ersten tastendruck oder klick den kontext starten
export function starte() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  }
  if (ctx.state === "suspended") ctx.resume();
}
for (const ereignis of ["keydown", "pointerdown"]) addEventListener(ereignis, starte, { passive: true });

function rauschen() {
  if (rauschPuffer) return rauschPuffer;
  const n = Math.floor(ctx.sampleRate * 2.5);
  rauschPuffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = rauschPuffer.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return rauschPuffer;
}

// lautstärke und verzögerung nach entfernung (schall braucht zeit, höchstens 4 s)
function nachAbstand(abstand) {
  return { laut: 1 / (1 + abstand / 45), verzug: Math.min(4, abstand / SCHALL) };
}

// rauschstoss durch einen tiefpass plus tiefer sinus-schlag
function knallton({ abstand, dauer, filter, schlagHz, schlagEnde, staerke, spitzeZeit = 0.004 }) {
  if (!an || !ctx || ctx.state !== "running") return;
  const { laut, verzug } = nachAbstand(abstand);
  const g = laut * staerke;
  if (g < 0.004) return;
  const t0 = ctx.currentTime + verzug;

  const quelle = ctx.createBufferSource();
  quelle.buffer = rauschen();
  quelle.loop = true;
  const tief = ctx.createBiquadFilter();
  tief.type = "lowpass";
  tief.frequency.setValueAtTime(filter, t0);
  tief.frequency.exponentialRampToValueAtTime(Math.max(120, filter * 0.12), t0 + dauer);
  const hall = ctx.createGain();
  hall.gain.setValueAtTime(0.0001, t0);
  hall.gain.exponentialRampToValueAtTime(g, t0 + spitzeZeit);
  hall.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer);
  quelle.connect(tief).connect(hall).connect(ctx.destination);
  quelle.start(t0, Math.random() * 1.5);
  quelle.stop(t0 + dauer + 0.05);

  const sinus = ctx.createOscillator();
  sinus.type = "sine";
  sinus.frequency.setValueAtTime(schlagHz, t0);
  sinus.frequency.exponentialRampToValueAtTime(schlagEnde, t0 + dauer * 0.7);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t0);
  sg.gain.exponentialRampToValueAtTime(g * 0.9, t0 + spitzeZeit * 1.5);
  sg.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer * 0.8);
  sinus.connect(sg).connect(ctx.destination);
  sinus.start(t0);
  sinus.stop(t0 + dauer);
}

// abschuss: kal in mm (25..155), abstand in metern vom hörer
export function schuss(kal, abstand = 0) {
  const k = Math.max(0.15, kal / 155);
  knallton({ abstand, dauer: 0.25 + 0.7 * k, filter: 5200 - 3800 * k, schlagHz: 150 - 80 * k, schlagEnde: 40, staerke: 0.35 + 0.45 * k });
}

// einschlag eines geschosses: kürzer und heller als der abschuss
export function einschlag(kal, abstand = 0, getroffen = false) {
  const k = Math.max(0.15, kal / 155);
  knallton({ abstand, dauer: 0.2 + 0.5 * k, filter: getroffen ? 4200 : 1800, schlagHz: 110, schlagEnde: 35, staerke: 0.25 + 0.4 * k });
}

// explosion: groesse = radius in metern (1 klein .. 5 gross)
export function explosion(groesse, abstand = 0) {
  const k = Math.min(1, groesse / 5);
  knallton({ abstand, dauer: 0.9 + 1.8 * k, filter: 1400 + 800 * k, schlagHz: 80, schlagEnde: 22, staerke: 0.55 + 0.45 * k, spitzeZeit: 0.01 });
}
