// Textes de la formation payante. Ils ne sont JAMAIS importés par les pages publiques :
// ils ne sortent du serveur que par /api/formation/lecon, après contrôle des droits.
import m1 from "./m1.json" with { type: "json" };
import m2 from "./m2.json" with { type: "json" };
import m3 from "./m3.json" with { type: "json" };
import m4 from "./m4.json" with { type: "json" };
import m5 from "./m5.json" with { type: "json" };
import m6 from "./m6.json" with { type: "json" };

export const CONTENUS = { m1, m2, m3, m4, m5, m6 };

/** Contenu d'un élément du catalogue (leçon, exercice, fiche, modèle, checklist), ou null. */
export function contenuElement(idModule, element) {
  const c = CONTENUS[idModule];
  if (!c) return null;
  switch (element.type) {
    case "lecon": return c.lecons.find((l) => l.id === element.id) ?? null;
    case "exercice": return c.exercice;
    case "fiche": return c.fiche;
    case "modele": return c.modele;
    case "checklist": return { items: c.checklist };
    default: return null;
  }
}

/** Modèle au format texte (Markdown), pour le téléchargement protégé. */
export function modeleEnTexte(modele) {
  const lignes = [`# ${modele.titre}`, "", modele.intro, ""];
  for (const s of modele.sections) {
    lignes.push(`## ${s.titre}`, "");
    for (const c of s.champs) lignes.push(`- ${c} `, "");
  }
  lignes.push("---", "AUREVIA SAAS – modèle réservé aux personnes inscrites à la formation. Usage personnel.");
  return lignes.join("\n");
}
