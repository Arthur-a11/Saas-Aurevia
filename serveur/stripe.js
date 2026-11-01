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

/** Crée la page de paiement. Montant, devise et nom viennent du serveur (jamais du navigateur). */
export function creerSessionPaiement(env, fetchFn, { commande, formule, email, compte, urlSucces, urlAnnulation, expireLe }) {
  return appel(env, fetchFn, "POST", "/checkout/sessions", {
    idempotence: `session-${commande}`,
    corps: {
      mode: "payment",                      // achat unique : aucun prélèvement récurrent
      client_reference_id: commande,
      customer_email: email,
      success_url: urlSucces,
      cancel_url: urlAnnulation,
      expires_at: expireLe,
      locale: "fr",
      line_items: { 0: { quantity: 1, price_data: { currency: formule.devise, unit_amount: formule.montantCentimes, product_data: { name: `AUREVIA SAAS – formule ${formule.nom}` } } } },
      metadata: { commande, formule: formule.id, compte },
      payment_intent_data: { metadata: { commande, formule: formule.id, compte } },
    },
  });
}

export const lireSessionPaiement = (env, fetchFn, id) =>
  appel(env, fetchFn, "GET", `/checkout/sessions/${encodeURIComponent(id)}`);
