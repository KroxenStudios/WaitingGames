// öffentliche profile (bio, fahrzeuge, freund hinzufügen) und sterne-anzeige.
// wird von profil.html und vom spieler-popup im spiel benutzt.
import { Konto } from "./accounts.js";

const L = (de, en) => (window.WG ? WG.L(de, en) : de);

export function el(tag, props = {}, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e[k] = v;
  }
  for (const k of kinder) e.append(k);
  return e;
}

const datum = t => (t ? new Date(t).toLocaleDateString(WG?.lang === "en" ? "en-GB" : "de-DE") : "");

// fünf sterne. mit onwahl anklickbar (eigene bewertung hervorgehoben), sonst nur anzeige des durchschnitts.
export function sterne(wert, { onWahl = null, titel = "" } = {}) {
  const box = el("span", { class: "sterne" + (onWahl ? " klickbar" : ""), title: titel });
  const runde = Math.round(wert);
  for (let i = 1; i <= 5; i++) {
    const s = el(onWahl ? "button" : "span", { class: i <= runde ? "an" : "", textContent: "★" });
    if (onWahl) {
      s.type = "button";
      s.ariaLabel = `${i} ${L("von 5 Sternen", "of 5 stars")}`;
      s.addEventListener("click", () => onWahl(i));
    }
    box.append(s);
  }
  return box;
}

export const sterneText = (avg, n) => (n ? `${avg.toFixed(1)} (${n})` : L("noch keine Bewertung", "no ratings yet"));

const GRUENDE = [
  ["beleidigung", "Beleidigung", "Insult"], ["spam", "Spam / Werbung", "Spam / ads"],
  ["unangemessen", "Unangemessener Inhalt", "Inappropriate content"], ["betrug", "Betrug / Täuschung", "Fraud / deception"],
  ["sonstiges", "Sonstiges", "Other"]
];

// melde-dialog. kind: "user" | "chat" | "model" | "bio". die meldung bleibt gespeichert, bis ein moderator sie bearbeitet.
export function oeffneMelden({ kind, name, ref = "", context = "" }) {
  if (!Konto.angemeldet()) { alert(L("Zum Melden musst du angemeldet sein.", "You need to be signed in to report.")); return; }
  const dlg = el("dialog", { class: "meldeDialog" });
  const grund = el("select", { ariaLabel: L("Grund", "Reason") }, ...GRUENDE.map(([v, de, en]) => el("option", { value: v, textContent: L(de, en) })));
  const notiz = el("textarea", { maxLength: 200, rows: 3, placeholder: L("Was ist passiert? (optional)", "What happened? (optional)") });
  const meldung = el("p", { class: "kontoMeldung", hidden: true });
  const senden = el("button", { type: "submit", class: "primaer", textContent: L("Melden", "Report") });
  const form = el("form", { class: "kontoForm", onsubmit: async e => {
    e.preventDefault();
    senden.disabled = true;
    try {
      await Konto.anfrage("POST", "/reports", { kind, name, ref, context, reason: grund.value, note: notiz.value });
      form.replaceChildren(el("p", { class: "kontoMeldung ok", textContent: L("Danke. Ein Moderator prüft die Meldung.", "Thanks. A moderator will review the report.") }),
        el("button", { type: "button", textContent: L("Schließen", "Close"), onclick: () => dlg.close() }));
    } catch (err) {
      senden.disabled = false;
      meldung.hidden = false;
      meldung.className = "kontoMeldung fehler";
      meldung.textContent = Konto.fehlerText(err.message);
    }
  } }, el("label", { class: "feld" }, el("span", { textContent: L("Grund", "Reason") }), grund), notiz, meldung,
    el("div", { class: "kontoLinks" }, el("button", { type: "button", textContent: L("Abbrechen", "Cancel"), onclick: () => dlg.close() }), senden));
  const was = { user: L("das Konto", "the account"), chat: L("eine Chatnachricht von", "a chat message from"), model: L("ein Fahrzeug von", "a vehicle by"), bio: L("die Bio von", "the bio of") }[kind];
  dlg.append(el("div", { class: "kontoInhalt" },
    el("h2", { textContent: L("Melden", "Report") }),
    el("p", { class: "kontoInfo", textContent: `${L("Du meldest", "You are reporting")} ${was} ${name}.` }),
    context ? el("p", { class: "meldeKontext", textContent: `„${context}“` }) : "",
    form));
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  dlg.showModal();
}

// zeichnet das profil von "name" in den container. opts.onladen(modell): optionaler "laden"-knopf je fahrzeug.
export async function zeigeProfil(container, name, opts = {}) {
  container.replaceChildren(el("p", { class: "kontoInfo", textContent: L("Lade …", "Loading …") }));
  let p;
  try {
    p = await Konto.anfrage("GET", `/users/${encodeURIComponent(name)}`);
  } catch (e) {
    container.replaceChildren(el("p", { class: "kontoMeldung fehler", textContent: e.message === "nicht_gefunden" ? L("Dieses Profil gibt es nicht.", "This profile does not exist.") : Konto.fehlerText(e.message) }));
    return;
  }
  const neu = () => zeigeProfil(container, name, opts);
  const tu = async (m, pfad, body) => {
    try { await Konto.anfrage(m, pfad, body); await Konto.ladeFreunde(); neu(); } catch (e) { alert(Konto.fehlerText(e.message)); }
  };

  const kopf = el("div", { class: "profilKopf" },
    el("i", { class: "profilPunkt", style: `background:${p.color || "#62e6b2"}` }),
    el("div", {},
      el("h2", { textContent: p.username + (p.admin ? " ✓" : "") }),
      el("small", { textContent: `${L("Dabei seit", "Member since")} ${datum(p.created)}${p.admin ? " · " + L("Betreiber", "Operator") : ""}` })));

  const freund = [];
  const f = p.friend;
  if (f === "self") freund.push(el("a", { class: "kontoSeite", href: "konto.html", textContent: L("Mein Konto verwalten →", "Manage my account →") }));
  else if (f === null) freund.push(el("p", { class: "kontoInfo", textContent: L("Melde dich an, um Freunde hinzuzufügen und Fahrzeuge zu bewerten.", "Sign in to add friends and rate vehicles.") }));
  else if (f === "none") freund.push(el("button", { type: "button", class: "primaer", textContent: L("➕ Freund hinzufügen", "➕ Add friend"), onclick: () => tu("POST", "/friends/request", { name: p.username }) }));
  else if (f === "pending_out") freund.push(el("span", { class: "kontoInfo", textContent: L("Anfrage gesendet", "Request sent") }), el("button", { type: "button", textContent: L("Zurückziehen", "Cancel"), onclick: () => tu("DELETE", `/friends/${encodeURIComponent(p.username)}`) }));
  else if (f === "pending_in") freund.push(el("button", { type: "button", class: "primaer", textContent: L("Anfrage annehmen", "Accept request"), onclick: () => tu("POST", "/friends/accept", { name: p.username }) }), el("button", { type: "button", textContent: L("Ablehnen", "Decline"), onclick: () => tu("POST", "/friends/decline", { name: p.username }) }));
  else if (f === "friends") freund.push(el("span", { class: "kontoInfo", textContent: "★ " + L("Befreundet", "Friends") }), el("button", { type: "button", textContent: L("Entfernen", "Remove"), onclick: () => { if (confirm(L("Freundschaft beenden?", "End the friendship?"))) tu("DELETE", `/friends/${encodeURIComponent(p.username)}`); } }));

  // blockieren und melden (nicht beim eigenen profil, nur angemeldet)
  const sicherheit = [];
  if (f !== "self" && f !== null) {
    const blockiert = Konto.blockiert().has(p.username.toLowerCase());
    sicherheit.push(el("button", { type: "button", textContent: blockiert ? L("Blockierung aufheben", "Unblock") : L("🚫 Blockieren", "🚫 Block"), onclick: async () => {
      if (!blockiert && !confirm(L(`${p.username} blockieren? Du siehst dann keine Chatnachrichten und Fahrzeuge mehr von diesem Konto.`, `Block ${p.username}? You will no longer see their chat messages and vehicles.`))) return;
      try { blockiert ? await Konto.entblocken(p.username) : await Konto.blockieren(p.username); neu(); } catch (e) { alert(Konto.fehlerText(e.message)); }
    } }));
    sicherheit.push(el("button", { type: "button", textContent: L("⚑ Melden", "⚑ Report"), onclick: () => oeffneMelden({ kind: "user", name: p.username }) }));
    if (p.bio) sicherheit.push(el("button", { type: "button", class: "link", textContent: L("Bio melden", "Report bio"), onclick: () => oeffneMelden({ kind: "bio", name: p.username }) }));
  }
  if (Konto.istAdmin() && f !== "self") sicherheit.push(el("a", { class: "kontoSeite", href: `moderation.html?u=${encodeURIComponent(p.username)}`, textContent: L("Moderation →", "Moderation →") }));

  const liste = el("ul", { class: "modellListe" });
  if (!p.models.length) liste.append(el("li", { class: "leer", textContent: L("Noch keine veröffentlichten Fahrzeuge.", "No published vehicles yet.") }));
  for (const m of p.models) {
    const knoepfe = el("div", { class: "modellKnoepfe" });
    if (opts.onLaden) knoepfe.append(el("button", { type: "button", textContent: L("Laden", "Load"), onclick: () => opts.onLaden(m) }));
    liste.append(el("li", { class: "modell" },
      el("div", { class: "modellText" },
        el("b", { textContent: m.title }),
        el("small", {}, sterne(m.avg), ` ${sterneText(m.avg, m.n)} · ⬇ ${m.downloads} · ${m.parts} ${L("Teile", "parts")}`),
        m.descr ? el("small", { class: "beschr", textContent: m.descr }) : ""),
      knoepfe));
  }

  container.replaceChildren(
    kopf,
    el("p", { class: "profilBio", textContent: p.bio || L("Keine Bio.", "No bio.") }),
    el("div", { class: "profilZahlen" },
      el("span", { textContent: `${p.models.length} ${L("Fahrzeuge", "vehicles")}` }),
      el("span", { textContent: `⬇ ${p.downloads}` }),
      el("span", {}, sterne(p.avg), ` ${sterneText(p.avg, p.n)}`)),
    el("div", { class: "kontoLinks profilFreund" }, ...freund),
    sicherheit.length ? el("div", { class: "kontoLinks profilFreund" }, ...sicherheit) : "",
    el("h3", { textContent: L("Fahrzeuge", "Vehicles") }), liste);
}
