// Construit src/data/marches.json à partir de l'extraction brute de l'original.
// - Aucune idée n'est supprimée ni réécrite : seuls certains NOMS en double sont renommés
//   (le nom d'origine est conservé dans le champ "nomOriginal").
// - Les phrases "pourquoi" contenant des chiffres non sourcés sont remplacées
//   (le texte d'origine est conservé dans "pourquoiOriginal").
// Usage : node scripts/construire-donnees.mjs
import { readFileSync, writeFileSync } from "node:fs";

const brut = JSON.parse(readFileSync(new URL("../original/donnees-brutes.json", import.meta.url), "utf8"));

// Identifiants courts des marchés (servent dans les URL) et libellés courts (boutons de l'accueil).
const MARCHES = [
  ["sante", "Santé et bien-être"], ["finance", "Finance et fintech"], ["btp", "Construction et BTP"],
  ["immobilier", "Immobilier"], ["industrie", "Industrie"], ["juridique", "Juridique"],
  ["education", "Éducation"], ["commerce", "Commerce"], ["cybersecurite", "Cybersécurité"],
  ["ia", "IA"], ["agriculture", "Agriculture"], ["ressources-humaines", "Ressources humaines"],
  ["marketing", "Marketing"], ["energie", "Énergie"], ["transport", "Transport"],
];

// Phrases sans chiffre ni classement invérifiable (index du marché -> nouveau texte).
const POURQUOI = {
  0: "Des métiers nombreux et spécialisés, avec beaucoup de tâches administratives : rendez-vous, dossiers, factures.",
  1: "Factures, trésorerie et déclarations : des tâches régulières que beaucoup d’entreprises veulent simplifier.",
  2: "Un secteur où de nombreux devis, plannings et suivis de chantier se font encore sur papier.",
  3: "Annonces, visites, baux, copropriétés : beaucoup de suivi et de documents à gérer.",
  4: "Les achats, la qualité et la logistique se numérisent progressivement.",
  6: "Plannings, inscriptions, paiements et suivi des élèves à organiser.",
  7: "Boutiques et vendeurs en ligne ont besoin d’outils simples pour le stock, la vente et la fidélité.",
  8: "Les petites structures doivent se protéger et respecter des règles (RGPD, NIS2) souvent mal connues.",
  9: "L’IA permet d’automatiser des tâches de rédaction, de tri et de saisie.",
  10: "Des métiers très variés, avec des besoins de suivi, de traçabilité et de vente directe.",
  12: "Créateurs, agences et petites entreprises ont besoin d’outils pour communiquer et vendre.",
  13: "Les entreprises doivent suivre de plus en plus d’obligations environnementales.",
};

// Renommages : "marché/niche/idée" -> [nom d'origine attendu, nouveau nom].
// Règle : on garde la première occurrence, on renomme l'autre en restant fidèle à la description.
const RENOMMAGES = {
  "11/14/1": ["PlanGardes", "GardesSoignants"],
  "9/19/2": ["RelancePièces", "RelanceJustificatifs"],
  "6/10/2": ["LienFamilles", "MessagerieFamilles"],
  "6/2/1": ["SuiviProgrès", "ProgrèsParents"],
  "13/2/0": ["CollecteDonnées", "CollecteCarbone"],
  "3/2/4": ["ChargesClair", "AppelCharges"],
  "11/12/2": ["ObjectifsSuivi", "ObjectifsAnnuels"],
  "9/13/4": ["ArchiveFactures", "CoffreFactures"],
  "2/14/0": ["RappelEntretien", "RappelChaudière"],
  "10/13/1": ["PlanCoupes", "CalendrierCoupes"],
  "9/2/0": ["CompteRenduAuto", "CompteRenduRéunion"],
  "2/9/0": ["SuiviLots", "SuiviVentesLots"],
  "10/8/4": ["VoteAG", "VoteCoop"],
  "7/19/3": ["SuiviProd", "AtelierSuivi"],
  "11/18/0": ["RegistreAuto", "RegistrePersonnel"],
  "8/16/0": ["InventaireMobiles", "ParcMobiles"],
  "13/2/3": ["RapportClient", "RapportCarbone"],
  "14/2/3": ["SuiviFlotte", "SuiviVTC"],
  "14/10/3": ["SuiviCamions", "PositionCamions"],
  "2/4/4": ["PhotoAvantAprès", "PreuvesToiture"],
  "10/14/2": ["CommandesPros", "CommandesPaysagistes"],
  "14/11/1": ["ÉtiquettesAuto", "ÉtiquettesColis"],
};

export const slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[’']/g, "-").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

if (brut.length !== MARCHES.length) throw new Error("Nombre de marchés inattendu");
const utilises = new Set();
const marches = brut.map((m, i) => {
  const [id, court] = MARCHES[i];
  const sortie = { id, nom: m.nom, court, pourquoi: POURQUOI[i] ?? m.pourquoi };
  if (POURQUOI[i]) sortie.pourquoiOriginal = m.pourquoi;
  sortie.niches = m.niches.map((n, j) => ({
    id: slug(n.nom),
    nom: n.nom,
    idees: n.idees.map((idee, k) => {
      const r = RENOMMAGES[`${i}/${j}/${k}`];
      if (!r) return { nom: idee.nom, description: idee.description };
      if (r[0] !== idee.nom) throw new Error(`Renommage ${i}/${j}/${k} : attendu ${r[0]}, trouvé ${idee.nom}`);
      utilises.add(`${i}/${j}/${k}`);
      return { nom: r[1], description: idee.description, nomOriginal: idee.nom };
    }),
  }));
  return sortie;
});
const oublies = Object.keys(RENOMMAGES).filter((k) => !utilises.has(k));
if (oublies.length) throw new Error("Renommages non appliqués : " + oublies.join(", "));

const donnees = {
  version: 1,
  source: "Extrait de la page publiée le 31/10/2026 (original/creation-sas.html).",
  avertissement: "Une idée rédigée n’est pas une niche validée : seule la rencontre avec de vrais clients valide une niche.",
  avertissementMarques: "Les noms d’idées sont des pistes de travail. Ils peuvent correspondre à des marques existantes : vérifiez leur disponibilité (INPI, EUIPO) avant toute utilisation.",
  marches,
};
writeFileSync(new URL("../src/data/marches.json", import.meta.url), JSON.stringify(donnees, null, 2) + "\n");
console.log(`src/data/marches.json écrit : ${marches.length} marchés, ${Object.keys(RENOMMAGES).length} noms renommés.`);
