// Petites fonctions partagées par les pages.
import site from "../data/site.json";
import marchesData from "../data/marches.json";
import { contenuOffre, LIBELLE_STATUT_OFFRE } from "./offres.js";

export { site };
export const marches = marchesData.marches;
export const donneesIdees = marchesData;

export const PAGES = [
  { href: "/programme/", label: "Le programme" },
  { href: "/idees/", label: "Marchés et idées" },
  { href: "/tarifs/", label: "Tarifs" },
  { href: "/questions/", label: "Questions" },
  { href: "/contact/", label: "Contact" },
];

/** Mention fiscale à afficher sous un prix. Rien n'est affirmé tant que le régime n'est pas confirmé. */
export function mentionTaxes() {
  if (site.regimeTva === "franchise") return "TVA non applicable, art. 293 B du CGI";
  if (site.regimeTva === "ttc") return "TTC";
  return "Mention de TVA à confirmer";
}

export const formuleParId = (id) => site.formules.find((f) => f.id === id);

/** Ce que la personne obtient avec une formule (source unique : src/data/formation.json, via offres.js). */
export const contenuFormule = (f) => contenuOffre(f.id);
export const LIBELLE_STATUT = LIBELLE_STATUT_OFFRE;

/** Valeur d'une information d'entreprise, ou null si inconnue. */
export const info = (chemin) => chemin.split(".").reduce((o, k) => (o == null ? o : o[k]), site);

export const totalIdees = marches.reduce((t, m) => t + m.niches.reduce((u, n) => u + n.idees.length, 0), 0);

/** Nombre au format français, avec une espace insécable classique (la fine U+202F manque dans certaines polices). */
export const nombre = (n) => new Intl.NumberFormat("fr-FR").format(n).replace(/ /g, " ");

/** Typographie française : espace insécable classique avant ? ! : ; » et après «, pour qu'un signe ne parte jamais seul à la ligne. */
export const insecables = (t) => String(t).replace(/ ([?!:;»])/g, " $1").replace(/« /g, "« ");
