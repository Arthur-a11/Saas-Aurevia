// Contrôle des données d'idées. Échoue (code 1) au moindre problème.
// Usage : node scripts/verifier-donnees.mjs
import { readFileSync } from "node:fs";

const D = JSON.parse(readFileSync(new URL("../src/data/marches.json", import.meta.url), "utf8"));
const brut = JSON.parse(readFileSync(new URL("../original/donnees-brutes.json", import.meta.url), "utf8"));
const erreurs = [];
const err = (m) => erreurs.push(m);
// Deux noms sont considérés identiques s'ils ne diffèrent que par les accents, la casse ou un "s" de pluriel.
const cle = (s) => s.replace(/s(?=[A-ZÀ-Ý]|$)/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

if (!/n’est pas une niche validée/.test(D.avertissement)) err("Le message « une idée rédigée n’est pas une niche validée » a disparu.");
if (D.marches.length !== 15) err(`15 marchés attendus, ${D.marches.length} trouvés`);
const noms = new Map(); const idsMarches = new Set(); let total = 0;
D.marches.forEach((m, i) => {
  if (!m.id || idsMarches.has(m.id)) err(`Identifiant de marché manquant ou en double : ${m.id}`);
  idsMarches.add(m.id);
  if (/\d+\s?%/.test(m.pourquoi)) err(`Chiffre non sourcé dans « ${m.nom} »`);
  if (m.niches.length !== 20) err(`${m.nom} : 20 niches attendues, ${m.niches.length}`);
  const idsNiches = new Set();
  m.niches.forEach((n, j) => {
    if (idsNiches.has(n.id)) err(`${m.nom} : identifiant de niche en double ${n.id}`);
    idsNiches.add(n.id);
    if (n.idees.length !== 5) err(`${m.nom} > ${n.nom} : 5 idées attendues, ${n.idees.length}`);
    n.idees.forEach((x, k) => {
      total++;
      if (!/^[^:\s][^:]{1,39}$/.test(x.nom) || /\s/.test(x.nom)) err(`Nom mal formé : « ${x.nom} »`);
      if (!x.description || x.description.includes(": ") || x.description.length < 5) err(`Description mal formée : ${x.nom}`);
      const c = cle(x.nom);
      if (noms.has(c)) err(`Nom en double ou quasi identique : ${x.nom} (${m.nom} > ${n.nom}) et ${noms.get(c)}`);
      noms.set(c, `${x.nom} (${m.nom} > ${n.nom})`);
      // Fidélité à l'original : même description, même place, même nom (sauf renommage tracé).
      const o = brut[i]?.niches[j]?.idees[k];
      if (!o) err(`Idée sans équivalent dans l'original : ${x.nom}`);
      else {
        if (o.description !== x.description) err(`Description modifiée : ${x.nom}`);
        if (o.nom !== x.nom && o.nom !== x.nomOriginal) err(`Nom modifié sans trace : ${o.nom} -> ${x.nom}`);
        if (brut[i].niches[j].nom !== n.nom) err(`Niche renommée : ${brut[i].niches[j].nom}`);
      }
    });
  });
});
if (total !== 1500) err(`1 500 idées attendues, ${total} trouvées`);
if (erreurs.length) { console.error("ÉCHEC du contrôle des données :\n- " + erreurs.join("\n- ")); process.exit(1); }
console.log(`Données OK : ${D.marches.length} marchés, ${D.marches.length * 20} niches, ${total} idées, noms tous distincts, fidèles à l'original.`);
