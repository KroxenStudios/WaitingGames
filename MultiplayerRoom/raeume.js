// raumwahl: fünf öffentliche räume mit belegung und private räume per name (einladungslink).
// das spiel (spiel.js) bleibt für die verbindung zuständig und bekommt nur den neuen raumnamen gemeldet.
import { el } from "./profil.js";

const L = (de, en) => (window.WG ? WG.L(de, en) : de);

export const OEFFENTLICH = ["r1", "r2", "r3", "r4", "r5"];
export const raumTitel = id => (OEFFENTLICH.includes(id) ? `${L("Raum", "Room")} ${id.slice(1)}` : `🔒 ${id.slice(2)}`);

// gültiger raumname (wie im server): öffentlich oder "p-" plus 3 bis 24 zeichen a-z, 0-9, -
export function raumName(v) {
  const r = String(v || "").trim().toLowerCase();
  if (OEFFENTLICH.includes(r) || /^p-[a-z0-9-]{3,24}$/.test(r)) return r;
  return null;
}

// httpbasis: z. b. https://bastelkarre-online.kroxenstudios.workers.dev
export function startRaeume({ httpBasis, aktuell, wechseln }) {
  const hud = document.getElementById("hud");
  if (!hud) return { aktualisiere() {} };

  const knopf = el("button", { type: "button", id: "raumBtn", title: L("Raum wechseln", "Change room"), onclick: () => oeffnen() });
  hud.insertBefore(knopf, document.getElementById("modelleBtn") || document.getElementById("kontoBtn") || document.getElementById("langBtn") || null);

  const inhalt = el("div", { class: "kontoInhalt" });
  const dialog = el("dialog", { id: "raumDialog" }, inhalt);
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);

  const beschriftung = () => { knopf.textContent = `🚪 ${raumTitel(aktuell())}`; };
  beschriftung();

  async function ladeBelegung() {
    try {
      const r = await fetch(`${httpBasis}/rooms`, { signal: AbortSignal.timeout(8000) });
      return (await r.json()).rooms;
    } catch {
      return null;
    }
  }

  async function oeffnen() {
    zeige(null, "");
    dialog.showModal();
    const rooms = await ladeBelegung();
    zeige(rooms, rooms ? "" : L("Die Belegung ist gerade nicht abrufbar.", "Occupancy is not available right now."));
  }

  async function wahl(id) {
    dialog.close();
    await wechseln(id);   // prüft zuerst, ob der raum voll ist
    beschriftung();
  }

  function zeige(rooms, hinweis) {
    const liste = el("ul", { class: "raumListe" });
    for (const id of OEFFENTLICH) {
      const info = rooms?.find(r => r.id === id);
      const voll = !!info && info.count >= info.max;
      const hier = id === aktuell();
      liste.append(el("li", { class: hier ? "hier" : "" },
        el("span", { class: "raumName", textContent: raumTitel(id) }),
        el("span", { class: "raumZahl" + (voll ? " voll" : ""), textContent: info ? `👥 ${info.count}/${info.max}` : "…" }),
        el("button", { type: "button", class: hier ? "" : "primaer", disabled: hier || voll, textContent: hier ? L("Hier", "Here") : voll ? L("Voll", "Full") : L("Beitreten", "Join"), onclick: () => wahl(id) })));
    }

    const privat = el("input", { type: "text", maxLength: 24, placeholder: L("Name des privaten Raums", "Private room name"), autocapitalize: "none", spellcheck: false, required: true });
    const fehler = el("p", { class: "kontoMeldung fehler", hidden: true });
    const form = el("form", { class: "kontoCharakter", onsubmit: e => {
      e.preventDefault();
      const id = raumName("p-" + privat.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""));
      if (!id) { fehler.hidden = false; fehler.textContent = L("Der Name braucht 3 bis 24 Zeichen (Buchstaben, Zahlen, Bindestrich).", "The name needs 3 to 24 characters (letters, numbers, hyphen)."); return; }
      wahl(id);
    } }, privat, el("button", { type: "submit", textContent: L("Beitreten", "Join") }));

    const link = () => `${location.origin}${location.pathname}?raum=${encodeURIComponent(aktuell())}`;
    // kurze nachricht mit link, die man direkt in einen chat einfügen kann
    const einladung = () => {
      const name = raumTitel(aktuell()).replace(/^🔒 /, "");
      return L(`🚗 Komm in meinen Bastelkarre-Raum „${name}“ und fahr mit! ${link()}`, `🚗 Join my Bastelkarre room "${name}" and drive with me! ${link()}`);
    };
    const vorschau = el("p", { class: "meldeKontext", textContent: einladung() });
    const kopieren = el("button", { type: "button", class: "primaer", textContent: L("Einladung kopieren", "Copy invitation"), onclick: async () => {
      try { await navigator.clipboard.writeText(einladung()); kopieren.textContent = L("Kopiert ✓", "Copied ✓"); } catch { prompt(L("Einladung kopieren:", "Copy the invitation:"), einladung()); }
    } });

    inhalt.replaceChildren(
      el("button", { type: "button", class: "kontoZu", textContent: "✕", ariaLabel: L("Schließen", "Close"), onclick: () => dialog.close() }),
      el("h2", { textContent: L("Räume", "Rooms") }),
      el("p", { class: "kontoInfo", textContent: L("Jeder Raum hat bis zu 20 Spieler und eigene Parkplätze. Wechselst du, bleibt dein Fahrzeug erhalten.", "Every room holds up to 20 players with their own parking lots. Your vehicle stays when you switch.") }),
      hinweis ? el("p", { class: "kontoMeldung fehler", textContent: hinweis }) : "",
      liste,
      el("h3", { textContent: L("Privater Raum", "Private room") }),
      form, fehler,
      el("p", { class: "kontoInfo", textContent: L("Wer den Namen kennt, kommt hinein. Teile die Einladung mit Freunden:", "Anyone who knows the name can join. Share the invitation with friends:") }),
      vorschau, kopieren);
  }

  return { aktualisiere: beschriftung, oeffnen };
}
