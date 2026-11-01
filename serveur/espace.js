// Comptes, achat par Stripe, notifications de paiement, droits d'accès et espace « Ma formation ».
// Règle d'or : seul le serveur décide d'un accès, d'après une confirmation de paiement VÉRIFIÉE
// (notification signée par Stripe, ou lecture directe de la session chez Stripe avec la clé secrète).
// Une redirection, un paramètre d'adresse ou une valeur du navigateur ne débloquent jamais rien.
import site from "../src/data/site.json" with { type: "json" };
import { json, lireJson, origineAutorisee, empreinteIp, reference, methodeNonAutorisee } from "./http.js";
import { incrementer } from "./stockage.js";
import { envoyerEmail, emailConfigure } from "./email.js";
import { validerCreationCompte, validerConnexion, validerAchat, TEXTES_CONSENTEMENT } from "./validation.js";
import { cleEmail, hacherMotDePasse, verifierMotDePasse, ouvrirSession, fermerSession, compteConnecte } from "./comptes.js";
import { modePaiement, verifierSignature, creerSessionPaiement, lireSessionPaiement } from "./stripe.js";
import { catalogueParDefaut, formuleVendable, pointsBloquants, droitsEffectifs, vueFormation, contenuLecon, trouverLecon, JOUR_MS } from "./formation.js";

const HEURE = 3_600_000;
const entier = (v, defaut) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : defaut);
const maintenantDe = (ctx) => ctx.maintenant?.() ?? Date.now();
const catalogueDe = (ctx) => ctx.catalogue ?? catalogueParDefaut;
const avecCookie = (reponse, cookie) => { reponse.headers.append("Set-Cookie", cookie); return reponse; };
const MOT_DE_PASSE_FACTICE = { algo: "scrypt", N: 16384, r: 8, p: 1, sel: "AAAAAAAAAAAAAAAAAAAAAA==", hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" };

async function limite(ctx, cle, max) {
  const n = await incrementer(ctx.stockage, cle, HEURE, maintenantDe(ctx));
  return n > max;
}

/** Contrôles communs des envois (POST) : méthode, origine, stockage, corps JSON. */
async function controlerEnvoi(requete, ctx) {
  if (requete.method !== "POST") return { reponse: methodeNonAutorisee() };
  if (!origineAutorisee(requete, ctx.env)) return { reponse: json(403, { ok: false, code: "origine_refusee" }) };
  if (!ctx.stockage) return { reponse: json(503, { ok: false, code: "stockage_non_configure" }) };
  const donnees = await lireJson(requete);
  if (!donnees) return { reponse: json(400, { ok: false, code: "requete_invalide" }) };
  if (typeof donnees.site_web === "string" && donnees.site_web.trim()) return { reponse: json(400, { ok: false, code: "refuse" }) };
  return { donnees };
}

async function exigerCompte(requete, ctx) {
  if (!ctx.stockage) return { reponse: json(503, { ok: false, code: "stockage_non_configure" }) };
  const compte = await compteConnecte(ctx.stockage, requete, maintenantDe(ctx));
  if (!compte) return { reponse: json(401, { ok: false, code: "non_connecte" }) };
  return { compte };
}

// ================================================================ Comptes
async function creerCompte(requete, ctx) {
  const c = await controlerEnvoi(requete, ctx);
  if (c.reponse) return c.reponse;
  if (await limite(ctx, `compte-${empreinteIp(ctx.ip, ctx.env)}`, entier(ctx.env.LIMITE_COMPTES_HEURE, 20))) return json(429, { ok: false, code: "trop_de_demandes" });
  const { ok, erreurs, valeurs } = validerCreationCompte(c.donnees);
  if (!ok) return json(400, { ok: false, code: "champs_invalides", erreurs });
  const cle = cleEmail(valeurs.email);
  if (await ctx.stockage.lire("comptes", cle)) {
    return json(409, { ok: false, code: "compte_existe", erreurs: { email: "Un compte existe déjà avec cette adresse : connectez-vous." } });
  }
  const maintenant = maintenantDe(ctx);
  const compte = {
    id: reference("CPT", new Date(maintenant)), cleEmail: cle, email: valeurs.email, prenom: valeurs.prenom,
    motDePasse: await hacherMotDePasse(valeurs.motDePasse), creeLe: new Date(maintenant).toISOString(),
    consentement: { version: TEXTES_CONSENTEMENT.version, confidentialite: TEXTES_CONSENTEMENT.confidentialite },
  };
  await ctx.stockage.enregistrer("comptes", cle, compte);
  const cookie = await ouvrirSession(ctx.stockage, compte, requete, maintenant);
  return avecCookie(json(201, { ok: true, prenom: compte.prenom }), cookie);
}

async function connecter(requete, ctx) {
  const c = await controlerEnvoi(requete, ctx);
  if (c.reponse) return c.reponse;
  const { ok, erreurs, valeurs } = validerConnexion(c.donnees);
  if (!ok) return json(400, { ok: false, code: "champs_invalides", erreurs });
  const cle = cleEmail(valeurs.email);
  if (await limite(ctx, `connexion-${empreinteIp(ctx.ip, ctx.env)}`, entier(ctx.env.LIMITE_COMPTES_HEURE, 30)) || await limite(ctx, `connexion-${cle}`, 10)) {
    return json(429, { ok: false, code: "trop_de_demandes" });
  }
  const compte = await ctx.stockage.lire("comptes", cle);
  // Même travail de calcul que le compte existe ou non (pas d'indice sur les adresses inscrites).
  const bon = await verifierMotDePasse(valeurs.motDePasse, compte?.motDePasse ?? MOT_DE_PASSE_FACTICE);
  if (!compte || !bon) return json(401, { ok: false, code: "identifiants_invalides" });
  const cookie = await ouvrirSession(ctx.stockage, compte, requete, maintenantDe(ctx));
  return avecCookie(json(200, { ok: true, prenom: compte.prenom }), cookie);
}

async function deconnecter(requete, ctx) {
  if (requete.method !== "POST") return methodeNonAutorisee();
  if (!origineAutorisee(requete, ctx.env)) return json(403, { ok: false, code: "origine_refusee" });
  if (!ctx.stockage) return json(503, { ok: false, code: "stockage_non_configure" });
  return avecCookie(json(200, { ok: true }), await fermerSession(ctx.stockage, requete));
}

async function moi(requete, ctx) {
  if (requete.method !== "GET") return methodeNonAutorisee();
  if (!ctx.stockage) return json(200, { ok: true, connecte: false, stockage: false });
  const compte = await compteConnecte(ctx.stockage, requete, maintenantDe(ctx));
  return json(200, compte ? { ok: true, connecte: true, prenom: compte.prenom, email: compte.email } : { ok: true, connecte: false });
}

// ================================================================ Paiement
/** Une formule peut-elle être achetée maintenant ? En mode réel, seulement si tout est prêt. */
function etatVente(id, env, catalogue) {
  const mode = modePaiement(env);
  const bloquants = pointsBloquants(id, catalogue);
  const raisons = [];
  if (!mode) raisons.push("paiement_non_configure");
  if (mode === "reel") {
    if (!site.paiement.actif) raisons.push("ventes_fermees");
    if (bloquants.length) raisons.push("contenus_en_preparation");
    if (!emailConfigure(env)) raisons.push("confirmation_email_impossible");
  }
  return { ouverte: raisons.length === 0, raisons, bloquants };
}

async function etatPaiement(requete, ctx) {
  if (requete.method !== "GET") return methodeNonAutorisee();
  const cat = catalogueDe(ctx);
  const ventes = Object.fromEntries(site.formules.map((f) => [f.id, etatVente(f.id, ctx.env, cat)]));
  return json(200, { ok: true, mode: ctx.stockage ? modePaiement(ctx.env) : null, ventes });
}

async function creerPaiement(requete, ctx) {
  const c = await controlerEnvoi(requete, ctx);
  if (c.reponse) return c.reponse;
  const mode = modePaiement(ctx.env);
  if (!mode) return json(503, { ok: false, code: "paiement_non_configure" });
  const a = await exigerCompte(requete, ctx);
  if (a.reponse) return a.reponse;
  const { compte } = a;
  const { ok, erreurs, valeurs } = validerAchat(c.donnees);
  if (!ok) return json(400, { ok: false, code: "champs_invalides", erreurs });
  const formule = formuleVendable(valeurs.formule);
  const vente = etatVente(valeurs.formule, ctx.env, catalogueDe(ctx));
  if (!formule || !vente.ouverte) return json(403, { ok: false, code: "vente_fermee", raisons: vente.raisons });
  if (await limite(ctx, `achat-${compte.id}`, 20)) return json(429, { ok: false, code: "trop_de_demandes" });

  const dossier = (await ctx.stockage.lire("droits", compte.id)) || { compte: compte.id, achats: {}, commandes: [], historique: [] };
  if (Object.values(dossier.achats).some((x) => x.actif && x.formule === formule.id)) {
    return json(409, { ok: false, code: "deja_acquise" });
  }
  const maintenant = maintenantDe(ctx);
  const ref = reference("CMD", new Date(maintenant));
  const commande = {
    reference: ref, compte: compte.id, email: compte.email, formule: formule.id, montantCentimes: formule.montantCentimes, devise: formule.devise,
    frequence: "paiement-unique", mode, statut: "en-attente", creeLe: new Date(maintenant).toISOString(),
    accords: {
      version: TEXTES_CONSENTEMENT.version,
      cgv: { accepte: true, texte: TEXTES_CONSENTEMENT.cgv },
      accesImmediat: { accepte: valeurs.accesImmediat, texte: TEXTES_CONSENTEMENT.accesImmediat },
      ...(formule.id === "accompagne" ? { executionService: { accepte: valeurs.executionService, texte: TEXTES_CONSENTEMENT.executionService } } : {}),
    },
    historique: [{ le: new Date(maintenant).toISOString(), statut: "en-attente", source: "creation" }],
  };
  await ctx.stockage.enregistrer("commandes", ref, commande);
  dossier.commandes = [...(dossier.commandes || []), ref].slice(-50);
  await ctx.stockage.enregistrer("droits", compte.id, dossier);

  const base = (ctx.env.SITE_URL || new URL(requete.url).origin).replace(/\/$/, "");
  try {
    const session = await creerSessionPaiement(ctx.env, ctx.fetchFn, {
      commande: ref, formule, email: compte.email, compte: compte.id,
      urlSucces: `${base}/formation/?commande=${ref}`,
      urlAnnulation: `${base}/commande/?formule=${formule.id}&annulee=${ref}`,
      expireLe: Math.floor(maintenant / 1000) + 3600,
    });
    commande.stripeSession = session.id;
    await ctx.stockage.enregistrer("commandes", ref, commande);
    return json(201, { ok: true, reference: ref, url: session.url, mode });
  } catch (e) {
    commande.statut = "erreur-creation";
    commande.historique.push({ le: new Date().toISOString(), statut: "erreur-creation", source: `stripe-${e?.statut ?? "reseau"}` });
    await ctx.stockage.enregistrer("commandes", ref, commande);
    console.error("Paiement : création de la session impossible", e?.statut ?? e?.name);
    return json(502, { ok: false, code: "paiement_indisponible", reference: ref });
  }
}

const iso = (ms) => new Date(ms).toISOString();

/** Ouvre les droits d'une commande payée. Sans effet si déjà fait (notifications répétées). */
async function confirmerPaiement(ctx, commande, session, source) {
  const maintenant = maintenantDe(ctx);
  const conforme = session.amount_total === commande.montantCentimes && session.currency === commande.devise
    && (session.metadata?.commande ?? session.client_reference_id) === commande.reference
    && (!commande.stripeSession || session.id === commande.stripeSession)
    && session.payment_status === "paid";
  if (!conforme) {
    if (commande.statut !== "payee") {
      commande.statut = "anomalie";
      commande.historique.push({ le: iso(maintenant), statut: "anomalie", source });
      await ctx.stockage.enregistrer("commandes", commande.reference, commande);
    }
    return "anomalie";
  }
  const dossier = (await ctx.stockage.lire("droits", commande.compte)) || { compte: commande.compte, achats: {}, commandes: [commande.reference], historique: [] };
  if (dossier.achats[commande.reference]) return "deja-traitee";
  const accesLe = commande.accords.accesImmediat.accepte ? maintenant : maintenant + catalogueDe(ctx).delaiSansAccordJours * JOUR_MS;
  dossier.achats[commande.reference] = { formule: commande.formule, actif: true, depuis: iso(maintenant), accesLe: iso(accesLe) };
  dossier.historique.push({ le: iso(maintenant), action: "ouverture", formule: commande.formule, commande: commande.reference, source });
  // Les droits d'abord : si la suite échoue, Stripe renverra la notification et rien ne sera perdu.
  await ctx.stockage.enregistrer("droits", commande.compte, dossier);
  if (session.payment_intent) await ctx.stockage.enregistrer("paiements", String(session.payment_intent), { commande: commande.reference });
  commande.statut = "payee";
  commande.payeeLe = iso(maintenant);
  commande.paiementStripe = session.payment_intent ?? null;
  commande.accesLe = iso(accesLe);
  commande.historique.push({ le: iso(maintenant), statut: "payee", source });
  await ctx.stockage.enregistrer("commandes", commande.reference, commande);
  const f = site.formules.find((x) => x.id === commande.formule);
  commande.emailConfirmation = await envoyerEmail(ctx.env, {
    a: commande.email,
    sujet: `Votre achat AUREVIA SAAS ${commande.reference}`,
    texte: `Bonjour,\n\nVotre paiement de ${f?.prixAffiche} pour la formule ${f?.nom} est confirmé (référence ${commande.reference}).\n${accesLe <= maintenant ? "Votre accès est ouvert" : `Votre accès s’ouvrira le ${new Date(accesLe).toLocaleDateString("fr-FR")}`} dans votre espace « Ma formation » : ${(ctx.env.SITE_URL || "").replace(/\/$/, "")}/formation/\n\nAUREVIA SAAS – ${site.contactEmail}`,
  }, ctx.fetchFn);
  await ctx.stockage.enregistrer("commandes", commande.reference, commande);
  return "payee";
}

async function changerStatut(ctx, commande, statut, source) {
  if (["payee", "rembourse"].includes(commande.statut)) return "ignore";
  commande.statut = statut;
  commande.historique.push({ le: iso(maintenantDe(ctx)), statut, source });
  await ctx.stockage.enregistrer("commandes", commande.reference, commande);
  return statut;
}

/** Remboursement total : l'accès de la commande est retiré. Partiel : noté, accès conservé. */
async function rembourser(ctx, charge) {
  const lien = charge.payment_intent ? await ctx.stockage.lire("paiements", String(charge.payment_intent)) : null;
  const ref = lien?.commande ?? charge.metadata?.commande;
  const commande = ref ? await ctx.stockage.lire("commandes", ref) : null;
  if (!commande) return "commande_inconnue";
  const maintenant = iso(maintenantDe(ctx));
  if (!charge.refunded) {
    commande.historique.push({ le: maintenant, statut: "remboursement-partiel", montant: charge.amount_refunded, source: "stripe" });
    await ctx.stockage.enregistrer("commandes", ref, commande);
    return "remboursement-partiel";
  }
  const dossier = await ctx.stockage.lire("droits", commande.compte);
  if (dossier?.achats?.[ref]?.actif) {
    dossier.achats[ref].actif = false;
    dossier.achats[ref].finLe = maintenant;
    dossier.achats[ref].raison = "rembourse";
    dossier.historique.push({ le: maintenant, action: "retrait", formule: commande.formule, commande: ref, source: "remboursement" });
    await ctx.stockage.enregistrer("droits", commande.compte, dossier);
  }
  commande.statut = "rembourse";
  commande.historique.push({ le: maintenant, statut: "rembourse", source: "stripe" });
  await ctx.stockage.enregistrer("commandes", ref, commande);
  return "rembourse";
}

async function appliquerEvenement(ctx, ev) {
  const o = ev.data?.object || {};
  if (ev.type.startsWith("checkout.session.")) {
    const ref = o.metadata?.commande ?? o.client_reference_id;
    const commande = ref ? await ctx.stockage.lire("commandes", ref) : null;
    if (!commande) return "commande_inconnue";
    switch (ev.type) {
      case "checkout.session.completed":
        return o.payment_status === "paid" ? confirmerPaiement(ctx, commande, o, "notification") : changerStatut(ctx, commande, "paiement-en-attente", "notification");
      case "checkout.session.async_payment_succeeded":
        return confirmerPaiement(ctx, commande, o, "notification");
      case "checkout.session.async_payment_failed":
        return changerStatut(ctx, commande, "refuse", "notification");
      case "checkout.session.expired":
        return changerStatut(ctx, commande, "annule", "notification");
      default:
        return "ignore";
    }
  }
  if (ev.type === "charge.refunded") return rembourser(ctx, o);
  return "ignore";
}

async function recevoirNotification(requete, ctx) {
  if (requete.method !== "POST") return methodeNonAutorisee();
  const mode = modePaiement(ctx.env);
  if (!mode || !ctx.stockage) return json(503, { ok: false, code: "paiement_non_configure" });
  const annonce = Number(requete.headers.get("content-length"));
  if (Number.isFinite(annonce) && annonce > 500_000) return json(413, { ok: false, code: "trop_gros" });
  const corps = await requete.text();
  const maintenantS = Math.floor(maintenantDe(ctx) / 1000);
  if (!verifierSignature(corps, requete.headers.get("stripe-signature"), ctx.env.STRIPE_WEBHOOK_SECRET, maintenantS)) {
    return json(400, { ok: false, code: "signature_invalide" });
  }
  let ev;
  try { ev = JSON.parse(corps); } catch { return json(400, { ok: false, code: "requete_invalide" }); }
  if (!ev?.id || typeof ev.type !== "string") return json(400, { ok: false, code: "requete_invalide" });
  // Une notification du mode test ne touche jamais un site en mode réel, et inversement.
  if (Boolean(ev.livemode) !== (mode === "reel")) return json(200, { ok: true, ignore: "mode_different" });
  const deja = await ctx.stockage.lire("evenements-stripe", ev.id);
  if (deja) return json(200, { ok: true, doublon: true });
  try {
    const resultat = await appliquerEvenement(ctx, ev);
    await ctx.stockage.enregistrer("evenements-stripe", ev.id, { type: ev.type, recuLe: iso(maintenantDe(ctx)), resultat });
    return json(200, { ok: true, resultat });
  } catch (e) {
    console.error("Notification de paiement : traitement impossible", e?.name ?? "erreur");
    return json(500, { ok: false, code: "traitement_impossible" });   // Stripe renverra la notification
  }
}

async function statutPaiement(requete, ctx) {
  if (requete.method !== "GET") return methodeNonAutorisee();
  const a = await exigerCompte(requete, ctx);
  if (a.reponse) return a.reponse;
  const ref = new URL(requete.url).searchParams.get("commande") || "";
  const commande = /^CMD-\d{8}-[A-Z0-9]{6}$/.test(ref) ? await ctx.stockage.lire("commandes", ref) : null;
  if (!commande || commande.compte !== a.compte.id) return json(404, { ok: false, code: "commande_inconnue" });
  // Notification pas encore arrivée : on interroge Stripe directement (clé secrète, côté serveur).
  if (["en-attente", "paiement-en-attente"].includes(commande.statut) && commande.stripeSession && modePaiement(ctx.env) === commande.mode) {
    try {
      const s = await lireSessionPaiement(ctx.env, ctx.fetchFn, commande.stripeSession);
      if (s.status === "complete" && s.payment_status === "paid") await confirmerPaiement(ctx, commande, s, "verification");
      else if (s.status === "expired") await changerStatut(ctx, commande, "annule", "verification");
    } catch { /* Stripe injoignable : on garde l'état connu, le navigateur réessaiera */ }
  }
  const finale = await ctx.stockage.lire("commandes", ref);
  return json(200, { ok: true, reference: ref, statut: finale.statut, formule: finale.formule, accesLe: finale.accesLe ?? null });
}

// ================================================================ Espace « Ma formation »
async function contexteFormation(requete, ctx) {
  const a = await exigerCompte(requete, ctx);
  if (a.reponse) return a;
  const maintenant = maintenantDe(ctx);
  const dossier = await ctx.stockage.lire("droits", a.compte.id);
  const { droits, formules } = droitsEffectifs(dossier, maintenant, catalogueDe(ctx));
  const progression = (await ctx.stockage.lire("progression", a.compte.id))?.lecons || {};
  return { compte: a.compte, droits, formules, progression };
}

async function formationAccueil(requete, ctx) {
  if (requete.method !== "GET") return methodeNonAutorisee();
  const f = await contexteFormation(requete, ctx);
  if (f.reponse) return f.reponse;
  return json(200, { ok: true, prenom: f.compte.prenom, formules: f.formules, ...vueFormation(f.droits, f.progression, catalogueDe(ctx)) });
}

const REFUS_LECON = { inconnue: 404, en_preparation: 404, non_incluse: 403 };

async function formationLecon(requete, ctx) {
  if (requete.method !== "GET") return methodeNonAutorisee();
  const f = await contexteFormation(requete, ctx);
  if (f.reponse) return f.reponse;
  const r = contenuLecon(new URL(requete.url).searchParams.get("id") || "", f.droits, catalogueDe(ctx));
  if (r.code) return json(REFUS_LECON[r.code], { ok: false, code: r.code });
  return json(200, { ok: true, lecon: { ...r.lecon, fait: Boolean(f.progression[r.lecon.id]) } });
}

async function formationProgression(requete, ctx) {
  const c = await controlerEnvoi(requete, ctx);
  if (c.reponse) return c.reponse;
  const f = await contexteFormation(requete, ctx);
  if (f.reponse) return f.reponse;
  const id = String(c.donnees.lecon || "");
  const r = contenuLecon(id, f.droits, catalogueDe(ctx));
  if (r.code) return json(REFUS_LECON[r.code], { ok: false, code: r.code });
  const lecons = { ...f.progression };
  if (c.donnees.fait === true) lecons[id] = new Date(maintenantDe(ctx)).toISOString();
  else delete lecons[id];
  await ctx.stockage.enregistrer("progression", f.compte.id, { lecons });
  const vue = vueFormation(f.droits, lecons, catalogueDe(ctx));
  return json(200, { ok: true, fait: Boolean(lecons[id]), progression: vue.progression });
}

/** Téléchargement protégé : le fichier n'est jamais public, il est lu dans le stockage après contrôle des droits. */
async function formationFichier(requete, ctx) {
  if (requete.method !== "GET") return methodeNonAutorisee();
  const f = await contexteFormation(requete, ctx);
  if (f.reponse) return f.reponse;
  const id = new URL(requete.url).searchParams.get("id") || "";
  const cat = catalogueDe(ctx);
  const element = trouverLecon(id, cat)?.lecon ?? cat.ressources.find((r) => r.id === id);
  if (!element) return json(404, { ok: false, code: "inconnue" });
  if (!f.droits.has(element.droit)) return json(403, { ok: false, code: "non_incluse" });
  if (element.statut !== "disponible" || !element.fichier) return json(404, { ok: false, code: "en_preparation" });
  const donnees = await ctx.stockage.lireFichier("fichiers-formation", element.fichier);
  if (!donnees) return json(404, { ok: false, code: "fichier_absent" });
  return new Response(donnees, {
    status: 200,
    headers: {
      "Content-Type": element.typeFichier || "application/pdf",
      "Content-Disposition": `attachment; filename="${element.fichier.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// ================================================================ Aiguillage
export const ROUTES_ESPACE = {
  "/api/compte/creation": creerCompte,
  "/api/compte/connexion": connecter,
  "/api/compte/deconnexion": deconnecter,
  "/api/compte/moi": moi,
  "/api/paiement/etat": etatPaiement,
  "/api/paiement/session": creerPaiement,
  "/api/paiement/webhook": recevoirNotification,
  "/api/paiement/statut": statutPaiement,
  "/api/formation": formationAccueil,
  "/api/formation/lecon": formationLecon,
  "/api/formation/progression": formationProgression,
  "/api/formation/fichier": formationFichier,
};

export async function traiterEspace(requete, ctx) {
  const chemin = new URL(requete.url).pathname.replace(/\/$/, "");
  const route = ROUTES_ESPACE[chemin];
  if (!route) return json(404, { ok: false, code: "inconnue" });
  try {
    return await route(requete, ctx);
  } catch (e) {
    console.error(`Espace : erreur (${chemin})`, e?.name ?? "erreur");
    return json(503, { ok: false, code: "stockage_erreur" });
  }
}
