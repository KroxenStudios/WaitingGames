
import { KLEIDUNG, FRISUREN, HAARFARBEN, HAUTFARBEN, KOERPER, MUND, NAMEN, bereinigeLook } from "./look.js";

const L = (de, en) => (window.WG ? WG.L(de, en) : de);
const LOOK_FELDER = ["kleidung", "frisur", "haar", "haut", "koerper", "mund"];
const HOST = "krox-accounts.kroxenstudios.workers.dev";
const params = new URLSearchParams(location.search);
const BASE = params.get("accounts") || (location.port === "8787" || location.port === "8799" ? `${location.protocol}//${location.hostname}:8799` : `https://${HOST}`);
const TOKEN_KEY = "krox-token", USER_KEY = "krox-user", SYNC_KEY = "krox-sync";

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: k => { try { localStorage.removeItem(k); } catch {} }
};

const FEHLER = {
  login_falsch: ["Benutzername oder Passwort falsch.", "Wrong username or password."],
  zu_viele_versuche: ["Zu viele Versuche. Bitte später erneut probieren.", "Too many attempts. Please try again later."],
  name_vergeben: ["Dieser Benutzername ist schon vergeben.", "This username is already taken."],
  name_ungueltig: ["Benutzername: 3–20 Zeichen aus a–z, 0–9, _ und -.", "Username: 3–20 characters from a–z, 0–9, _ and -."],
  garage_voll: ["Die Garage ist voll (maximal 12 Fahrzeuge).", "The garage is full (12 vehicles max)."],
  plan_ungueltig: ["Der Bauplan ist ungültig oder zu groß.", "The build is invalid or too large."],
  nicht_angemeldet: ["Du bist nicht angemeldet.", "You are not signed in."],
  zu_gross: ["Zu viele Daten.", "Too much data."],
  name_reserviert: ["Dieser Name ist reserviert.", "This name is reserved."],
  titel_ungueltig: ["Der Titel braucht mindestens 3 Zeichen.", "The title needs at least 3 characters."],
  sitz_fehlt: ["Das Fahrzeug braucht mindestens einen Sitz.", "The vehicle needs at least one seat."],
  zu_viele_wartend: ["Du hast schon 5 Fahrzeuge in der Prüfung. Bitte warte auf die Freigabe.", "You already have 5 vehicles awaiting review. Please wait for approval."],
  zu_viele_modelle: ["Du hast die maximale Zahl veröffentlichter Fahrzeuge erreicht (30).", "You reached the maximum number of published vehicles (30)."],
  nicht_gefunden: ["Nicht gefunden.", "Not found."],
  schon_vorhanden: ["Es gibt schon eine Anfrage oder Freundschaft.", "There is already a request or friendship."],
  zu_viele_freunde: ["Die Freundesliste ist voll (100).", "The friends list is full (100)."],
  zu_viele_anfragen: ["Du hast schon 20 offene Anfragen.", "You already have 20 open requests."],
  eigenes_modell: ["Eigene Fahrzeuge kannst du nicht bewerten.", "You cannot rate your own vehicles."],
  nicht_verfuegbar: ["Gerade nicht verfügbar.", "Not available right now."],
  geschuetzt: ["Das Betreiber-Konto lässt sich hier nicht löschen.", "The operator account cannot be deleted here."],
  gesperrt: ["Dieses Konto wurde vom Moderator gesperrt.", "This account was suspended by a moderator."],
  blockiert: ["Du hast dieses Konto blockiert.", "You have blocked this account."],
  schon_gemeldet: ["Das hast du schon gemeldet.", "You already reported this."],
  bild_ungueltig: ["Das Vorschaubild ist ungültig.", "The preview image is invalid."],
  zu_viele_blockiert: ["Du kannst höchstens 200 Konten blockieren.", "You can block at most 200 accounts."]
};
const minutenText = sek => {
  const min = Math.max(1, Math.ceil((Number(sek) || 900) / 60));
  return L(`${min} Minute${min === 1 ? "" : "n"}`, `${min} minute${min === 1 ? "" : "s"}`);
};
const fehlerText = (code, daten) => {
  if (code === "zu_viele_versuche") {
    return L(`Zu viele Fehlversuche. Aus Sicherheitsgründen ist die Anmeldung für ${minutenText(daten?.retry)} gesperrt (Request-Timeout).`,
      `Too many failed attempts. For security, sign-in is blocked for ${minutenText(daten?.retry)} (request timeout).`);
  }
  if (code === "login_falsch" && daten && typeof daten.left === "number") {
    return daten.left > 0
      ? L(`Benutzername oder Passwort falsch. Noch ${daten.left} Versuch${daten.left === 1 ? "" : "e"}, danach ${minutenText(900)} Pause.`, `Wrong username or password. ${daten.left} attempt${daten.left === 1 ? "" : "s"} left, then a ${minutenText(900)} timeout.`)
      : L(`Benutzername oder Passwort falsch. Die Anmeldung ist jetzt für ${minutenText(daten.retry)} gesperrt (Request-Timeout).`, `Wrong username or password. Sign-in is now blocked for ${minutenText(daten.retry)} (request timeout).`);
  }
  const e = FEHLER[code];
  return e ? L(e[0], e[1]) : L("Der Server ist gerade nicht erreichbar.", "The server is not reachable right now.");
};

const WARN_KEY = "krox-warnung";
function warnungLesen() {
  try { return JSON.parse(sessionStorage.getItem(WARN_KEY) || "null"); } catch { return null; }
}
function warnungText(w) {
  const zeit = w.zuletzt ? new Date(w.zuletzt).toLocaleString(WG?.lang === "en" ? "en-GB" : "de-DE", { dateStyle: "short", timeStyle: "short" }) : "";
  return L(`Seit deiner letzten Anmeldung gab es ${w.n} fehlgeschlagene Anmeldeversuche an deinem Konto${zeit ? " (zuletzt " + zeit + ")" : ""}. Warst du das nicht, ändere dein Passwort.`,
    `Since your last sign-in there ${w.n === 1 ? "was 1 failed sign-in attempt" : "were " + w.n + " failed sign-in attempts"} on your account${zeit ? " (latest " + zeit + ")" : ""}. If that was not you, change your password.`);
}

async function anfrage(method, pfad, body, token = store.get(TOKEN_KEY)) {
  let res;
  try {
    res = await fetch(BASE + pfad, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: "Bearer " + token } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error("netz");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && pfad !== "/login" && pfad !== "/recover" && pfad !== "/password" && pfad !== "/delete") abmelden(false);
    const err = new Error(data.error || "fehler");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function schluessel(passwort, benutzer) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(passwort), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode("krox-accounts-v1:" + benutzer.toLowerCase()), iterations: 310000 },
    key, 256
  );
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function lokalesProfil() {
  let ch = {};
  try { ch = JSON.parse(store.get("characterSettings") || "{}"); } catch {}
  const p = {};
  if (typeof ch.name === "string" && ch.name) p.name = ch.name.slice(0, 20);
  if (/^#[0-9a-f]{6}$/i.test(ch.color || "")) p.color = ch.color;
  if (LOOK_FELDER.some(k => ch[k])) Object.assign(p, bereinigeLook(ch));
  const settings = {};
  const lang = store.get("wg-lang");
  if (lang === "de" || lang === "en") settings.lang = lang;
  const v = store.get("bastelkarre-verbrauch");
  if (v === "0" || v === "1") settings.verbrauch = v === "1";
  if (Object.keys(settings).length) p.settings = settings;
  return p;
}

function profilUebernehmen(p) {
  const vorher = JSON.stringify(lokalesProfil());
  if (p.name || p.color || LOOK_FELDER.some(k => p[k])) {
    let ch = {};
    try { ch = JSON.parse(store.get("characterSettings") || "{}"); } catch {}
    if (p.name) ch.name = p.name;
    if (p.color) ch.color = p.color;
    for (const k of LOOK_FELDER) if (p[k]) ch[k] = p[k];
    store.set("characterSettings", JSON.stringify(ch));
  }
  if (p.settings?.lang) store.set("wg-lang", p.settings.lang);
  if (typeof p.settings?.verbrauch === "boolean") store.set("bastelkarre-verbrauch", p.settings.verbrauch ? "1" : "0");
  return JSON.stringify(lokalesProfil()) !== vorher;
}

function dateiSpeichern(titel, jsonText) {
  const name = String(titel || "fahrzeug").toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "fahrzeug";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([jsonText], { type: "application/json" }));
  link.download = `bastelkarre-${name}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

let hooks = { getPlan: () => null, setPlan: () => {} };
let hud, knopf, dialog, inhalt;
let garage = [];
let seite = false;
let meinProfil = { bio: "", created: 0 };
let freundeSet = new Set();

let blockiertSet = new Set();

async function ladeBlockiert() {
  if (!angemeldet()) { blockiertSet = new Set(); return; }
  try {
    blockiertSet = new Set((await anfrage("GET", "/blocks")).blocked.map(n => n.toLowerCase()));
  } catch {}
}

async function ladeFreunde() {
  if (!angemeldet()) { freundeSet = new Set(); return null; }
  try {
    const f = await anfrage("GET", "/friends");
    freundeSet = new Set(f.friends.map(n => n.toLowerCase()));
    return f;
  } catch {
    return null;
  }
}

const angemeldet = () => !!store.get(TOKEN_KEY);

function abmelden(server = true) {
  if (server) anfrage("POST", "/logout").catch(() => {});
  store.del(TOKEN_KEY);
  store.del(USER_KEY);
  store.del("krox-admin");
  store.del(SYNC_KEY);
  garage = [];
  blockiertSet = new Set();
  freundeSet = new Set();
  aktualisiereKnopf();
  if (dialog?.open) zeige();
}

function aktualisiereKnopf() {
  if (!knopf) return;
  const u = store.get(USER_KEY);
  knopf.textContent = u ? `👤 ${u}` : "👤";
  knopf.title = u ? L("Konto", "Account") : L("Anmelden – Fortschritt auf allen Geräten", "Sign in – use your builds on all devices");
}

let neuLaden = false;
const ohneName = () => { try { return !JSON.parse(store.get("characterSettings") || "{}").name; } catch { return true; } };

async function nachAnmeldung(daten, frisch) {
  neuLaden = ohneName();
  try {
    if (daten.warnung && daten.warnung.n > 0) sessionStorage.setItem(WARN_KEY, JSON.stringify(daten.warnung));
    else sessionStorage.removeItem(WARN_KEY);
  } catch {}
  store.set(TOKEN_KEY, daten.token);
  store.set(USER_KEY, daten.username);
  aktualisiereKnopf();
  return abgleichen(frisch);
}

async function abgleichen(frisch = false) {
  let me;
  try {
    me = await anfrage("GET", "/me");
  } catch {
    return false;
  }
  store.set(USER_KEY, me.username);
  meinProfil = { bio: me.bio || "", created: me.created || 0 };
  ladeFreunde();
  ladeBlockiert();
  me.admin ? store.set("krox-admin", "1") : store.del("krox-admin");
  garage = me.garage.filter(g => g.slot !== "auto");
  aktualisiereKnopf();

  const lokal = lokalesProfil();
  const hl = JSON.stringify(lokal);
  const letzter = store.get(SYNC_KEY);
  const cloudLeer = !me.profile || !Object.keys(me.profile).length;
  if (cloudLeer || (!frisch && letzter !== null && letzter !== hl)) {
    if (Object.keys(lokal).length) {
      try { await anfrage("PUT", "/profile", { profile: lokal }); } catch {}
    }
    store.set(SYNC_KEY, hl);
  } else {
    const geaendert = profilUebernehmen(me.profile);
    store.set(SYNC_KEY, JSON.stringify(lokalesProfil()));
    if (geaendert) { location.reload(); return true; }
  }

  if (seite) return false;
  if (me.garage.some(g => g.slot === "auto")) {
    try {
      const cloud = await anfrage("GET", "/garage/auto");
      const lokalPlan = JSON.stringify(hooks.getPlan());
      if (cloud.data !== lokalPlan) {
        if (frisch && !confirm(L("In deinem Konto ist ein gespeichertes Fahrzeug. Dieses Gerät damit ersetzen?", "Your account has a saved vehicle. Replace the one on this device with it?"))) {
          planSpeichernJetzt();
        } else if (frisch || cloud.updated > (Number(store.get("krox-plan-t")) || 0)) {
          hooks.setPlan(cloud.data);
          store.set("krox-plan-t", String(cloud.updated));
        } else {
          planSpeichernJetzt();
        }
      }
    } catch {}
  } else if (hooks.getPlan()) {
    planSpeichernJetzt();
  }
  return false;
}

let planTimer = null;
function planSpeichern() {
  if (!angemeldet()) return;
  clearTimeout(planTimer);
  planTimer = setTimeout(planSpeichernJetzt, 4000);
}
async function planSpeichernJetzt() {
  if (!angemeldet()) return;
  try {
    const r = await anfrage("PUT", "/garage/auto", { name: "Auto", data: JSON.stringify(hooks.getPlan()) });
    store.set("krox-plan-t", String(r.updated));
  } catch {}
}

function el(tag, props = {}, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e[k] = v;
  }
  for (const k of kinder) e.append(k);
  return e;
}

let modus = "login";
let hinweis = "";
let hinweisArt = "";
let code = null;

function zeige() {
  inhalt.replaceChildren();
  if (!seite) inhalt.append(el("button", { type: "button", class: "kontoZu", textContent: "✕", ariaLabel: L("Schließen", "Close"), onclick: () => dialog.close() }));
  const warnung = angemeldet() ? warnungLesen() : null;
  if (warnung) {
    inhalt.append(el("div", { class: "kontoMeldung fehler kontoWarnung", role: "alert" },
      el("b", { textContent: "⚠ " + L("Achtung: Fehlversuche", "Warning: failed attempts") }),
      el("span", { textContent: warnungText(warnung) }),
      el("button", { type: "button", textContent: L("Verstanden", "Got it"), onclick: () => { try { sessionStorage.removeItem(WARN_KEY); } catch {} zeige(); } })));
  }

  if (code) zeigeCode();
  else if (angemeldet()) zeigeKonto();
  else zeigeFormular();
  if (!seite) inhalt.append(el("p", { class: "seitenFuss" }, el("a", { href: "datenschutz.html", target: "_blank", rel: "noopener", textContent: L("Datenschutz", "Privacy") }), " · ", el("a", { href: "lizenzen.html", target: "_blank", rel: "noopener", textContent: L("Lizenzen", "Licences") })));
}

function meldung() {
  return hinweis ? el("p", { class: "kontoMeldung " + hinweisArt, textContent: hinweis }) : "";
}

function setzeHinweis(text, art = "fehler") {
  hinweis = text;
  hinweisArt = art;
  zeige();
}

function charakterEditor() {
  let ch = {};
  try { ch = JSON.parse(store.get("characterSettings") || "{}"); } catch {}
  const z = { name: ch.name || "", color: /^#[0-9a-f]{6}$/i.test(ch.color || "") ? ch.color : "#62e6b2", ...bereinigeLook(ch) };
  const standardName = () => store.get(USER_KEY) || L("Gast", "Guest");
  const melden = () => window.dispatchEvent(new CustomEvent("krox-look", { detail: { name: z.name.trim() || standardName(), color: z.color, look: bereinigeLook(z) } }));

  const name = el("input", { type: "text", maxLength: 20, placeholder: standardName(), value: z.name, ariaLabel: L("Spielername", "Player name") });
  name.addEventListener("input", () => { z.name = name.value; melden(); });
  const farbe = el("input", { type: "color", value: z.color, ariaLabel: L("Kleidungsfarbe", "Clothing colour") });
  farbe.addEventListener("input", () => { z.color = farbe.value; melden(); });

  const auswahl = (feld, liste, beschriftung) => {
    const sel = el("select", { ariaLabel: beschriftung });
    for (const v of liste) sel.append(el("option", { value: v, textContent: L(...NAMEN[v]), selected: z[feld] === v }));
    sel.addEventListener("change", () => { z[feld] = sel.value; melden(); });
    const label = el("label", { class: "feld" }, el("span", { textContent: beschriftung }), sel);
    label.sel = sel;
    return label;
  };
  const farben = (feld, liste, beschriftung) => {
    const reihe = el("div", { class: "farbReihe" });
    const knoepfe = liste.map(c => {
      const b = el("button", { type: "button", class: "farbKnopf" + (z[feld] === c ? " an" : ""), style: `background:${c}`, ariaLabel: c });
      b.addEventListener("click", () => { z[feld] = c; knoepfe.forEach(k => k.classList.toggle("an", k === b)); melden(); });
      reihe.append(b);
      return b;
    });
    return el("div", { class: "feld" }, el("span", { textContent: beschriftung }), reihe);
  };

  const koerperAuswahl = auswahl("koerper", KOERPER, L("Figur", "Body"));
  const mundAuswahl = auswahl("mund", MUND, L("Mund", "Mouth"));
  koerperAuswahl.sel.addEventListener("change", () => {
    z.mund = z.koerper === "og" ? "keiner" : "laecheln";
    mundAuswahl.sel.value = z.mund;
    melden();
  });
  const speichern = el("button", { type: "submit", class: "primaer", textContent: L("Speichern", "Save") });
  const form = el("form", { class: "kontoForm", onsubmit: async e => {
    e.preventDefault();
    const neu = { ...ch, ...bereinigeLook(z), color: z.color };
    const n = z.name.trim().slice(0, 20);
    if (n) neu.name = n; else delete neu.name;
    store.set("characterSettings", JSON.stringify(neu));
    if (angemeldet()) await abgleichen(false);
    setzeHinweis(L("Gespeichert. Im Spiel gilt das Aussehen ab dem nächsten Beitritt.", "Saved. In the game it applies from your next join."), "ok");
  } },
    el("div", { class: "kontoCharakter" }, name, farbe),
    koerperAuswahl,
    auswahl("kleidung", KLEIDUNG, L("Kleidung", "Clothing")),
    auswahl("frisur", FRISUREN, L("Frisur", "Hairstyle")),
    mundAuswahl,
    farben("haar", HAARFARBEN, L("Haarfarbe", "Hair colour")),
    farben("haut", HAUTFARBEN, L("Hautfarbe", "Skin tone")),
    speichern);
  setTimeout(melden, 0);
  return el("div", { class: "kontoBox", id: "charakter" },
    el("h3", { textContent: L("Charakter", "Character") }), form,
    el("p", { class: "kontoInfo", textContent: L("Name und Aussehen sehen alle im Raum. Ohne Namen wird dein Kontoname benutzt, sonst „Gast“.", "Everyone in the room sees your name and look. Without a name your account name is used, otherwise “Guest”.") }));
}

function charakterBox() {
  if (seite) return charakterEditor();
  return el("div", { class: "kontoBox" },
    el("h3", { textContent: L("Spielfigur", "Player") }),
    el("a", { class: "kontoSeite", href: "konto.html#charakter", textContent: L("Name, Kleidung und Frisur im Konto anpassen →", "Customise name, clothing and hairstyle in your account →") }));
}

function zeigeFormular() {
  const titel = { login: L("Anmelden", "Sign in"), register: L("Konto erstellen", "Create account"), recover: L("Passwort zurücksetzen", "Reset password") }[modus];
  const name = el("input", { type: "text", name: "username", autocomplete: "username", maxLength: 20, required: true, placeholder: L("Benutzername", "Username"), autocapitalize: "none", spellcheck: false });
  const pw = el("input", { type: "password", name: "password", autocomplete: modus === "login" ? "current-password" : "new-password", required: true, minLength: modus === "login" ? 1 : 8, placeholder: modus === "recover" ? L("Neues Passwort", "New password") : L("Passwort", "Password") });
  const felder = [name];
  let rec = null, pw2 = null;
  if (modus === "recover") {
    rec = el("input", { type: "text", name: "recovery", autocomplete: "off", required: true, placeholder: L("Wiederherstellungscode", "Recovery code"), spellcheck: false });
    felder.push(rec);
  }
  felder.push(pw);
  if (modus !== "login") {
    pw2 = el("input", { type: "password", autocomplete: "new-password", required: true, minLength: 8, placeholder: L("Passwort wiederholen", "Repeat password") });
    felder.push(pw2);
  }
  const absenden = el("button", { type: "submit", class: "primaer", textContent: titel });
  const form = el("form", {
    class: "kontoForm",
    onsubmit: async e => {
      e.preventDefault();
      const u = name.value.trim().toLowerCase();
      if (pw2 && pw.value !== pw2.value) return setzeHinweis(L("Die Passwörter stimmen nicht überein.", "The passwords do not match."));
      if (pw2 && pw.value.length < 8) return setzeHinweis(L("Das Passwort braucht mindestens 8 Zeichen.", "The password needs at least 8 characters."));
      absenden.disabled = true;
      absenden.textContent = L("Einen Moment …", "One moment …");
      try {
        const key = await schluessel(pw.value, u);
        if (modus === "login") {
          const d = await anfrage("POST", "/login", { username: u, key }, null);
          hinweis = "";
          if (await nachAnmeldung(d, true)) return;
        } else if (modus === "register") {
          const d = await anfrage("POST", "/register", { username: u, key }, null);
          code = d.recovery;
          hinweis = "";
          await nachAnmeldung(d, false);
        } else {
          const d = await anfrage("POST", "/recover", { username: u, recovery: rec.value, newKey: key }, null);
          code = d.recovery;
          hinweis = "";
          if (await nachAnmeldung(d, true)) return;
        }
        if (!code && neuLaden) return location.reload();
        zeige();
      } catch (err) {
        setzeHinweis(err.message === "netz" ? fehlerText("") : fehlerText(err.message, err.data));
      }
    }
  }, ...felder, absenden);

  const wechsel = (m, text) => el("button", { type: "button", class: "link", textContent: text, onclick: () => { modus = m; hinweis = ""; zeige(); } });
  inhalt.append(
    el("h2", { textContent: titel }),
    el("p", { class: "kontoInfo", textContent: modus === "login"
      ? L("Ein Konto ist freiwillig. Es speichert Name, Farbe, Einstellungen und deine Fahrzeuge, damit du sie auf jedem Gerät nutzen kannst.", "An account is optional. It stores your name, colour, settings and vehicles so you can use them on any device.")
      : modus === "register"
        ? L("Keine E-Mail nötig. Du bekommst einen Wiederherstellungscode – bewahre ihn gut auf, sonst ist das Konto bei vergessenem Passwort verloren.", "No email needed. You will get a recovery code – keep it safe, or the account is lost if you forget the password.")
        : L("Gib deinen Benutzernamen und den Wiederherstellungscode ein und wähle ein neues Passwort.", "Enter your username and recovery code, then choose a new password.") }),
    meldung(), form,
    el("div", { class: "kontoLinks" },
      ...(modus === "login"
        ? [wechsel("register", L("Neues Konto erstellen", "Create an account")), wechsel("recover", L("Passwort vergessen?", "Forgot password?"))]
        : [wechsel("login", L("Zurück zur Anmeldung", "Back to sign in"))])),
    charakterBox()
  );
}

function zeigeCode() {
  const kopieren = el("button", { type: "button", textContent: L("Kopieren", "Copy"), onclick: async () => {
    try { await navigator.clipboard.writeText(code); kopieren.textContent = L("Kopiert ✓", "Copied ✓"); } catch {}
  } });
  inhalt.append(
    el("h2", { textContent: L("Dein Wiederherstellungscode", "Your recovery code") }),
    el("p", { class: "kontoInfo", textContent: L("Schreibe ihn auf oder speichere ihn im Passwortmanager. Er wird nur jetzt angezeigt. Wer ihn hat, kann das Passwort zurücksetzen.", "Write it down or save it in a password manager. It is shown only now. Anyone who has it can reset the password.") }),
    el("div", { class: "kontoCode", textContent: code }),
    el("div", { class: "kontoLinks" }, kopieren,
      el("button", { type: "button", class: "primaer", textContent: L("Ich habe ihn gesichert", "I have saved it"), onclick: () => { code = null; if (neuLaden) location.reload(); else zeige(); } }))
  );
}

const sterneText = (avg, n) => (n ? `★ ${avg.toFixed(1)} (${n})` : L("noch keine Bewertung", "no ratings yet"));

function profilBox() {
  const name = store.get(USER_KEY) || "";
  const bio = el("textarea", { maxLength: 200, rows: 3, placeholder: L("Erzähl etwas über dich (max. 200 Zeichen) – sichtbar für alle", "Tell something about yourself (max. 200 characters) – visible to everyone"), value: meinProfil.bio || "" });
  const form = el("form", { class: "kontoForm", onsubmit: async e => {
    e.preventDefault();
    try {
      const r = await anfrage("PUT", "/bio", { bio: bio.value });
      meinProfil.bio = r.bio;
      setzeHinweis(L("Gespeichert.", "Saved."), "ok");
    } catch (err) { setzeHinweis(fehlerText(err.message)); }
  } }, bio, el("button", { type: "submit", textContent: L("Bio speichern", "Save bio") }));
  return el("div", { class: "kontoBox" },
    el("h3", { textContent: L("Öffentliches Profil", "Public profile") }),
    el("p", { class: "kontoInfo" }, L("Dabei sind sichtbar: Benutzername, Bio, Beitrittsdatum und deine veröffentlichten Fahrzeuge. ", "Visible: username, bio, join date and your published vehicles. "),
      el("a", { href: `profil.html?u=${encodeURIComponent(name)}`, textContent: L("Profilseite ansehen →", "View profile page →") })),
    form);
}

function freundeBox() {
  const box = el("div", { class: "kontoBox" }, el("h3", { textContent: L("Freunde", "Friends") }));
  const innen = el("div", { class: "kontoBox" }, el("p", { class: "kontoInfo", textContent: L("Lade …", "Loading …") }));
  box.append(innen);

  const aktion = async (m, pfad, body) => {
    try { await anfrage(m, pfad, body); await fuelle(); } catch (e) { setzeHinweis(fehlerText(e.message)); }
  };
  const profilLink = n => el("a", { href: `profil.html?u=${encodeURIComponent(n)}`, textContent: n });
  const fuelle = async () => {
    const f = await ladeFreunde();
    if (!f) { innen.replaceChildren(el("p", { class: "kontoInfo", textContent: fehlerText("") })); return; }
    const teile = [];
    if (f.incoming.length) {
      teile.push(el("h4", { textContent: L("Anfragen an dich", "Requests to you") }),
        el("ul", { class: "kontoGarage" }, ...f.incoming.map(n => el("li", {}, el("span", {}, profilLink(n)),
          el("button", { type: "button", class: "primaer", textContent: L("Annehmen", "Accept"), onclick: () => aktion("POST", "/friends/accept", { name: n }) }),
          el("button", { type: "button", textContent: L("Ablehnen", "Decline"), onclick: () => aktion("POST", "/friends/decline", { name: n }) })))));
    }
    teile.push(el("ul", { class: "kontoGarage" },
      ...(f.friends.length ? f.friends.map(n => el("li", {}, el("span", {}, "★ ", profilLink(n)),
        el("button", { type: "button", textContent: L("Entfernen", "Remove"), onclick: () => { if (confirm(L(`${n} aus den Freunden entfernen?`, `Remove ${n} from your friends?`))) aktion("DELETE", "/friends/" + encodeURIComponent(n)); } })))
        : [el("li", { class: "leer", textContent: L("Noch keine Freunde. Such unten einen Namen oder klick im Spiel auf einen Spieler.", "No friends yet. Search a name below or click a player in the game.") })]
      )));
    if (f.outgoing.length) {
      teile.push(el("h4", { textContent: L("Gesendete Anfragen", "Sent requests") }),
        el("ul", { class: "kontoGarage" }, ...f.outgoing.map(n => el("li", {}, el("span", {}, profilLink(n)),
          el("button", { type: "button", textContent: L("Zurückziehen", "Cancel"), onclick: () => aktion("DELETE", "/friends/" + encodeURIComponent(n)) })))));
    }
    const nameFeld = el("input", { type: "text", maxLength: 20, placeholder: L("Benutzername", "Username"), autocapitalize: "none", spellcheck: false, required: true });
    teile.push(el("form", { class: "kontoCharakter", onsubmit: async e => {
      e.preventDefault();
      try {
        const r = await anfrage("POST", "/friends/request", { name: nameFeld.value.trim() });
        await fuelle();
        hinweis = r.friend === "friends" ? L("Ihr seid jetzt befreundet.", "You are now friends.") : L("Anfrage gesendet.", "Request sent.");
        hinweisArt = "ok";
      } catch (err) { setzeHinweis(fehlerText(err.message)); }
    } }, nameFeld, el("button", { type: "submit", textContent: L("Anfrage senden", "Send request") })));
    innen.replaceChildren(...teile);
  };
  fuelle();
  return box;
}

function blockBox() {
  const liste = el("ul", { class: "kontoGarage" });
  const fuelle = async () => {
    await ladeBlockiert();
    liste.replaceChildren(...(blockiertSet.size ? [...blockiertSet].sort().map(n => el("li", {},
      el("span", {}, el("a", { href: `profil.html?u=${encodeURIComponent(n)}`, textContent: n })),
      el("button", { type: "button", textContent: L("Aufheben", "Unblock"), onclick: async () => {
        try { await anfrage("DELETE", "/blocks/" + encodeURIComponent(n)); await fuelle(); } catch (e) { setzeHinweis(fehlerText(e.message)); }
      } })))
      : [el("li", { class: "leer", textContent: L("Du hast niemanden blockiert.", "You have not blocked anyone.") })]));
  };
  fuelle();
  return el("div", { class: "kontoBox" }, el("h3", { textContent: L("Blockierte Konten", "Blocked accounts") }), liste,
    el("p", { class: "kontoInfo", textContent: L("Von blockierten Konten siehst du keine Chatnachrichten und keine Fahrzeuge; sie können dir keine Freundschaftsanfragen schicken.", "You see no chat messages or vehicles from blocked accounts, and they cannot send you friend requests.") }));
}

function fahrzeugeBox() {
  const liste = el("ul", { class: "kontoGarage" }, el("li", { class: "leer", textContent: L("Lade …", "Loading …") }));
  anfrage("GET", "/models/mine").then(d => {
    liste.replaceChildren(...(d.models.length ? d.models.map(m => el("li", {},
      el("span", { textContent: m.title }),
      el("small", { textContent: `${m.status === "approved" ? sterneText(m.avg, m.n) + " · ⬇ " + m.downloads : L("In Prüfung", "In review")}` })))
      : [el("li", { class: "leer", textContent: L("Noch nichts hochgeladen. Im 📦-Dialog im Spiel kannst du Fahrzeuge veröffentlichen.", "Nothing uploaded yet. Use the 📦 dialog in the game to publish vehicles.") })]));
  }).catch(() => liste.replaceChildren(el("li", { class: "leer", textContent: fehlerText("") })));
  return el("div", { class: "kontoBox" }, el("h3", { textContent: L("Meine Fahrzeuge", "My vehicles") }), liste);
}

function zeigeKonto() {
  const liste = el("ul", { class: "kontoGarage" });
  if (!garage.length) liste.append(el("li", { class: "leer", textContent: L("Noch keine gespeicherten Fahrzeuge.", "No saved vehicles yet.") }));
  for (const g of garage) {
    liste.append(el("li", {},
      el("span", { textContent: g.name }),
      el("button", { type: "button", textContent: L("Laden", "Load"), onclick: async () => {
        try {
          const d = await anfrage("GET", "/garage/" + g.slot);
          hooks.setPlan(d.data);
          dialog.close();
        } catch (e) { setzeHinweis(fehlerText(e.message)); }
      } }),
      el("button", { type: "button", textContent: "⭳", title: L("Als Datei speichern", "Save as file"), ariaLabel: L("Als Datei speichern", "Save as file"), onclick: async () => {
        try { const d = await anfrage("GET", "/garage/" + g.slot); dateiSpeichern(g.name, d.data); } catch (e) { setzeHinweis(fehlerText(e.message)); }
      } }),
      el("button", { type: "button", textContent: "🗑", ariaLabel: L("Löschen", "Delete"), onclick: async () => {
        if (!confirm(L(`„${g.name}“ löschen?`, `Delete "${g.name}"?`))) return;
        try { await anfrage("DELETE", "/garage/" + g.slot); garage = garage.filter(x => x.slot !== g.slot); zeige(); } catch (e) { setzeHinweis(fehlerText(e.message)); }
      } })));
  }
  const nameFeld = el("input", { type: "text", maxLength: 30, placeholder: L("Name für das Fahrzeug", "Name for this vehicle") });
  const speichern = el("form", { class: "kontoSpeichern", onsubmit: async e => {
    e.preventDefault();
    const name = nameFeld.value.trim() || L("Fahrzeug", "Vehicle");
    const frei = Array.from({ length: 11 }, (_, i) => "s" + (i + 1)).find(s => !garage.some(g => g.slot === s));
    if (!frei) return setzeHinweis(fehlerText("garage_voll"));
    try {
      const r = await anfrage("PUT", "/garage/" + frei, { name, data: JSON.stringify(hooks.getPlan()) });
      garage.push({ slot: frei, name: r.name, updated: r.updated });
      setzeHinweis(L("Gespeichert.", "Saved."), "ok");
    } catch (err) { setzeHinweis(fehlerText(err.message)); }
  } }, nameFeld, el("button", { type: "submit", textContent: L("Aktuelles Fahrzeug speichern", "Save current vehicle") }));

  const passwortAendern = async () => {
    const u = store.get(USER_KEY);
    const alt = prompt(L("Aktuelles Passwort:", "Current password:"));
    if (!alt) return;
    const neu = prompt(L("Neues Passwort (mindestens 8 Zeichen):", "New password (at least 8 characters):"));
    if (!neu) return;
    if (neu.length < 8) return setzeHinweis(L("Das Passwort braucht mindestens 8 Zeichen.", "The password needs at least 8 characters."));
    try {
      await anfrage("POST", "/password", { key: await schluessel(alt, u), newKey: await schluessel(neu, u) });
      setzeHinweis(L("Passwort geändert. Andere Geräte wurden abgemeldet.", "Password changed. Other devices were signed out."), "ok");
    } catch (e) { setzeHinweis(fehlerText(e.message)); }
  };
  const kontoLoeschen = async () => {
    const u = store.get(USER_KEY);
    const pw = prompt(L("Konto endgültig löschen? Zur Bestätigung Passwort eingeben:", "Delete the account permanently? Enter your password to confirm:"));
    if (!pw) return;
    try {
      await anfrage("POST", "/delete", { key: await schluessel(pw, u) });
      abmelden(false);
      setzeHinweis(L("Das Konto wurde gelöscht.", "The account was deleted."), "ok");
    } catch (e) { setzeHinweis(fehlerText(e.message)); }
  };

  inhalt.append(
    el("h2", { textContent: `👤 ${store.get(USER_KEY) || ""}` }),
    el("p", { class: "kontoInfo", textContent: L("Name, Farbe, Einstellungen und das zuletzt gebaute Fahrzeug werden automatisch synchronisiert.", "Name, colour, settings and your latest build sync automatically.") }),
    meldung(),
    seite ? "" : el("a", { class: "kontoSeite", href: "konto.html", textContent: L("Konto verwalten: Profil, Freunde, Fahrzeuge →", "Manage account: profile, friends, vehicles →") }),
    (seite && store.get("krox-admin") === "1") ? el("a", { class: "kontoSeite", href: "moderation.html", textContent: L("🛡 Moderation öffnen →", "🛡 Open moderation →") }) : "",
    ...(seite ? [profilBox(), freundeBox(), blockBox(), fahrzeugeBox()] : []),
    charakterBox(),
    el("h3", { textContent: L("Garage", "Garage") }), liste, speichern,
    el("div", { class: "kontoLinks" },
      el("button", { type: "button", class: "link", textContent: L("Passwort ändern", "Change password"), onclick: passwortAendern }),
      el("button", { type: "button", class: "link", textContent: L("Konto löschen", "Delete account"), onclick: kontoLoeschen }),
      el("button", { type: "button", textContent: L("Abmelden", "Sign out"), onclick: () => abmelden() }))
  );
}

function baueOberflaeche() {
  hud = document.getElementById("hud");
  if (!hud) return;
  knopf = el("button", { type: "button", id: "kontoBtn", onclick: () => {
    hinweis = "";
    zeige();
    dialog.showModal();
    if (angemeldet()) abgleichen(false);
  } });
  const sprache = document.getElementById("langBtn");
  hud.insertBefore(knopf, sprache || null);

  inhalt = el("div", { class: "kontoInhalt" });
  dialog = el("dialog", { id: "kontoDialog" }, inhalt);
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
  aktualisiereKnopf();
}

function einbetten(container) {
  seite = true;
  inhalt = container;
  dialog = { open: true, close: () => { location.href = "index.html"; } };
  zeige();
  if (angemeldet()) abgleichen(false).then(() => { if (angemeldet()) zeige(); });
}

export const Konto = {
  einbetten,
  freunde: () => freundeSet,
  ladeFreunde,
  async ticket() {
    if (!angemeldet()) return null;
    try { return (await anfrage("POST", "/ticket")).ticket; } catch { return null; }
  },
  start(h) {
    hooks = h;
    baueOberflaeche();
    if (angemeldet()) abgleichen(false);
  },
  planGeaendert: planSpeichern,
  anfrage: (m, p, b) => anfrage(m, p, b),
  angemeldet,
  istAdmin: () => store.get("krox-admin") === "1",
  benutzer: () => store.get(USER_KEY),
  plan: () => hooks.getPlan(),
  planSetzen: t => hooks.setPlan(t),
  fehlerText,
  warnungText: () => { const w = angemeldet() ? warnungLesen() : null; return w ? "⚠ " + warnungText(w) : null; },
  basis: BASE,
  blockiert: () => blockiertSet,
  ladeBlockiert,
  async blockieren(name) {
    await anfrage("POST", "/blocks", { name });
    blockiertSet.add(String(name).toLowerCase());
    await ladeFreunde();
  },
  async entblocken(name) {
    await anfrage("DELETE", "/blocks/" + encodeURIComponent(name));
    blockiertSet.delete(String(name).toLowerCase());
  },
  dateiSpeichern,
  oeffneKonto: () => knopf?.click()
};
