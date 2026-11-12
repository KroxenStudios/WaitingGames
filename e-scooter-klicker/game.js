"use strict";
const L = WG.L, LOCALE = L('de-DE', 'en-US');
const UPS = [
  { id: 'click',  name: 'Kräftiger Kick',     desc: '+1 Scooter pro Klick',               base: 15,      grow: 1.6,  click: 1 },
  { id: 'click2', name: 'Turbo-Motor',        desc: '+5 Scooter pro Klick',               base: 500,     grow: 1.7,  click: 5 },
  { id: 'intern', name: 'Praktikant',         desc: 'Schraubt 0,5 Scooter pro Sekunde',   base: 40,      grow: 1.15, cps: 0.5 },
  { id: 'lader',  name: 'Ladestation',        desc: '3 Scooter pro Sekunde',              base: 250,     grow: 1.15, cps: 3 },
  { id: 'sharing',name: 'Sharing-Flotte',     desc: '15 Scooter pro Sekunde',             base: 1500,    grow: 1.15, cps: 15 },
  { id: 'werk',   name: 'Scooter-Fabrik',     desc: '80 Scooter pro Sekunde',             base: 9000,    grow: 1.15, cps: 80 },
  { id: 'giga',   name: 'Gigafactory',        desc: '500 Scooter pro Sekunde',            base: 60000,   grow: 1.15, cps: 500 },
  { id: 'mond',   name: 'Mond-Werkstatt',     desc: '4.000 Scooter pro Sekunde',          base: 500000,  grow: 1.15, cps: 4000 },
];

const EARTH = 1e15;
const MS = [
  { id: 'first',  total: 1,     title: 'Der erste Scooter',        text: 'Aus einer Idee wird ein Fahrzeug. Er rollt noch wackelig, aber er rollt.' },
  { id: 'garage', total: 100,   title: 'Garagen-Startup',          text: 'Hundert Scooter stehen in der Garage. Die Nachbarn beschweren sich schon über den Lärm.' },
  { id: 'intern', own: ['intern', 1], title: 'Erster Mitarbeiter', text: 'Ein Praktikant schraubt für Kaffee und Ruhm. Er nennt es „Erfahrung“.' },
  { id: 'hall',   total: 1e3,   title: 'Eigene Werkshalle',        text: 'Die Garage ist zu klein. Du ziehst in eine Halle mit echtem Förderband.' },
  { id: 'manu',   own: ['lader', 1], title: 'Manufaktur',         text: 'Handarbeit trifft Ladestation. Jeder Scooter bekommt ein Qualitätssiegel – handgeklebt.' },
  { id: 'city',   total: 1e4,   title: 'Stadtgespräch',            text: 'Die ganze Stadt fährt E-Scooter. Der Bürgermeister fordert Parkzonen.' },
  { id: 'share',  own: ['sharing', 1], title: 'Sharing-Imperium',  text: 'Per App entsperren, überall stehen lassen. Gehwege werden zu Parkplätzen.' },
  { id: 'fab',    own: ['werk', 1], title: 'Industrielle Fertigung', text: 'Die erste vollautomatische Fabrik läuft rund um die Uhr. Ein Scooter pro Sekunde, dann zwei, dann zehn.' },
  { id: 'nat',    total: 1e5,   title: 'Nationale Mobilitätswende', text: 'Das Verkehrsministerium streicht den Begriff „Auto“ aus dem Entwurf. Fußgänger fordern Gehwege zurück.' },
  { id: 'glob',   total: 1e6,   title: 'Globale Produktion',       text: 'Werke auf allen Kontinenten. Die Lieferketten reichen einmal um den Planeten und zurück.' },
  { id: 'giga',   own: ['giga', 1], title: 'Gigafactory',         text: 'Eine Fabrik so groß, dass sie ein eigenes Wetter hat. Drinnen regnet es manchmal Schrauben.' },
  { id: 'mil10',  total: 1e7,   title: 'Zehn Millionen',           text: 'Es gibt jetzt mehr Scooter als Menschen in manchen Ländern. Rechnerisch fährt jeder dort zweimal.' },
  { id: 'traffic',total: 1e8,   title: 'Der Verkehr kippt',        text: 'Autos sind im Stau eingekeilt, Scooter fahren drumherum. Die Autobahn wird zur Scooterspur.' },
  { id: 'moon',   own: ['mond', 1], title: 'Mond-Werkstatt',      text: 'Geringe Schwerkraft, hohe Sprünge. Der erste Mondscooter springt 40 Meter weit.' },
  { id: 'bill',   total: 1e9,   title: 'Eine Milliarde',           text: 'Jeder achte Mensch besitzt einen Scooter. Die Ladekabel-Industrie feiert Rekordumsätze.' },
  { id: 'trill',  total: 1e12,  title: 'Billionen-Marke',          text: 'Scooter stapeln sich auf Dächern, in Seen und in Wohnzimmern. Statistiker hören auf zu zählen.' },
  { id: 'land',   total: EARTH * 0.29, title: 'Alle Kontinente bedeckt', text: 'Das gesamte Festland ist unter einer Schicht aus E-Scootern verschwunden. Die Ozeane sind als Nächstes dran.' },
  { id: 'earth',  total: EARTH, title: 'Die Erde ist zu 100 % mit E-Scootern bedeckt', text: 'Von den Polen bis zum Äquator – nur noch Lenker und Trittbretter. Aus dem All sieht der Planet jetzt schwarz-türkis aus. Du hast gewonnen. Oder verloren. Schwer zu sagen.' },
  { id: 'beyond', total: EARTH * 1e3, title: 'Interplanetarer Marktführer', text: 'Mars, Venus und Jupitermonde: überall rollt es. Die Galaxie wartet.' },
];
const EN_UPS = {
  click: ['Mighty Kick', '+1 scooter per click'],
  click2: ['Turbo Motor', '+5 scooters per click'],
  intern: ['Intern', 'Assembles 0.5 scooters per second'],
  lader: ['Charging Station', '3 scooters per second'],
  sharing: ['Sharing Fleet', '15 scooters per second'],
  werk: ['Scooter Factory', '80 scooters per second'],
  giga: ['Gigafactory', '500 scooters per second'],
  mond: ['Moon Workshop', '4,000 scooters per second'],
};
const EN_MS = {
  first: ['The First Scooter', 'An idea becomes a vehicle. It wobbles a bit, but it rolls.'],
  garage: ['Garage Startup', 'A hundred scooters are parked in the garage. The neighbours are already complaining about the noise.'],
  intern: ['First Employee', 'An intern tinkers away for coffee and glory. He calls it "experience".'],
  hall: ['Own Workshop', 'The garage is too small. You move into a hall with a real conveyor belt.'],
  manu: ['Manufactory', 'Handcraft meets charging station. Every scooter gets a quality seal – glued on by hand.'],
  city: ['Talk of the Town', 'The whole city rides e-scooters. The mayor demands parking zones.'],
  share: ['Sharing Empire', 'Unlock by app, leave anywhere. Pavements turn into car parks.'],
  fab: ['Industrial Production', 'The first fully automated factory runs around the clock. One scooter per second, then two, then ten.'],
  nat: ['National Mobility Shift', 'The transport ministry strikes the word "car" from the draft. Pedestrians demand their pavements back.'],
  glob: ['Global Production', 'Plants on every continent. The supply chains reach around the planet and back.'],
  giga: ['Gigafactory', 'A factory so big it has its own weather. Sometimes it rains screws inside.'],
  mil10: ['Ten Million', 'In some countries there are now more scooters than people. Statistically, everyone rides twice.'],
  traffic: ['Traffic Tips Over', 'Cars are stuck in jams while scooters zip around them. The motorway becomes a scooter lane.'],
  moon: ['Moon Workshop', 'Low gravity, high jumps. The first moon scooter jumps 40 metres.'],
  bill: ['One Billion', 'One in eight people owns a scooter. The charging cable industry celebrates record sales.'],
  trill: ['Trillion Mark', 'Scooters pile up on roofs, in lakes and in living rooms. Statisticians stop counting.'],
  land: ['All Continents Covered', 'All the land has vanished beneath a layer of e-scooters. The oceans are next.'],
  earth: ['The Earth is 100% covered in e-scooters', 'From the poles to the equator – nothing but handlebars and footboards. From space the planet now looks black and turquoise. You won. Or lost. Hard to tell.'],
  beyond: ['Interplanetary Market Leader', 'Mars, Venus and the moons of Jupiter: everything rolls. The galaxy awaits.'],
};
if (WG.lang === 'en') {
  for (const u of UPS) [u.name, u.desc] = EN_UPS[u.id];
  for (const m of MS) [m.title, m.text] = EN_MS[m.id];
}
const msDone = m => m.total ? save.total >= m.total : owned(UPS.find(u => u.id === m.own[0])) >= m.own[1];

let stored = {};
try { stored = JSON.parse(localStorage.getItem('escooterklicker') || '{}'); } catch (e) {}
const save = Object.assign({ n: 0, total: 0, own: {}, ms: {} }, stored);
const persist = () => { try { localStorage.setItem('escooterklicker', JSON.stringify(save)); } catch (e) {} };

const owned = u => save.own[u.id] || 0;
const cost = u => Math.ceil(u.base * Math.pow(u.grow, owned(u)));
const perClick = () => 1 + UPS.reduce((s, u) => s + (u.click || 0) * owned(u), 0);
const perSec = () => UPS.reduce((s, u) => s + (u.cps || 0) * owned(u), 0);

const fmt = n => {
  if (n < 1e4) return Math.floor(n).toLocaleString(LOCALE);
  const s = L(['', 'Tsd', 'Mio', 'Mrd', 'Bio', 'Brd'], ['', 'K', 'M', 'B', 'T', 'Qa']);
  let i = 0; while (n >= 1000 && i < s.length - 1) { n /= 1000; i++; }
  return n.toLocaleString(LOCALE, { maximumFractionDigits: 2 }) + ' ' + s[i];
};

const field = document.getElementById('field');
const MAX_VISIBLE = 160;
let shown = 0;
function addScooter(animate) {
  const w = field.clientWidth || 300, h = field.clientHeight || 300;
  const img = document.createElement('img');
  img.src = 'images/escooter.png'; img.alt = '';
  const y = Math.random();
  img.style.left = Math.random() * Math.max(10, w - 44) + 'px';
  img.style.top = (h * 0.35 + y * (h * 0.65 - 40)) + 'px';
  img.style.zIndex = Math.round(y * 100);
  img.style.width = (34 + y * 22) + 'px';
  if (!animate) img.style.animation = 'none';
  field.appendChild(img);
  if (++shown > MAX_VISIBLE) { field.removeChild(field.firstChild); shown--; }
}
function syncFleet(animate) {
  const want = Math.min(MAX_VISIBLE, Math.floor(save.n));
  while (shown < want) addScooter(animate);
}

const $ = id => document.getElementById(id);
if (WG.lang === 'en') {
  $('lblScooter').textContent = 'e-scooters';
  $('lblPs').textContent = 'per second';
  $('lblPc').textContent = 'per click';
  $('btn').setAttribute('aria-label', 'Click the e-scooter');
  $('lblFleet').textContent = 'Your fleet';
  $('tabShop').textContent = 'Power-ups';
  $('lblMs').textContent = 'Milestones';
  $('reset').textContent = 'Reset progress';
  $('back').textContent = '← Waiting Games';
  document.querySelector('.top a').href = '../index.html';
}
const shop = $('shop');
const rows = UPS.map(u => {
  const b = document.createElement('button');
  b.className = 'up';
  b.innerHTML = '<span class="n"></span><span class="c"></span><span class="d"></span><span class="o"></span>';
  b.onclick = () => {
    const c = cost(u);
    if (save.n < c) return;
    save.n -= c; save.own[u.id] = owned(u) + 1;
    persist(); render();
  };
  shop.appendChild(b);
  return { u, b, n: b.children[0], c: b.children[1], d: b.children[2], o: b.children[3] };
});
function render() {
  $('count').textContent = fmt(save.n);
  $('ps').textContent = fmt(perSec());
  $('pc').textContent = fmt(perClick());
  for (const r of rows) {
    r.n.textContent = r.u.name;
    r.c.textContent = fmt(cost(r.u));
    r.d.textContent = r.u.desc;
    r.o.textContent = owned(r.u) ? '×' + owned(r.u) : '';
    r.b.disabled = save.n < cost(r.u);
  }
  document.title = fmt(save.n) + ' ' + L('E-Scooter', 'e-scooters');
  checkMs(); renderMs();
}

const msPanel = $('msPanel');
const showTab = ms => {
  $('tabShop').classList.toggle('on', !ms); $('tabMs').classList.toggle('on', ms);
  shop.hidden = ms; msPanel.hidden = !ms; msKey = ''; renderMs();
};
$('tabShop').onclick = () => showTab(false);
$('tabMs').onclick = () => showTab(true);

function toast(m) {
  const t = document.createElement('div');
  t.className = 'toast'; t.innerHTML = '<b></b><span>' + L('Meilenstein erreicht – nachzulesen unter „Meilensteine“.', 'Milestone reached – read it under "Milestones".') + '</span>';
  t.firstChild.textContent = '🏆 ' + m.title;
  t.onclick = () => { showTab(true); t.remove(); };
  document.body.appendChild(t); setTimeout(() => t.remove(), 5000);
}
let msKey = '';
function renderMs() {
  const done = MS.filter(m => save.ms[m.id]).length;
  $('msCount').textContent = '(' + done + '/' + MS.length + ')';
  if (msPanel.hidden) return;
  const pct = Math.min(100, save.total / EARTH * 100);
  const key = done + '|' + pct.toFixed(2);
  if (key === msKey) return;
  msKey = key;
  let h = '<div class="earth">' + L('Erdoberfläche bedeckt: ', 'Earth surface covered: ') + (pct < 0.01 && pct > 0 ? L('<0,01', '<0.01') : pct.toLocaleString(LOCALE, { maximumFractionDigits: 2 })) + ' %<i><b style="width:' + pct + '%"></b></i></div>';
  for (const m of MS) {
    if (save.ms[m.id]) { h += '<div class="ms"><h4>🏆 ' + m.title + '</h4><p>' + m.text + '</p></div>'; continue; }
    const goal = m.total ? fmt(m.total) + L(' Scooter produzieren', ' scooters produced') : L(m.own[1] + '× ' + UPS.find(u => u.id === m.own[0]).name + ' kaufen', 'buy ' + m.own[1] + '× ' + UPS.find(u => u.id === m.own[0]).name);
    h += '<div class="ms locked"><h4>🔒 ???</h4><div class="goal">' + goal + '</div></div>';
  }
  msPanel.innerHTML = h;
}
function checkMs() {
  let hit = false;
  for (const m of MS) if (!save.ms[m.id] && msDone(m)) { save.ms[m.id] = 1; toast(m); hit = true; }
  if (hit) persist();
  return hit;
}

function gain(x) { save.n += x; save.total += x; }
const btn = $('btn');
btn.addEventListener('pointerdown', e => {
  const x = perClick();
  gain(x);
  syncFleet(true);
  const p = document.createElement('div');
  p.className = 'pop'; p.textContent = '+' + fmt(x);
  p.style.left = (e.clientX - 8 + (Math.random() * 30 - 15)) + 'px'; p.style.top = (e.clientY - 20) + 'px';
  document.body.appendChild(p); setTimeout(() => p.remove(), 800);
  render();
});
btn.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) { gain(perClick()); syncFleet(true); render(); } }
});
$('reset').onclick = () => {
  if (!confirm(L('Spielstand wirklich löschen?', 'Really delete your progress?'))) return;
  save.n = 0; save.total = 0; save.own = {}; save.ms = {}; field.innerHTML = ''; shown = 0; persist(); render();
};

let last = performance.now(), acc = 0, saveT = 0;
setInterval(() => {
  const now = performance.now(), dt = Math.min(1, (now - last) / 1000); last = now;
  const ps = perSec();
  if (ps > 0) { gain(ps * dt); acc += dt; }
  saveT += dt;
  if (saveT > 3) { saveT = 0; persist(); }
  syncFleet(true); render();
}, 100);
addEventListener('beforeunload', persist);

syncFleet(false); render();
