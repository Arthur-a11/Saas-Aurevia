// Conditions d'ouverture des VENTES RÉELLES, en un seul endroit.
// Le serveur refuse de créer un paiement réel tant qu'une seule condition manque (blocage côté serveur,
// pas seulement sur l'affichage des boutons). Le mode test (clés sk_test_) n'est pas concerné.
import site from "../src/data/site.json" with { type: "json" };
import conditions from "../src/data/conditions.json" with { type: "json" };
import { emailConfigure } from "./email.js";
import { adresseSite } from "./http.js";
import { pointsBloquants, catalogueParDefaut } from "./formation.js";

/** Informations d'entreprise obligatoires (chemin dans site.json → libellé). */
export const INFOS_LEGALES = [
  ["entreprise.formeJuridique", "Forme juridique (micro-entreprise, SASU, EURL…)"],
  ["entreprise.denomination", "Nom de l’entreprise ou nom commercial"],
  ["entreprise.adresseSiege", "Adresse du siège ou de domiciliation"],
  ["entreprise.siren", "Numéro SIREN"],
  ["entreprise.rcsOuRne", "Immatriculation (RCS ou RNE)"],
  ["entreprise.directeurPublication", "Directeur de la publication"],
  ["regimeTva", "Régime de TVA (franchise art. 293 B ou TVA facturée)"],
  ["mediateur.nom", "Nom du médiateur de la consommation"],
  ["mediateur.siteInternet", "Site internet du médiateur"],
  ["mediateur.adressePostale", "Adresse du médiateur"],
  ["hebergeur.nom", "Nom de l’hébergeur"],
  ["hebergeur.adresse", "Adresse de l’hébergeur"],
  ["hebergeur.telephoneOuContact", "Contact de l’hébergeur"],
];

const valeur = (objet, chemin) => chemin.split(".").reduce((o, k) => (o == null ? o : o[k]), objet);

/** Toutes les raisons qui bloquent la vente réelle d'une formule (liste vide = vente réelle possible). */
export function raisonsBlocageReel(idFormule, env = {}, { cfg = conditions, config = site, catalogue = catalogueParDefaut } = {}) {
  const r = [];
  const ajouter = (code, libelle) => r.push({ code, libelle });
  if (!config.paiement.actif) ajouter("ventes_fermees", "Ventes non activées par Arthur (site.json > paiement.actif).");
  if (!emailConfigure(env)) ajouter("confirmation_email_impossible", "E-mails (Brevo) non connectés : la confirmation sur support durable est impossible.");
  if (!adresseSite(env)) ajouter("adresse_site_inconnue", "Adresse publique du site (SITE_URL) absente ou mal tapée.");
  for (const [chemin, libelle] of INFOS_LEGALES) if (valeur(config, chemin) == null) ajouter("information_legale_manquante", `${libelle} : à fournir.`);
  if (!cfg.juridique.cgvRelues) ajouter("cgv_non_relues", "CGV et textes légaux non relus par un juriste.");
  if (!cfg.juridique.reglesVerifieesSourcesOfficielles) ajouter("regles_non_verifiees", "Règles de rétractation non vérifiées sur les sources officielles.");
  if (!cfg.frequencePaiement.confirmeeParArthur) ajouter("frequence_non_confirmee", "Achat unique ou abonnement : à confirmer.");
  if (!cfg.dureeAcces.valeur) ajouter("duree_acces_non_definie", "Durée d’accès non décidée (à vie ou 12 mois).");
  if (!cfg.ouvertureSansRenonciation.validee) ajouter("ouverture_non_validee", "Règle d’ouverture sans renonciation (immédiate ou différée) non validée.");
  if (!cfg.contenusValides || pointsBloquants(idFormule, catalogue).length) ajouter("contenus_non_valides", "Contenus de la formule pas tous validés par Arthur.");
  if (idFormule === "accompagne") {
    const a = cfg.accompagnement;
    if (["format", "duree", "delaiRealisation", "limites", "partDuPrix"].some((k) => a[k] == null)) {
      ajouter("accompagnement_non_defini", "Accompagnement : format, durée, délai, limites et part du prix à définir.");
    }
  }
  return r;
}

/** Date de fin d'accès selon la durée décidée (null si à vie ou non décidée). */
export function finAcces(accesLeMs, cfg = conditions) {
  if (cfg.dureeAcces.valeur === "12-mois") {
    const d = new Date(accesLeMs);
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.toISOString();
  }
  return null;
}

/** Date d'ouverture : immédiate si le client a renoncé (ou si la règle « immédiate » est retenue), sinon après le délai. */
export function dateOuverture(payeLeMs, accesImmediatAccepte, cfg = conditions) {
  if (accesImmediatAccepte || cfg.ouvertureSansRenonciation.valeur === "immediate") return payeLeMs;
  return payeLeMs + cfg.ouvertureSansRenonciation.delaiJours * 24 * 3_600_000;
}

export { conditions as conditionsParDefaut };
