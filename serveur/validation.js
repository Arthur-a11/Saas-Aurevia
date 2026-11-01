// Règles de validation partagées entre le navigateur (affichage immédiat des erreurs)
// et le serveur (contrôle réel, qui seul fait foi).
import site from "../src/data/site.json" with { type: "json" };

export const IDS_FORMULES = site.formules.map((f) => f.id);
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const TEL = /^[0-9+().\s-]{6,30}$/;

const texte = (v) => (typeof v === "string" ? v.trim() : "");

function champTexte(erreurs, valeurs, donnees, nom, { requis = false, max = 200, libelle }) {
  const v = texte(donnees[nom]);
  if (requis && !v) erreurs[nom] = `${libelle} : champ obligatoire.`;
  else if (v.length > max) erreurs[nom] = `${libelle} : ${max} caractères au maximum.`;
  valeurs[nom] = v;
}

function champEmail(erreurs, valeurs, donnees, nom = "email") {
  const v = texte(donnees[nom]).toLowerCase();
  if (!v) erreurs[nom] = "E-mail : champ obligatoire.";
  else if (v.length > 254 || !EMAIL.test(v)) erreurs[nom] = "E-mail : adresse invalide (exemple : prenom.nom@exemple.fr).";
  valeurs[nom] = v;
}

function champFormule(erreurs, valeurs, donnees) {
  const v = texte(donnees.formule);
  if (!IDS_FORMULES.includes(v)) erreurs.formule = "Formule : choisissez une formule dans la liste.";
  valeurs.formule = v;
}

const coche = (v) => v === true || v === "on" || v === "true";

/** Champ piège invisible : rempli seulement par des robots. */
export const estRobot = (donnees) => texte(donnees?.site_web) !== "";

export function validerInscription(d = {}) {
  const e = {}, v = {};
  champTexte(e, v, d, "prenom", { requis: true, max: 80, libelle: "Prénom" });
  champTexte(e, v, d, "nom", { requis: true, max: 80, libelle: "Nom" });
  champEmail(e, v, d);
  champTexte(e, v, d, "tel", { max: 30, libelle: "Téléphone" });
  if (v.tel && !TEL.test(v.tel)) e.tel = "Téléphone : seuls les chiffres, espaces et + - . ( ) sont acceptés.";
  champTexte(e, v, d, "profession", { requis: true, max: 120, libelle: "Profession" });
  champTexte(e, v, d, "entreprise", { max: 120, libelle: "Entreprise ou école" });
  champFormule(e, v, d);
  champTexte(e, v, d, "projet", { max: 1500, libelle: "Projet" });
  v.confidentialite = coche(d.confidentialite);
  if (!v.confidentialite) e.confidentialite = "Cochez la case pour confirmer avoir pris connaissance de la politique de confidentialité.";
  return { ok: Object.keys(e).length === 0, erreurs: e, valeurs: v };
}

export function validerRetractation(d = {}, aujourdHui = new Date()) {
  const e = {}, v = {};
  champTexte(e, v, d, "prenom", { requis: true, max: 80, libelle: "Prénom" });
  champTexte(e, v, d, "nom", { requis: true, max: 80, libelle: "Nom" });
  champEmail(e, v, d);
  champFormule(e, v, d);
  champTexte(e, v, d, "reference", { max: 60, libelle: "Référence de commande" });
  champTexte(e, v, d, "message", { max: 1000, libelle: "Message" });
  const date = texte(d.dateCommande);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) e.dateCommande = "Date de la commande : indiquez une date valide.";
  else if (new Date(date) > aujourdHui) e.dateCommande = "Date de la commande : la date ne peut pas être dans le futur.";
  v.dateCommande = date;
  v.declaration = coche(d.declaration);
  if (!v.declaration) e.declaration = "Cochez la case pour confirmer votre demande de rétractation.";
  return { ok: Object.keys(e).length === 0, erreurs: e, valeurs: v };
}

export const MDP_MIN = 10;

export function validerCreationCompte(d = {}) {
  const e = {}, v = {};
  champTexte(e, v, d, "prenom", { requis: true, max: 80, libelle: "Prénom" });
  champEmail(e, v, d);
  const mdp = typeof d.motDePasse === "string" ? d.motDePasse : "";
  if (mdp.length < MDP_MIN) e.motDePasse = `Mot de passe : ${MDP_MIN} caractères au minimum.`;
  else if (mdp.length > 200) e.motDePasse = "Mot de passe : 200 caractères au maximum.";
  v.motDePasse = mdp;
  v.confidentialite = coche(d.confidentialite);
  if (!v.confidentialite) e.confidentialite = "Cochez la case pour confirmer avoir pris connaissance de la politique de confidentialité.";
  return { ok: Object.keys(e).length === 0, erreurs: e, valeurs: v };
}

export function validerConnexion(d = {}) {
  const e = {}, v = {};
  champEmail(e, v, d);
  v.motDePasse = typeof d.motDePasse === "string" ? d.motDePasse.slice(0, 200) : "";
  if (!v.motDePasse) e.motDePasse = "Mot de passe : champ obligatoire.";
  return { ok: Object.keys(e).length === 0, erreurs: e, valeurs: v };
}

/** Achat par une personne connectée : formule et accords (les identités viennent du compte). */
export function validerAchat(d = {}) {
  const e = {}, v = {};
  champFormule(e, v, d);
  v.cgv = coche(d.cgv);
  if (!v.cgv) e.cgv = "Vous devez accepter les conditions générales de vente pour commander.";
  v.accesImmediat = coche(d.accesImmediat);
  v.executionService = v.formule === "accompagne" ? coche(d.executionService) : false;
  return { ok: Object.keys(e).length === 0, erreurs: e, valeurs: v };
}

/** Textes exacts des cases à cocher, conservés avec chaque enregistrement (preuve du consentement). */
export const TEXTES_CONSENTEMENT = {
  version: "2026-11-01",
  confidentialite: "J’ai pris connaissance de la politique de confidentialité : mes informations servent à traiter mon inscription et à me répondre.",
  cgv: "J’ai lu et j’accepte les conditions générales de vente.",
  accesImmediat: "Je demande à accéder aux contenus numériques dès maintenant, avant la fin du délai de rétractation de 14 jours, et je reconnais perdre mon droit de rétractation pour ces contenus dès le début de l’accès.",
  executionService: "Je demande que l’accompagnement commence avant la fin du délai de rétractation de 14 jours. Je sais que si je me rétracte après son début, je devrai payer la part du service déjà fournie.",
  declaration: "Je déclare me rétracter du contrat portant sur la formule indiquée ci-dessus.",
};
