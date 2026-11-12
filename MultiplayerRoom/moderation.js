import { Konto } from "./accounts.js";
import { el } from "./profil.js";

const L = (de, en) => (window.WG ? WG.L(de, en) : de);
document.getElementById("langBtn").onclick = () => WG.set(WG.lang === "en" ? "de" : "en");
const app = document.getElementById("app");

const GRUND = { beleidigung: ["Beleidigung", "Insult"], spam: ["Spam / Werbung", "Spam / ads"], unangemessen: ["Unangemessener Inhalt", "Inappropriate content"], betrug: ["Betrug / Täuschung", "Fraud / deception"], sonstiges: ["Sonstiges", "Other"] };
const ART = { user: ["Konto", "Account"], chat: ["Chat", "Chat"], model: ["Fahrzeug", "Vehicle"], bio: ["Bio", "Bio"] };
const AKTION = { dismiss: ["verworfen", "dismissed"], mute: ["stummgeschaltet", "muted"], ban: ["gesperrt", "banned"], remove: ["Inhalt entfernt", "content removed"], unmute: ["Stummschaltung aufgehoben", "unmuted"], unban: ["Sperre aufgehoben", "unbanned"] };
const zeit = t => (t ? new Date(t).toLocaleString(WG?.lang === "en" ? "en-GB" : "de-DE", { dateStyle: "short", timeStyle: "short" }) : "");
const profilLink = n => el("a", { href: `profil.html?u=${encodeURIComponent(n)}`, textContent: n, target: "_blank", rel: "noopener" });

let hinweis = null;
function zeigeHinweis(text, art = "ok") {
  hinweis.className = "kontoMeldung " + art;
  hinweis.textContent = text;
  hinweis.hidden = false;
  clearTimeout(zeigeHinweis.t);
  zeigeHinweis.t = setTimeout(() => (hinweis.hidden = true), 5000);
}
async function aktion(fn, nachher) {
  try { await fn(); if (nachher) await nachher(); } catch (e) { zeigeHinweis(Konto.fehlerText(e.message) || L("Fehler", "Error"), "fehler"); }
}

const meldungenBox = el("div", { class: "kontoInhalt" });
async function ladeMeldungen() {
  let d;
  try { d = await Konto.anfrage("GET", "/admin/reports?status=open"); } catch (e) { meldungenBox.replaceChildren(el("p", { class: "kontoMeldung fehler", textContent: Konto.fehlerText(e.message) })); return; }
  const karten = d.reports.map(r => {
    const knoepfe = [
      el("button", { type: "button", textContent: L("Verwerfen", "Dismiss"), onclick: () => bearbeite(r, { action: "dismiss" }) }),
      el("button", { type: "button", textContent: L("Stumm 1 Tag", "Mute 1 day"), onclick: () => bearbeite(r, { action: "mute", days: 1 }) }),
      el("button", { type: "button", textContent: L("Stumm 7 Tage", "Mute 7 days"), onclick: () => bearbeite(r, { action: "mute", days: 7 }) }),
      el("button", { type: "button", textContent: L("Stumm 30 Tage", "Mute 30 days"), onclick: () => bearbeite(r, { action: "mute", days: 30 }) }),
      el("button", { type: "button", textContent: L("Sperren", "Ban"), onclick: () => {
        const grund = prompt(L("Grund für die Sperre (wird nur intern gespeichert):", "Reason for the ban (stored internally only):"), r.reason);
        if (grund !== null) bearbeite(r, { action: "ban", reason: grund });
      } })
    ];
    if (r.kind === "model" || r.kind === "bio") knoepfe.splice(1, 0, el("button", { type: "button", class: "primaer", textContent: L("Inhalt entfernen", "Remove content"), onclick: () => bearbeite(r, { action: "remove" }) }));
    if (r.kind === "model") {
      knoepfe.unshift(el("button", { type: "button", textContent: L("Fahrzeug ansehen (Datei)", "View vehicle (file)"), onclick: () => aktion(async () => {
        const dl = await Konto.anfrage("POST", `/models/${r.ref}/download`);
        Konto.dateiSpeichern(dl.title || r.refTitle || "fahrzeug", dl.data);
      }) }));
    }
    return el("div", { class: "meldeKarte" },
      el("div", { class: "meldeKopf" },
        el("b", { textContent: L(...ART[r.kind]) }),
        el("span", { class: "meldeGrund", textContent: L(...(GRUND[r.reason] || [r.reason, r.reason])) }),
        el("small", { textContent: zeit(r.created) })),
      el("p", { class: "meldeZeile" }, L("Gemeldet: ", "Reported: "), profilLink(r.target),
        r.banned ? el("b", { class: "rot", textContent: " 🚫 " + L("gesperrt", "banned") }) : "",
        r.muted > Date.now() ? el("b", { class: "rot", textContent: " 🔇 " + L("stumm bis ", "muted until ") + zeit(r.muted) }) : "",
        ` · ${r.offen} ${L("offene Meldungen insgesamt", "open reports in total")}`),
      el("p", { class: "meldeZeile" }, L("Gemeldet von: ", "Reported by: "), profilLink(r.reporter)),
      r.kind === "model" ? el("p", { class: "meldeZeile", textContent: `${L("Fahrzeug", "Vehicle")}: ${r.refTitle || "?"}` }) : "",
      r.kind === "bio" ? el("p", { class: "meldeKontext", textContent: r.bio || L("(Bio ist leer)", "(bio is empty)") }) : "",
      r.context ? el("p", { class: "meldeKontext", textContent: `„${r.context}“ — ${L("vom Melder angegeben, nicht geprüft", "stated by the reporter, unverified")}` }) : "",
      r.note ? el("p", { class: "meldeKontext", textContent: r.note }) : "",
      el("div", { class: "modellKnoepfe", style: "justify-content:flex-start" }, ...knoepfe));
  });
  meldungenBox.replaceChildren(
    el("h2", { textContent: `${L("Offene Meldungen", "Open reports")} (${d.reports.length})` }),
    ...(karten.length ? karten : [el("p", { class: "kontoInfo", textContent: L("Keine offenen Meldungen. 🎉", "No open reports. 🎉") })]));
}
async function bearbeite(r, body) {
  await aktion(() => Konto.anfrage("POST", `/admin/reports/${r.id}/resolve`, body), async () => {
    zeigeHinweis(`${r.target}: ${L(...AKTION[body.action])}`);
    await Promise.all([ladeMeldungen(), ladeProtokoll()]);
  });
}

const kontenBox = el("div", { class: "kontoInhalt" });
const suchFeld = el("input", { type: "text", placeholder: L("Benutzername (oder Anfang davon)", "Username (or its beginning)"), autocapitalize: "none", spellcheck: false });
const suchErgebnis = el("div", { class: "kontoBox" });
const nutzerInfo = el("div", { class: "kontoBox" });
kontenBox.append(el("h2", { textContent: L("Konto suchen", "Find account") }),
  el("form", { class: "kontoCharakter", onsubmit: e => { e.preventDefault(); suche(); } }, suchFeld, el("button", { type: "submit", textContent: L("Suchen", "Search") })),
  suchErgebnis, nutzerInfo);

async function suche() {
  await aktion(async () => {
    const d = await Konto.anfrage("GET", `/admin/users?q=${encodeURIComponent(suchFeld.value.trim())}`);
    suchErgebnis.replaceChildren(...(d.users.length ? d.users.map(u => el("button", { type: "button", class: "link", textContent: `${u.name}${u.banned ? " 🚫" : ""}${u.muted > Date.now() ? " 🔇" : ""}`, onclick: () => zeigeNutzer(u.name) })) : [el("p", { class: "kontoInfo", textContent: L("Nichts gefunden.", "Nothing found.") })]));
  });
}
async function zeigeNutzer(name) {
  await aktion(async () => {
    const u = await Konto.anfrage("GET", `/admin/users/${encodeURIComponent(name)}`);
    const wirke = (pfad, body, text) => aktion(() => Konto.anfrage("POST", pfad, body), async () => { zeigeHinweis(`${u.name}: ${text}`); await Promise.all([zeigeNutzer(name), ladeProtokoll(), ladeMeldungen()]); });
    const tage = [1, 7, 30].map(t => el("button", { type: "button", textContent: L(`Stumm ${t} ${t === 1 ? "Tag" : "Tage"}`, `Mute ${t} day${t === 1 ? "" : "s"}`), onclick: () => wirke(`/admin/users/${u.name}/mute`, { days: t }, L(...AKTION.mute)) }));
    nutzerInfo.replaceChildren(
      el("h3", {}, profilLink(u.name)),
      el("p", { class: "kontoInfo", textContent: `${L("Dabei seit", "Member since")} ${zeit(u.created)} · ${u.models} ${L("Fahrzeuge", "vehicles")} · ${u.offen}/${u.gesamt} ${L("Meldungen offen/gesamt", "reports open/total")}` }),
      u.bio ? el("p", { class: "meldeKontext", textContent: u.bio }) : "",
      u.banned ? el("p", { class: "kontoMeldung fehler", textContent: `🚫 ${L("Gesperrt", "Banned")}: ${u.banReason || ""}` }) : "",
      u.muted ? el("p", { class: "kontoMeldung fehler", textContent: `🔇 ${L("Stumm bis", "Muted until")} ${zeit(u.muted)}` }) : "",
      el("div", { class: "modellKnoepfe", style: "justify-content:flex-start" },
        ...tage,
        u.muted ? el("button", { type: "button", textContent: L("Stummschaltung aufheben", "Unmute"), onclick: () => wirke(`/admin/users/${u.name}/unmute`, {}, L(...AKTION.unmute)) }) : "",
        u.banned
          ? el("button", { type: "button", class: "primaer", textContent: L("Sperre aufheben", "Unban"), onclick: () => wirke(`/admin/users/${u.name}/unban`, {}, L(...AKTION.unban)) })
          : el("button", { type: "button", textContent: L("Sperren", "Ban"), onclick: () => { const g = prompt(L("Grund für die Sperre:", "Reason for the ban:"), ""); if (g !== null) wirke(`/admin/users/${u.name}/ban`, { reason: g }, L(...AKTION.ban)); } })));
  });
}

const protokollBox = el("div", { class: "kontoInhalt" });
async function ladeProtokoll() {
  try {
    const [log, erledigt] = await Promise.all([Konto.anfrage("GET", "/admin/log"), Konto.anfrage("GET", "/admin/reports?status=done")]);
    protokollBox.replaceChildren(
      el("h2", { textContent: L("Protokoll", "Log") }),
      el("ul", { class: "kontoGarage" }, ...(log.log.length ? log.log.map(l => el("li", {}, el("span", { textContent: `${zeit(l.t)} · ${l.admin} · ${L(...(AKTION[l.action] || [l.action, l.action]))} · ${l.target}${l.details ? " (" + l.details + ")" : ""}` }))) : [el("li", { class: "leer", textContent: L("Noch keine Einträge.", "No entries yet.") })])),
      el("h3", { textContent: `${L("Zuletzt erledigte Meldungen", "Recently handled reports")} (${erledigt.reports.length})` }),
      el("ul", { class: "kontoGarage" }, ...erledigt.reports.slice(0, 15).map(r => el("li", {}, el("span", { textContent: `${zeit(r.created)} · ${L(...ART[r.kind])} · ${r.target} ← ${r.reporter} · ${L(...(AKTION[r.action] || [r.action, r.action]))}` })))));
  } catch {}
}

async function start() {
  if (!Konto.angemeldet()) {
    app.replaceChildren(el("div", { class: "kontoInhalt" }, el("h2", { textContent: L("Nur für das Moderationskonto", "Moderation account only") }),
      el("p", { class: "kontoInfo", textContent: L("Bitte melde dich an.", "Please sign in.") }), el("a", { class: "kontoSeite", href: "konto.html", textContent: L("Zur Anmeldung →", "To sign-in →") })));
    return;
  }
  let me;
  try { me = await Konto.anfrage("GET", "/me"); } catch { me = null; }
  if (!me?.admin) {
    app.replaceChildren(el("div", { class: "kontoInhalt" }, el("h2", { textContent: L("Kein Zugriff", "No access") }),
      el("p", { class: "kontoInfo", textContent: L("Diese Seite ist nur für das Moderationskonto.", "This page is for the moderation account only.") })));
    return;
  }
  hinweis = el("p", { class: "kontoMeldung ok", hidden: true });
  app.replaceChildren(hinweis, meldungenBox, kontenBox, protokollBox);
  await Promise.all([ladeMeldungen(), ladeProtokoll()]);
  const u = new URLSearchParams(location.search).get("u");
  if (u) { suchFeld.value = u; zeigeNutzer(u); }
}
start();
