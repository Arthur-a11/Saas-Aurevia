// Catalogue de la formation et calcul des droits d'accès. Logique pure (aucun accès réseau),
// partagée par le serveur (seul juge des accès) et par les tests.
import formation from "../src/data/formation.json" with { type: "json" };
import programme from "../src/data/programme.json" with { type: "json" };
import site from "../src/data/site.json" with { type: "json" };
import { CONTENUS, contenuElement } from "./contenus/index.js";

export const JOUR_MS = 24 * 3_600_000;
export { formation as catalogueParDefaut };

/** Lisible dans l'espace client : validé, ou rédigé en brouillon (relecture en cours). */
export const estLisible = (statut) => statut === "valide" || statut === "brouillon";

/** Formule vendable ? Données contrôlées côté serveur : jamais le prix envoyé par le navigateur. */
export function formuleVendable(id) {
  const f = site.formules.find((x) => x.id === id);
  if (!f || !formation.acces[id]) return null;
  return { id: f.id, nom: f.nom, prixAffiche: f.prixAffiche, montantCentimes: Math.round(f.prix * 100), devise: "eur", nature: f.nature };
}

/** Éléments d'une formule qui ne sont pas encore VALIDÉS par Arthur (bloquent la vente réelle). */
export function pointsBloquants(id, catalogue = formation) {
  const droits = new Set(catalogue.acces[id] || []);
  const manques = [];
  for (const m of catalogue.modules) for (const l of m.lecons) if (droits.has(l.droit) && l.statut !== "valide") manques.push(l.titre);
  for (const r of catalogue.ressources) if (droits.has(r.droit) && r.statut !== "valide") manques.push(r.titre);
  return manques;
}

/**
 * Droits effectifs d'un compte, à un instant donné.
 * Un achat compte s'il est actif (payé, non remboursé), si son ouverture est atteinte et sa fin non dépassée.
 */
export function droitsEffectifs(dossier, maintenant = Date.now(), catalogue = formation) {
  const droits = new Set();
  const formules = [];
  for (const [commande, a] of Object.entries(dossier?.achats || {})) {
    if (!a.actif) continue;
    const ouvert = Date.parse(a.accesLe) <= maintenant;
    const termine = a.finLe ? Date.parse(a.finLe) <= maintenant : false;
    formules.push({ commande, formule: a.formule, nom: site.formules.find((f) => f.id === a.formule)?.nom ?? a.formule, depuis: a.depuis, accesLe: a.accesLe, finLe: a.finLe ?? null, ouvert, termine, abonnement: Boolean(a.abonnement), finPrevueLe: a.finPrevueLe ?? null });
    if (ouvert && !termine) for (const d of catalogue.acces[a.formule] || []) droits.add(d);
  }
  return { droits, formules };
}

const etatElement = (x, droits) => (!droits.has(x.droit) ? "non-inclus" : estLisible(x.statut) ? "ouvert" : x.statut);

/** Vue de l'espace « Ma formation » : modules, éléments et ressources, avec l'état d'accès de chacun. */
export function vueFormation(droits, progression = {}, catalogue = formation) {
  const modules = catalogue.modules.map((m, i) => {
    const c = CONTENUS[m.id];
    const p = programme.modules[m.programme];
    const accessible = m.lecons.some((l) => droits.has(l.droit));
    return {
      id: m.id, numero: i + 1, titre: c?.titre ?? p.titre, resume: p.resume,
      objectifs: accessible ? c?.objectifs ?? [] : [],
      lecons: m.lecons.map((l) => ({ id: l.id, type: l.type, titre: l.titre, statut: l.statut, acces: etatElement(l, droits), fait: Boolean(progression[l.id]) })),
    };
  });
  const ouvertes = modules.flatMap((m) => m.lecons.filter((l) => l.acces === "ouvert"));
  const faites = ouvertes.filter((l) => l.fait).length;
  return {
    modules,
    ressources: catalogue.ressources.map((r) => ({ id: r.id, titre: r.titre, statut: r.statut, acces: etatElement(r, droits), precision: r.precision ?? null })),
    progression: { faites, total: ouvertes.length },
    prochaine: (ouvertes.find((l) => !l.fait) ?? ouvertes[0])?.id ?? null,
  };
}

export function trouverLecon(id, catalogue = formation) {
  for (const m of catalogue.modules) {
    const i = m.lecons.findIndex((l) => l.id === id);
    if (i >= 0) return { module: m, lecon: m.lecons[i] };
  }
  return null;
}

/** Un élément et son contenu, ou la raison du refus. Le contenu ne sort que si le compte y a droit. */
export function contenuLecon(id, droits, catalogue = formation) {
  const t = trouverLecon(id, catalogue);
  if (!t) return { code: "inconnue" };
  if (!droits.has(t.lecon.droit)) return { code: "non_incluse" };
  if (!estLisible(t.lecon.statut)) return { code: "en_preparation" };
  const contenu = contenuElement(t.module.id, t.lecon);
  if (!contenu) return { code: "en_preparation" };
  const ouvertes = catalogue.modules.flatMap((m) => m.lecons.filter((l) => droits.has(l.droit) && estLisible(l.statut)));
  const pos = ouvertes.findIndex((l) => l.id === id);
  return {
    lecon: {
      id, type: t.lecon.type, titre: t.lecon.titre, statut: t.lecon.statut,
      module: { numero: catalogue.modules.indexOf(t.module) + 1, titre: CONTENUS[t.module.id]?.titre ?? programme.modules[t.module.programme].titre },
      contenu,
      telechargeable: t.lecon.type === "modele",
      precedente: ouvertes[pos - 1]?.id ?? null,
      suivante: ouvertes[pos + 1]?.id ?? null,
    },
  };
}
