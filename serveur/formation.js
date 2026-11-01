// Catalogue de la formation et calcul des droits d'accès. Logique pure (aucun accès réseau),
// partagée par le serveur (seul juge des accès) et par les pages (affichage).
import formation from "../src/data/formation.json" with { type: "json" };
import programme from "../src/data/programme.json" with { type: "json" };
import site from "../src/data/site.json" with { type: "json" };

export const JOUR_MS = 24 * 3_600_000;
export { formation as catalogueParDefaut };

/** Formule vendable ? Données contrôlées côté serveur : jamais le prix envoyé par le navigateur. */
export function formuleVendable(id) {
  const f = site.formules.find((x) => x.id === id);
  if (!f || !formation.acces[id]) return null;
  return { id: f.id, nom: f.nom, prixAffiche: f.prixAffiche, montantCentimes: Math.round(f.prix * 100), devise: "eur", nature: f.nature };
}

/** Ce qui manque encore pour vendre une formule en vrai (contenus non prêts). */
export function pointsBloquants(id, catalogue = formation) {
  const droits = new Set(catalogue.acces[id] || []);
  const manques = [];
  for (const m of catalogue.modules) for (const l of m.lecons) if (droits.has(l.droit) && l.statut !== "disponible") manques.push(l.titre);
  for (const r of catalogue.ressources) if (droits.has(r.droit) && r.statut !== "disponible") manques.push(r.titre);
  return manques;
}

/**
 * Droits effectifs d'un compte, à un instant donné.
 * Un achat compte s'il est actif (payé, non remboursé) et si sa date d'ouverture est atteinte.
 */
export function droitsEffectifs(dossier, maintenant = Date.now(), catalogue = formation) {
  const droits = new Set();
  const formules = [];
  for (const [commande, a] of Object.entries(dossier?.achats || {})) {
    if (!a.actif) continue;
    const ouvert = Date.parse(a.accesLe) <= maintenant;
    formules.push({ commande, formule: a.formule, nom: site.formules.find((f) => f.id === a.formule)?.nom ?? a.formule, depuis: a.depuis, accesLe: a.accesLe, ouvert });
    if (ouvert) for (const d of catalogue.acces[a.formule] || []) droits.add(d);
  }
  return { droits, formules };
}

const contenuModule = (m) => programme.modules[m.programme];

/** Vue de l'espace « Ma formation » : modules, leçons et ressources, avec l'état d'accès de chacun. */
export function vueFormation(droits, progression = {}, catalogue = formation) {
  const etat = (x) => (!droits.has(x.droit) ? "non-inclus" : x.statut === "disponible" ? "ouvert" : x.statut);
  const modules = catalogue.modules.map((m, i) => {
    const c = contenuModule(m);
    return {
      id: m.id, numero: i + 1, titre: c.titre, resume: c.resume,
      lecons: m.lecons.map((l) => ({ id: l.id, type: l.type, titre: l.titre, acces: etat(l), fait: Boolean(progression[l.id]) })),
    };
  });
  const ouvertes = modules.flatMap((m) => m.lecons.filter((l) => l.acces === "ouvert"));
  const faites = ouvertes.filter((l) => l.fait).length;
  return {
    modules,
    ressources: catalogue.ressources.map((r) => ({ id: r.id, titre: r.titre, acces: etat(r), precision: r.precision ?? null })),
    progression: { faites, total: ouvertes.length },
    prochaine: (ouvertes.find((l) => !l.fait) ?? ouvertes[0])?.id ?? null,
  };
}

/** Une leçon et son contenu, ou la raison du refus. */
export function trouverLecon(id, catalogue = formation) {
  for (const m of catalogue.modules) {
    const i = m.lecons.findIndex((l) => l.id === id);
    if (i >= 0) return { module: m, lecon: m.lecons[i] };
  }
  return null;
}

export function contenuLecon(id, droits, catalogue = formation) {
  const t = trouverLecon(id, catalogue);
  if (!t) return { code: "inconnue" };
  if (!droits.has(t.lecon.droit)) return { code: "non_incluse" };
  if (t.lecon.statut !== "disponible") return { code: "en_preparation" };
  const c = contenuModule(t.module);
  const ouvertes = catalogue.modules.flatMap((m) => m.lecons.filter((l) => droits.has(l.droit) && l.statut === "disponible"));
  const pos = ouvertes.findIndex((l) => l.id === id);
  return {
    lecon: {
      id, type: t.lecon.type, titre: t.lecon.titre,
      module: { numero: catalogue.modules.indexOf(t.module) + 1, titre: c.titre },
      contenu: t.lecon.type === "texte" ? { resume: c.resume, points: c.points, resultat: c.resultat } : null,
      fichier: t.lecon.fichier ?? null,
      precedente: ouvertes[pos - 1]?.id ?? null,
      suivante: ouvertes[pos + 1]?.id ?? null,
    },
  };
}
