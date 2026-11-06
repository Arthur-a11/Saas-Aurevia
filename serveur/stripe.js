// Paiement par Stripe Checkout (page de paiement hébergée par Stripe), sans dépendance externe.
// Clés lues dans les variables d'environnement du serveur, jamais dans le navigateur :
//   STRIPE_SECRET_KEY      (sk_test_… pour les essais, sk_live_… pour les ventes réelles)
//   STRIPE_WEBHOOK_SECRET  (whsec_…, donné par Stripe à la création du point de notification)
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.stripe.com/v1";
export const TOLERANCE_SIGNATURE_S = 300;

/** "test", "reel" ou null (paiement non configuré). */
export function modePaiement(env = {}) {
  const cle = env.STRIPE_SECRET_KEY || "";
  if (!env.STRIPE_WEBHOOK_SECRET) return null;
  if (cle.startsWith("sk_test_") || cle.startsWith("rk_test_")) return "test";
  if (cle.startsWith("sk_live_") || cle.startsWith("rk_live_")) return "reel";
  return null;
}

/**
 * Vérifie l'en-tête Stripe-Signature (t=…,v1=…) : HMAC-SHA256 de « t.corps » avec le secret du webhook.
 * Refuse aussi les notifications trop anciennes (rejeu).
 */
export function verifierSignature(corpsBrut, entete, secret, maintenantS = Math.floor(Date.now() / 1000)) {
  if (!secret || !entete || typeof corpsBrut !== "string") return false;
  const parties = entete.split(",").map((p) => p.trim().split("="));
  const t = Number(parties.find(([k]) => k === "t")?.[1]);
  const signatures = parties.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || signatures.length === 0) return false;
  if (Math.abs(maintenantS - t) > TOLERANCE_SIGNATURE_S) return false;
  const attendue = Buffer.from(createHmac("sha256", secret).update(`${t}.${corpsBrut}`).digest("hex"));
  return signatures.some((s) => {
    const b = Buffer.from(String(s));
    return b.length === attendue.length && timingSafeEqual(b, attendue);
  });
}

/** Signature au format Stripe (tests et simulateur local uniquement). */
export function signer(corpsBrut, secret, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${corpsBrut}`).digest("hex")}`;
}

function formulaire(objet, prefixe = "", sortie = new URLSearchParams()) {
  for (const [k, v] of Object.entries(objet)) {
    if (v === undefined || v === null) continue;
    const cle = prefixe ? `${prefixe}[${k}]` : k;
    if (typeof v === "object") formulaire(v, cle, sortie);
    else sortie.append(cle, String(v));
  }
  return sortie;
}

async function appel(env, fetchFn, methode, chemin, { corps, idempotence } = {}) {
  const base = env.STRIPE_API_URL || API;   // STRIPE_API_URL : simulateur local pour les tests uniquement
  const rep = await (fetchFn || fetch)(`${base}${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(corps ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotence ? { "Idempotency-Key": idempotence } : {}),
    },
    body: corps ? formulaire(corps).toString() : undefined,
    signal: AbortSignal.timeout(8_000),
  });
  const data = await rep.json().catch(() => null);
  if (!rep.ok || !data) throw Object.assign(new Error("stripe"), { statut: rep.status, code: data?.error?.code });
  return data;
}

/**
 * Crée la page de paiement. Montant, devise et nom viennent du serveur (jamais du navigateur).
 * abonnement = true : abonnement mensuel (mode « subscription »), décidé par Arthur dans conditions.json.
 * abonnement = false : achat unique (mode « payment »), aucun prélèvement récurrent.
 */
export function creerSessionPaiement(env, fetchFn, { commande, formule, email, compte, urlSucces, urlAnnulation, expireLe, abonnement = false }) {
  const meta = { commande, formule: formule.id, compte };
  const prix = { currency: formule.devise, unit_amount: formule.montantCentimes, product_data: { name: `AUREVIA SAAS – formule ${formule.nom}` } };
  if (abonnement) prix.recurring = { interval: "month" };
  return appel(env, fetchFn, "POST", "/checkout/sessions", {
    idempotence: `session-${commande}`,
    corps: {
      mode: abonnement ? "subscription" : "payment",
      client_reference_id: commande,
      customer_email: email,
      success_url: urlSucces,
      cancel_url: urlAnnulation,
      expires_at: expireLe,
      locale: "fr",
      line_items: { 0: { quantity: 1, price_data: prix } },
      metadata: meta,
      ...(abonnement ? { subscription_data: { metadata: meta } } : { payment_intent_data: { metadata: meta } }),
    },
  });
}

/** Résiliation demandée par le client : l'abonnement s'arrête à la fin de la période déjà payée. */
export const resilierAbonnement = (env, fetchFn, id) =>
  appel(env, fetchFn, "POST", `/subscriptions/${encodeURIComponent(id)}`, { corps: { cancel_at_period_end: "true" }, idempotence: `resiliation-${id}` });

/** Fin de la période payée d'un abonnement (champ déplacé dans les versions récentes de l'API Stripe). */
export const finPeriode = (abo) => abo?.cancel_at ?? abo?.items?.data?.[0]?.current_period_end ?? abo?.current_period_end ?? null;

/** Abonnement lié à une facture (anciennes et nouvelles versions de l'API Stripe). */
export const abonnementDeFacture = (f) => f?.parent?.subscription_details?.subscription ?? f?.subscription ?? null;

export const lireSessionPaiement = (env, fetchFn, id) =>
  appel(env, fetchFn, "GET", `/checkout/sessions/${encodeURIComponent(id)}`);
