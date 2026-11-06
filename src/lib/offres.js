// Contenu des formules, calculé à partir de la SOURCE UNIQUE src/data/formation.json.
// Utilisé par la page Tarifs, la commande, les CGV, l'assistant et le serveur : tout reste cohérent.
import formation from "../data/formation.json" with { type: "json" };
import site from "../data/site.json" with { type: "json" };

// Du plus avancé au moins avancé : un droit prend le statut de son élément le moins avancé.
const ORDRE = ["valide", "brouillon", "en-preparation", "a-definir"];
export const LIBELLE_STATUT_OFFRE = { valide: "", brouillon: "Rédigé, en relecture", "en-preparation": "En préparation", "a-definir": "Modalités à définir" };

function elementsDuDroit(droit, catalogue = formation) {
  return [...catalogue.modules.flatMap((m) => m.lecons), ...catalogue.ressources].filter((x) => x.droit === droit);
}

/** Statut global d'un droit : celui de son élément le moins avancé. */
export function statutDroit(droit, catalogue = formation) {
  const statuts = elementsDuDroit(droit, catalogue).map((x) => x.statut);
  if (!statuts.length) return "a-definir";
  return statuts.reduce((pire, s) => (ORDRE.indexOf(s) > ORDRE.indexOf(pire) ? s : pire), "valide");
}

/** Ce qu'apporte une formule : chaque droit, son libellé et son statut réel. */
export function contenuOffre(idFormule, catalogue = formation) {
  return (catalogue.acces[idFormule] || []).map((droit) => ({ droit, texte: catalogue.droits[droit], statut: statutDroit(droit, catalogue) }));
}

/** Tableau comparatif : une ligne par droit, une cellule par formule. */
export function comparatif(catalogue = formation) {
  return Object.keys(catalogue.droits).map((droit) => ({
    droit, texte: catalogue.droits[droit], statut: statutDroit(droit, catalogue),
    formules: site.formules.map((f) => (catalogue.acces[f.id] || []).includes(droit)),
  }));
}

// Mode de paiement décidé par Arthur (src/data/conditions.json). Tous les textes du site en dépendent.
import conditions from "../data/conditions.json" with { type: "json" };
export const ABONNEMENT = conditions.frequencePaiement.valeur === "abonnement-mensuel";
export const PAIEMENT = ABONNEMENT
  ? { suffixe: " / mois", court: "Abonnement mensuel · résiliable à tout moment", phrase: "Abonnement mensuel, résiliable en ligne à tout moment. L’accès dure tant que l’abonnement est actif.", titreTarifs: "Un abonnement mensuel, résiliable à tout moment" }
  : { suffixe: "", court: "Paiement unique · sans abonnement", phrase: "Paiement unique, sans abonnement ni prélèvement.", titreTarifs: "Un seul paiement, pas d’abonnement" };
