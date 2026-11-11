// aussehen der spielfigur: kleidung, frisur, haar- und hautfarbe. die listen stehen auch in den servern
// (krox-accounts und bastelkarre-online), dort wird nur nach dieser weißliste geprüft.

export const KLEIDUNG = ["shirt", "hoodie", "jacke", "top", "overall", "kleid", "anzug", "raumanzug"];
export const FRISUREN = ["kurz", "glatze", "lang", "zopf", "irokese", "afro", "dutt", "muetze"];
export const HAARFARBEN = ["#3b2a22", "#111111", "#c9a15a", "#e6d27a", "#a5441f", "#d0d0d0", "#2f6fdb", "#e0479e"];
export const HAUTFARBEN = ["#f6d5bd", "#f0c4a4", "#d9a07c", "#b97a56", "#8a5a3c", "#5e3b26"];

export const KOERPER = ["neu", "og"];   // og = der alte körper mit fliegenden armen und punktaugen
export const MUND = ["laecheln", "grinsen", "neutral", "offen", "traurig", "keiner"];

export const STANDARD_LOOK = { kleidung: "shirt", frisur: "kurz", haar: HAARFARBEN[0], haut: HAUTFARBEN[1], koerper: "neu", mund: "laecheln" };

export const NAMEN = {
  shirt: ["T-Shirt", "T-shirt"], hoodie: ["Kapuzenpulli", "Hoodie"], jacke: ["Jacke", "Jacket"], top: ["Trägershirt", "Tank top"],
  overall: ["Latzhose", "Dungarees"], kleid: ["Kleid", "Dress"], anzug: ["Anzug", "Suit"], raumanzug: ["Raumanzug", "Space suit"],
  kurz: ["Kurz", "Short"], glatze: ["Glatze", "Bald"], lang: ["Lang", "Long"], zopf: ["Zopf", "Ponytail"],
  irokese: ["Irokese", "Mohawk"], afro: ["Afro", "Afro"], dutt: ["Dutt", "Bun"], muetze: ["Mütze", "Beanie"],
  neu: ["Neu", "New"], og: ["Klassisch (OG)", "Classic (OG)"],
  laecheln: ["Lächeln", "Smile"], grinsen: ["Grinsen", "Grin"], neutral: ["Neutral", "Neutral"], offen: ["Offen", "Open"], traurig: ["Traurig", "Sad"], keiner: ["Kein Mund", "No mouth"]
};

const farbe = v => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);

// macht aus beliebigen eingaben ein gültiges aussehen (vorgaben für alles unbekannte).
export function bereinigeLook(l) {
  const o = l && typeof l === "object" ? l : {};
  return {
    kleidung: KLEIDUNG.includes(o.kleidung) ? o.kleidung : STANDARD_LOOK.kleidung,
    frisur: FRISUREN.includes(o.frisur) ? o.frisur : STANDARD_LOOK.frisur,
    haar: HAARFARBEN.includes(farbe(o.haar)) ? farbe(o.haar) : STANDARD_LOOK.haar,
    haut: HAUTFARBEN.includes(farbe(o.haut)) ? farbe(o.haut) : STANDARD_LOOK.haut,
    koerper: KOERPER.includes(o.koerper) ? o.koerper : STANDARD_LOOK.koerper,
    mund: MUND.includes(o.mund) ? o.mund : STANDARD_LOOK.mund
  };
}

// aus gespeicherten charakter-einstellungen (name, color, kleidung, frisur, haar, haut, koerper, mund)
export const lookAus = ch => bereinigeLook(ch);
