// Résumé PUBLIC de chaque module, calculé depuis les sources centrales :
// programme.json (texte gratuit) et formation.json (titres et statuts du catalogue payant).
// Aucun texte payant n'est lu ici : les leçons restent dans serveur/contenus/.
import programme from "../data/programme.json" with { type: "json" };
import formation from "../data/formation.json" with { type: "json" };
import { statutDroit, LIBELLE_STATUT_OFFRE } from "./offres.js";

const deType = (m, type) => m.lecons.filter((l) => l.type === type);

export const modulesParcours = formation.modules.map((m, i) => {
  const p = programme.modules[m.programme];
  return {
    id: m.id,
    numero: i + 1,
    titre: p.titre,
    objectif: p.objectif,
    saurezFaire: p.saurezFaire,
    livrable: p.resultat.replace(/^À la fin : /, ""),
    sujets: deType(m, "lecon").map((l) => l.titre),
    nbLecons: deType(m, "lecon").length,
    exercice: deType(m, "exercice")[0] ?? null,
    fiche: deType(m, "fiche")[0] ?? null,
    modele: deType(m, "modele")[0] ?? null,
    checklist: deType(m, "checklist")[0] ?? null,
    video: deType(m, "video")[0] ?? null,
  };
});

const compter = (type) => formation.modules.flatMap((m) => m.lecons).filter((l) => l.type === type).length;
export const totaux = { lecons: compter("lecon"), exercices: compter("exercice"), fiches: compter("fiche"), modeles: compter("modele"), checklists: compter("checklist") };

/** Ressources réellement disponibles, avec leur état réel (pour l'accueil et le programme). */
export const ressourcesReelles = [
  { groupe: "gratuit", texte: "Le plan détaillé des 6 modules, avec le livrable de chaque étape", etat: "Disponible" },
  { groupe: "gratuit", texte: "1 500 idées de SaaS dans 15 marchés, avec recherche et favoris", etat: "Disponible" },
  { groupe: "payant", texte: `${totaux.lecons} leçons détaillées, ${totaux.exercices} exercices avec corrigé et ${totaux.checklists} checklists`, etat: LIBELLE_STATUT_OFFRE[statutDroit("lecons")] || "Disponible" },
  { groupe: "payant", texte: `${totaux.fiches} fiches récapitulatives`, etat: LIBELLE_STATUT_OFFRE[statutDroit("fiches")] || "Disponible" },
  { groupe: "payant", texte: `${totaux.modeles} modèles à remplir (Complet et Accompagné)`, etat: LIBELLE_STATUT_OFFRE[statutDroit("modeles")] || "Disponible" },
  { groupe: "payant", texte: "Les cours en vidéo", etat: LIBELLE_STATUT_OFFRE[statutDroit("videos")] || "Disponible" },
  { groupe: "payant", texte: "Une communauté d’entraide", etat: LIBELLE_STATUT_OFFRE[statutDroit("communaute")] || "Disponible" },
  { groupe: "payant", texte: "Un avis personnel sur votre projet (Accompagné)", etat: LIBELLE_STATUT_OFFRE[statutDroit("avis")] || "Disponible" },
];

export { LIBELLE_STATUT_OFFRE };
