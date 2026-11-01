// Logique des fonctions serveur, indépendante de l'hébergeur.
// Chaque fonction reçoit une Request standard et un contexte { env, stockage, ip, maintenant, fetchFn, clientAnthropic }.
import Anthropic from "@anthropic-ai/sdk";
import site from "../src/data/site.json" with { type: "json" };
import { json, lireJson, origineAutorisee, empreinteIp, empreinte, reference, methodeNonAutorisee } from "./http.js";
import { incrementer } from "./stockage.js";
import { envoyerEmail, emailConfigure } from "./email.js";
import { validerInscription, validerRetractation, estRobot, TEXTES_CONSENTEMENT } from "./validation.js";
import { contexteAssistant } from "./contexte-assistant.js";
import { modePaiement } from "./stripe.js";

const HEURE = 3_600_000;
const DELAI_MIN_MS = 1_500;
const JOUR = 24 * HEURE;
const entier = (v, defaut) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : defaut);
const nomFormule = (id) => site.formules.find((f) => f.id === id)?.nom ?? id;
const prixFormule = (id) => site.formules.find((f) => f.id === id)?.prixAffiche ?? "";

/** Contrôles communs : méthode, origine, stockage, corps JSON, robots, limite par IP. */
async function preparer(requete, ctx, { limiteParHeure = 10, cleLimite }) {
  if (requete.method !== "POST") return { reponse: methodeNonAutorisee() };
  if (!origineAutorisee(requete, ctx.env)) return { reponse: json(403, { ok: false, code: "origine_refusee" }) };
  if (!ctx.stockage) return { reponse: json(503, { ok: false, code: "stockage_non_configure" }) };
  const donnees = await lireJson(requete);
  if (!donnees) return { reponse: json(400, { ok: false, code: "requete_invalide" }) };
  if (estRobot(donnees)) return { reponse: json(400, { ok: false, code: "refuse" }) };
  // Formulaire envoyé trop vite après l'ouverture de la page : comportement de robot.
  const ouvert = Number(donnees.ouvert_le);
  const maintenantMs = ctx.maintenant?.() ?? Date.now();
  if (Number.isFinite(ouvert) && ouvert > 0 && maintenantMs - ouvert < DELAI_MIN_MS) {
    return { reponse: json(400, { ok: false, code: "trop_rapide" }) };
  }
  const empreinteVisiteur = empreinteIp(ctx.ip, ctx.env);
  try {
    const n = await incrementer(ctx.stockage, `${cleLimite}-${empreinteVisiteur}`, HEURE, maintenantMs);
    if (n > limiteParHeure) return { reponse: json(429, { ok: false, code: "trop_de_demandes" }) };
  } catch {
    return { reponse: json(503, { ok: false, code: "stockage_erreur" }) };
  }
  return { donnees, empreinte: empreinteVisiteur };
}

/** Doublon récent (même clé dans les 24 h) : retourne l'enregistrement déjà créé, sinon null. */
async function doublonRecent(ctx, cle, maintenant) {
  try {
    const d = await ctx.stockage.lire("doublons", cle);
    if (d && maintenant - Date.parse(d.recuLe) < JOUR) return d;
  } catch { /* en cas de doute, on enregistre plutôt que de perdre une demande */ }
  return null;
}

async function sauver(ctx, collection, id, enregistrement) {
  try {
    await ctx.stockage.enregistrer(collection, id, enregistrement);
    return true;
  } catch (e) {
    // Jamais de données personnelles dans les journaux : seulement le type d'erreur.
    console.error(`Enregistrement impossible (${collection}) : ${e?.name ?? "erreur"}`);
    return false;
  }
}

// ---------------------------------------------------------------- Inscription
export async function traiterInscription(requete, ctx) {
  const p = await preparer(requete, ctx, { cleLimite: "inscription", limiteParHeure: entier(ctx.env.LIMITE_FORMULAIRES_HEURE, 10) });
  if (p.reponse) return p.reponse;
  const { ok, erreurs, valeurs } = validerInscription(p.donnees);
  if (!ok) return json(400, { ok: false, code: "champs_invalides", erreurs });

  const maintenant = new Date(ctx.maintenant?.() ?? Date.now());
  const cleDoublon = `inscription-${empreinte(valeurs.email, ctx.env)}`;
  const deja = await doublonRecent(ctx, cleDoublon, maintenant.getTime());
  if (deja) return json(200, { ok: true, doublon: true, reference: deja.reference, emailConfirmation: "deja-traite" });
  const ref = reference("INS", maintenant);
  const enregistrement = {
    reference: ref, type: "inscription", recuLe: maintenant.toISOString(), valeurs,
    consentements: { version: TEXTES_CONSENTEMENT.version, confidentialite: TEXTES_CONSENTEMENT.confidentialite },
    empreinteIp: p.empreinte, emailConfirmation: "en-attente",
  };
  if (!(await sauver(ctx, "inscriptions", ref, enregistrement))) return json(503, { ok: false, code: "stockage_erreur" });
  await sauver(ctx, "doublons", cleDoublon, { reference: ref, recuLe: enregistrement.recuLe });

  const statut = await envoyerEmail(ctx.env, {
    a: valeurs.email,
    sujet: "Votre inscription à AUREVIA SAAS",
    texte: `Bonjour ${valeurs.prenom},\n\nVotre inscription à la formation AUREVIA SAAS est bien enregistrée (référence ${ref}).\nFormule qui vous intéresse : ${nomFormule(valeurs.formule)} (${prixFormule(valeurs.formule)}).\n\nCette inscription n’engage à aucun paiement. Je reviens vers vous par e-mail pour la suite.\n\n${site.responsable} – AUREVIA SAAS\n${site.contactEmail}`,
  }, ctx.fetchFn);
  if (ctx.env.EMAIL_ORGANISATEUR) {
    await envoyerEmail(ctx.env, {
      a: ctx.env.EMAIL_ORGANISATEUR,
      sujet: `Nouvelle inscription ${ref} – ${valeurs.prenom} ${valeurs.nom}`,
      texte: Object.entries(valeurs).map(([k, v]) => `${k} : ${v || "(vide)"}`).join("\n"),
    }, ctx.fetchFn);
  }
  enregistrement.emailConfirmation = statut;
  await sauver(ctx, "inscriptions", ref, enregistrement);
  return json(201, { ok: true, reference: ref, emailConfirmation: statut });
}

// ---------------------------------------------------------------- Rétractation
export async function traiterRetractation(requete, ctx) {
  const p = await preparer(requete, ctx, { cleLimite: "retractation", limiteParHeure: entier(ctx.env.LIMITE_FORMULAIRES_HEURE, 10) });
  if (p.reponse) return p.reponse;
  const maintenant = new Date(ctx.maintenant?.() ?? Date.now());
  const { ok, erreurs, valeurs } = validerRetractation(p.donnees, maintenant);
  if (!ok) return json(400, { ok: false, code: "champs_invalides", erreurs });

  const cleDoublon = `retractation-${empreinte(`${valeurs.email}|${valeurs.formule}|${valeurs.dateCommande}`, ctx.env)}`;
  const deja = await doublonRecent(ctx, cleDoublon, maintenant.getTime());
  if (deja) return json(200, { ok: true, doublon: true, reference: deja.reference, recuLe: deja.recuLe, emailAccuse: "deja-traite" });
  const ref = reference("RET", maintenant);
  const enregistrement = {
    reference: ref, type: "retractation", recuLe: maintenant.toISOString(), valeurs,
    declaration: { version: TEXTES_CONSENTEMENT.version, texte: TEXTES_CONSENTEMENT.declaration },
    empreinteIp: p.empreinte, emailAccuse: "en-attente",
  };
  if (!(await sauver(ctx, "retractations", ref, enregistrement))) return json(503, { ok: false, code: "stockage_erreur" });
  await sauver(ctx, "doublons", cleDoublon, { reference: ref, recuLe: enregistrement.recuLe });

  const resume = `Référence : ${ref}\nReçue le : ${maintenant.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} (heure de Paris)\nNom : ${valeurs.prenom} ${valeurs.nom}\nE-mail : ${valeurs.email}\nFormule : ${nomFormule(valeurs.formule)}\nDate de commande : ${valeurs.dateCommande}\nRéférence de commande : ${valeurs.reference || "(non renseignée)"}\nMessage : ${valeurs.message || "(aucun)"}`;
  const statut = await envoyerEmail(ctx.env, {
    a: valeurs.email,
    sujet: `Accusé de réception de votre rétractation (${ref})`,
    texte: `Bonjour ${valeurs.prenom},\n\nNous avons bien reçu votre demande de rétractation.\n\n${resume}\n\nAUREVIA SAAS – ${site.contactEmail}`,
  }, ctx.fetchFn);
  if (ctx.env.EMAIL_ORGANISATEUR) {
    await envoyerEmail(ctx.env, { a: ctx.env.EMAIL_ORGANISATEUR, sujet: `Rétractation reçue ${ref}`, texte: resume }, ctx.fetchFn);
  }
  enregistrement.emailAccuse = statut;
  await sauver(ctx, "retractations", ref, enregistrement);
  return json(201, { ok: true, reference: ref, recuLe: enregistrement.recuLe, emailAccuse: statut });
}

// ---------------------------------------------------------------- Assistant IA
const MODELES_AVEC_REPLI = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"]);

export function parametresAssistant(env) {
  return {
    modele: env.ASSISTANT_MODELE || "claude-opus-5-5",
    maxTokens: entier(env.ASSISTANT_MAX_TOKENS, 1500),
    effort: ["low", "medium", "high"].includes(env.ASSISTANT_EFFORT) ? env.ASSISTANT_EFFORT : "low",
    limiteIpJour: entier(env.ASSISTANT_LIMITE_IP_JOUR, 20),
    limiteJour: entier(env.ASSISTANT_LIMITE_JOUR, 200),
    // Délai maximal d'un appel : sous la limite de 10 s des fonctions Netlify synchrones.
    delaiMs: Math.min(entier(env.ASSISTANT_DELAI_MS, 8_000), 9_000),
  };
}

function lireHistorique(h) {
  if (!Array.isArray(h)) return [];
  return h.slice(-6)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.texte === "string" && m.texte.trim())
    .map((m) => ({ role: m.role, content: m.texte.trim().slice(0, 600) }));
}

export async function traiterAssistant(requete, ctx) {
  if (requete.method !== "POST") return methodeNonAutorisee();
  if (!origineAutorisee(requete, ctx.env)) return json(403, { ok: false, code: "origine_refusee" });
  // L'IA payante ne s'active que sur décision explicite (ASSISTANT_IA=active) ET avec une clé et un stockage
  // (nécessaire aux limites d'usage). Sinon le navigateur utilise le mode secours, gratuit.
  // État normal (pas une panne) : réponse 200 avec ok=false, sans erreur rouge dans la console du visiteur.
  if (ctx.env.ASSISTANT_IA !== "active" || !ctx.env.ANTHROPIC_API_KEY || !ctx.stockage) {
    return json(200, { ok: false, code: "assistant_non_configure", mode: "secours" });
  }
  const d = await lireJson(requete, 12_000);
  const question = typeof d?.question === "string" ? d.question.trim() : "";
  if (!question || question.length > 600) return json(400, { ok: false, code: "question_invalide" });

  const P = parametresAssistant(ctx.env);
  const maintenant = ctx.maintenant?.() ?? Date.now();
  try {
    const parIp = await incrementer(ctx.stockage, `assistant-${empreinteIp(ctx.ip, ctx.env)}`, JOUR, maintenant);
    if (parIp > P.limiteIpJour) return json(429, { ok: false, code: "limite_personnelle" });
    const total = await incrementer(ctx.stockage, "assistant-total", JOUR, maintenant);
    if (total > P.limiteJour) return json(429, { ok: false, code: "limite_globale" });
  } catch {
    return json(503, { ok: false, code: "assistant_indisponible" });
  }

  // Historique : on garde l'alternance (le premier message doit venir du visiteur).
  const messages = lireHistorique(d.historique);
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (messages.length && messages.at(-1).role === "user" && messages.at(-1).content === question) messages.pop();
  messages.push({ role: "user", content: question });

  const client = ctx.clientAnthropic ?? new Anthropic({ apiKey: ctx.env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: P.delaiMs });
  try {
    const reponse = await client.beta.messages.create({
      model: P.modele,
      max_tokens: P.maxTokens,
      system: [{ type: "text", text: contexteAssistant(), cache_control: { type: "ephemeral" } }],
      messages,
      output_config: { effort: P.effort },
      // Repli automatique côté serveur en cas de refus de sécurité (modèles compatibles uniquement).
      ...(MODELES_AVEC_REPLI.has(P.modele) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    });
    if (reponse.stop_reason === "refusal") {
      return json(200, { ok: true, reponse: "Je ne peux pas répondre à cette question. Je peux vous parler du programme, des prix, de l’inscription ou des idées de SaaS." });
    }
    let texte = reponse.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (!texte) return json(503, { ok: false, code: "assistant_indisponible" });
    if (reponse.stop_reason === "max_tokens") texte += " […]";
    return json(200, { ok: true, reponse: texte });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(503, { ok: false, code: "assistant_occupe" });
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      console.error("Assistant : clé API refusée", e.status);
      return json(503, { ok: false, code: "assistant_indisponible" });
    }
    if (e instanceof Anthropic.BadRequestError) {
      console.error("Assistant : requête refusée", e.status);
      return json(503, { ok: false, code: "assistant_indisponible" });
    }
    if (e instanceof Anthropic.APIError) {
      // 529 (surcharge) et erreurs 5xx : réessayer plus tard ; le navigateur bascule sur le mode secours.
      return json(503, { ok: false, code: e.status === 529 ? "assistant_occupe" : "assistant_indisponible" });
    }
    console.error("Assistant : erreur inattendue", e?.name ?? "erreur");
    return json(503, { ok: false, code: "assistant_indisponible" });
  }
}

// ---------------------------------------------------------------- État de la configuration (diagnostic)
/** Répond uniquement par oui/non : aucune valeur de variable n'est jamais renvoyée. */
export async function traiterEtat(requete, ctx) {
  if (requete.method !== "GET") return methodeNonAutorisee();
  const env = ctx.env || {};
  return json(200, {
    ok: true,
    deploiement: ctx.deploiement ?? null,
    configuration: {
      selEmpreinte: Boolean(env.SEL_EMPREINTE),
      selEmpreinteSources: ctx.sources ?? null,
      stockage: ctx.stockage?.mode ?? null,
      emails: emailConfigure(env),
      assistantIA: env.ASSISTANT_IA === "active" && Boolean(env.ANTHROPIC_API_KEY),
      siteUrl: Boolean(env.SITE_URL),
      paiementActif: Boolean(site.paiement.actif),
      paiementStripe: modePaiement(env),   // "test", "reel" ou null : jamais la clé elle-même
    },
  });
}
