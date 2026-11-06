// Textes des e-mails transactionnels. Aucune information inventée : ce qui manque s'écrit « [à compléter] ».
import site from "../src/data/site.json" with { type: "json" };
import conditions from "../src/data/conditions.json" with { type: "json" };
import { TEXTES_CONSENTEMENT } from "./validation.js";

const AC = "[à compléter]";
const dateFr = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const lien = (base, chemin) => (base ? `${base.replace(/\/$/, "")}${chemin}` : `page ${chemin} du site`);

export function mentionTaxes() {
  if (site.regimeTva === "franchise") return "TVA non applicable, art. 293 B du CGI";
  if (site.regimeTva === "ttc") return "TTC";
  return "mention de TVA à confirmer";
}

function blocVendeur() {
  const e = site.entreprise;
  return [
    "Vendeur :",
    `${e.denomination ?? AC} (${e.formeJuridique ?? AC})`,
    `Adresse : ${e.adresseSiege ?? AC}`,
    `SIREN : ${e.siren ?? AC}`,
    `Contact : ${site.contactEmail}`,
    `Médiateur de la consommation : ${site.mediateur.nom ?? AC} (${site.mediateur.siteInternet ?? AC})`,
  ].join("\n");
}

/** Confirmation de commande sur support durable (contenu exigé : accords, version des conditions, accès). */
export function emailCommande(commande, { accesLe, finLe, baseUrl, cfg = conditions }) {
  const f = site.formules.find((x) => x.id === commande.formule);
  const ouvertMaintenant = Date.parse(accesLe) <= Date.parse(commande.payeeLe ?? accesLe);
  const duree = cfg.dureeAcces.valeur ? cfg.dureeAcces.options[cfg.dureeAcces.valeur] : `durée d’accès ${AC}`;
  const accords = [
    `- ${TEXTES_CONSENTEMENT.cgv} : oui`,
    `- ${TEXTES_CONSENTEMENT.accesImmediat} : ${commande.accords.accesImmediat.accepte ? "oui" : "non"}`,
    ...(commande.accords.executionService ? [`- ${TEXTES_CONSENTEMENT.executionService} : ${commande.accords.executionService.accepte ? "oui" : "non"}`] : []),
  ].join("\n");
  const retractation = commande.accords.accesImmediat.accepte
    ? "Vous avez demandé un accès immédiat et reconnu perdre votre droit de rétractation pour les contenus numériques dès le début de l’accès."
    : "Vous conservez votre droit de rétractation de 14 jours à compter de l’achat.";
  return {
    sujet: `Confirmation de votre commande AUREVIA SAAS ${commande.reference}`,
    texte: [
      "Bonjour,",
      "",
      `Votre paiement de ${f?.prixAffiche}${commande.frequence === "abonnement-mensuel" ? " (premier mois)" : ""} (${mentionTaxes()}) pour la formule ${f?.nom} est confirmé.`,
      `Référence : ${commande.reference}. ${commande.frequence === "abonnement-mensuel" ? "Abonnement mensuel : prélevé chaque mois, résiliable à tout moment depuis votre espace « Ma formation » (l’accès dure jusqu’à la fin du mois payé)." : "Paiement unique, sans abonnement."}${commande.mode === "test" ? " [MODE TEST : aucun paiement réel]" : ""}`,
      "",
      ouvertMaintenant
        ? `Votre accès est ouvert depuis le ${dateFr(accesLe)} dans votre espace « Ma formation » : ${lien(baseUrl, "/formation/")}`
        : `Votre accès s’ouvrira le ${dateFr(accesLe)} dans votre espace « Ma formation » : ${lien(baseUrl, "/formation/")}`,
      `Durée d’accès : ${duree}${finLe ? ` (jusqu’au ${dateFr(finLe)})` : ""}.`,
      "",
      `Vos choix au moment de la commande (conditions version ${commande.accords.version} / ${commande.conditions?.version ?? cfg.versionConditions}) :`,
      accords,
      retractation,
      "",
      `Conditions générales de vente : ${lien(baseUrl, "/cgv/")}`,
      `Droit de rétractation : ${lien(baseUrl, "/retractation/")}`,
      "",
      blocVendeur(),
    ].join("\n"),
  };
}

export function emailReinitialisation(lienReinit, minutes) {
  return {
    sujet: "Réinitialisation de votre mot de passe AUREVIA SAAS",
    texte: [
      "Bonjour,",
      "",
      "Une réinitialisation du mot de passe a été demandée pour votre compte AUREVIA SAAS.",
      `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable ${minutes} minutes, une seule fois) :`,
      lienReinit,
      "",
      "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe actuel reste valable.",
      "",
      `AUREVIA SAAS – ${site.contactEmail}`,
    ].join("\n"),
  };
}

export function emailBienvenue(prenom, baseUrl) {
  return {
    sujet: "Votre compte AUREVIA SAAS est créé",
    texte: [
      `Bonjour ${prenom},`,
      "",
      "Votre compte AUREVIA SAAS est créé. Il vous permet de retrouver vos achats et votre progression.",
      `Accès : ${lien(baseUrl, "/compte/")}`,
      "",
      "Si vous n’avez pas créé ce compte, répondez à cet e-mail.",
      "",
      `AUREVIA SAAS – ${site.contactEmail}`,
    ].join("\n"),
  };
}
