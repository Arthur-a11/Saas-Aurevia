// Extrait les marchés, niches et idées du fichier original (original/creation-sas.html)
// sans rien modifier au texte. Sortie brute : original/donnees-brutes.json
// Usage : node scripts/extraire-donnees.mjs
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../original/creation-sas.html", import.meta.url), "utf8");
const debut = src.indexOf("var SAAS=[");
const fin = src.indexOf("(function(){", debut);
if (debut < 0 || fin < 0) throw new Error("Bloc de données introuvable dans l'original");
const code = src.slice(debut, fin) + "\n;globalThis.__SAAS = SAAS;";
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);
const marches = ctx.__SAAS.map((m) => ({
  nom: m.n,
  pourquoi: m.why,
  niches: m.niches.map((n, j) => ({
    nom: n,
    idees: m.ideas[j].map((s) => {
      const i = s.indexOf(": ");
      return { nom: s.slice(0, i), description: s.slice(i + 2) };
    }),
  })),
}));
writeFileSync(new URL("../original/donnees-brutes.json", import.meta.url), JSON.stringify(marches, null, 2) + "\n");
console.log("Marchés extraits :", marches.length, "| idées :", marches.flatMap((m) => m.niches.flatMap((n) => n.idees)).length);
