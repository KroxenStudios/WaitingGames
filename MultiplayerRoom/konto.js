import { Konto } from "./accounts.js";
import { startVorschau } from "./vorschau.js";
document.getElementById("langBtn").onclick = () => WG.set(WG.lang === "en" ? "de" : "en");
let ch = {};
try { ch = JSON.parse(localStorage.getItem("characterSettings") || "{}"); } catch {}
const konto = localStorage.getItem("krox-user") || "";
// vorschau zuerst (hört auf die änderungen des editors), dann konto-seite aufbauen
startVorschau(document.getElementById("vorschau3d"), {
  name: ch.name || konto || WG.L("Gast", "Guest"),
  color: /^#[0-9a-f]{6}$/i.test(ch.color || "") ? ch.color : "#62e6b2",
  look: ch
});
Konto.einbetten(document.getElementById("app"));
