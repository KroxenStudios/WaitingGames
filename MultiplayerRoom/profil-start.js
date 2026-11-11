import { zeigeProfil } from "./profil.js";
import { Konto } from "./accounts.js";
document.getElementById("langBtn").onclick = () => WG.set(WG.lang === "en" ? "de" : "en");
const name = (new URLSearchParams(location.search).get("u") || "").trim();
const app = document.getElementById("app");
if (name) {
  document.title = `${name} – Bastelkarre`;
  zeigeProfil(app, name, {
    onLaden: async m => {
      try {
        const d = await Konto.anfrage("POST", `/models/${m.id}/download`);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([d.data], { type: "application/json" }));
        a.download = `bastelkarre-${m.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "fahrzeug"}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } catch (e) { alert(Konto.fehlerText(e.message)); }
    }
  });
} else {
  app.textContent = WG.L("Kein Benutzer angegeben.", "No user given.");
}
