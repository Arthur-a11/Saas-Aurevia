// Simulateur LOCAL de Stripe, pour les tests uniquement. AUCUN paiement réel, aucun appel à Stripe.
// Il imite les trois choses dont le site a besoin :
//   - POST /v1/checkout/sessions        : création d'une page de paiement ;
//   - GET  /v1/checkout/sessions/:id    : lecture d'une session (vérification par le serveur) ;
//   - GET  /c/pay/:id                   : la « page de paiement », avec des boutons de test.
// Les boutons envoient au site une notification SIGNÉE (même format que Stripe) puis redirigent.
// Usage : PORT_STRIPE=4398 SITE=http://localhost:4397 STRIPE_WEBHOOK_SECRET=whsec_… node scripts/stripe-simule.mjs
import http from "node:http";
import { signer } from "../serveur/stripe.js";

const port = Number(process.env.PORT_STRIPE || 4398);
const site = process.env.SITE || "http://localhost:4397";
const secret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_simule";
const sessions = new Map();
let compteur = 0;

const lireCorps = async (req) => { const m = []; for await (const x of req) m.push(x); return Buffer.concat(m).toString(); };
const envoyer = (res, statut, corps, type = "application/json") => { res.writeHead(statut, { "Content-Type": type }); res.end(typeof corps === "string" ? corps : JSON.stringify(corps)); };

async function notifier(type, objet, id = `evt_simule_${++compteur}`) {
  const corps = JSON.stringify({ id, object: "event", type, livemode: false, data: { object: objet } });
  const r = await fetch(`${site}/api/paiement/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": signer(corps, secret) }, body: corps });
  return r.status;
}

const page = (s) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paiement simulé</title>
<style>body{font:16px system-ui;background:#fff;color:#111;max-width:32rem;margin:2rem auto;padding:0 16px}form{margin:.5rem 0}button{font:inherit;padding:.6rem 1rem;width:100%}</style></head>
<body><main><h1>Paiement simulé (test)</h1><p>Aucun paiement réel. Montant : ${(s.amount_total / 100).toFixed(2).replace(".", ",")} € (${s.metadata.formule}).</p>
${[["payer", "Payer (succès)"], ["payer-sans-notification", "Payer, notification retardée"], ["payer-deux-fois", "Payer, notification envoyée deux fois"], ["refuser", "Paiement refusé"], ["annuler", "Annuler et revenir au site"]]
  .map(([a, t]) => `<form method="post" action="/c/pay/${s.id}/${a}"><button type="submit">${t}</button></form>`).join("")}</main></body></html>`;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const auth = req.headers.authorization || "";
  if (url.pathname === "/v1/checkout/sessions" && req.method === "POST") {
    if (!auth.startsWith("Bearer sk_test_")) return envoyer(res, 401, { error: { code: "cle_invalide" } });
    const p = new URLSearchParams(await lireCorps(req));
    const id = `cs_test_simule_${++compteur}`;
    const s = {
      id, object: "checkout.session", status: "open", payment_status: "unpaid", url: `http://localhost:${port}/c/pay/${id}`,
      amount_total: Number(p.get("line_items[0][price_data][unit_amount]")), currency: p.get("line_items[0][price_data][currency]"),
      client_reference_id: p.get("client_reference_id"), payment_intent: null, mode: p.get("mode"),
      metadata: { commande: p.get("metadata[commande]"), formule: p.get("metadata[formule]"), compte: p.get("metadata[compte]") },
      success_url: p.get("success_url"), cancel_url: p.get("cancel_url"),
    };
    sessions.set(id, s);
    return envoyer(res, 200, s);
  }
  const lecture = url.pathname.match(/^\/v1\/checkout\/sessions\/([\w-]+)$/);
  if (lecture && req.method === "GET") {
    if (!auth.startsWith("Bearer sk_test_")) return envoyer(res, 401, { error: { code: "cle_invalide" } });
    const s = sessions.get(lecture[1]);
    return s ? envoyer(res, 200, s) : envoyer(res, 404, { error: { code: "resource_missing" } });
  }
  const pagePaiement = url.pathname.match(/^\/c\/pay\/([\w-]+)(?:\/([\w-]+))?$/);
  if (pagePaiement) {
    const s = sessions.get(pagePaiement[1]);
    if (!s) return envoyer(res, 404, "Session inconnue", "text/plain; charset=utf-8");
    const action = pagePaiement[2];
    if (!action) return envoyer(res, 200, page(s), "text/html; charset=utf-8");
    if (action.startsWith("payer")) {
      Object.assign(s, { status: "complete", payment_status: "paid", payment_intent: `pi_${s.id}` });
      if (action === "payer") await notifier("checkout.session.completed", s);
      if (action === "payer-deux-fois") { const id = `evt_simule_${++compteur}`; await notifier("checkout.session.completed", s, id); await notifier("checkout.session.completed", s, id); }
      res.writeHead(303, { Location: s.success_url }); return res.end();
    }
    if (action === "refuser") {
      Object.assign(s, { status: "complete", payment_status: "unpaid" });
      await notifier("checkout.session.async_payment_failed", s);
      res.writeHead(303, { Location: s.success_url }); return res.end();
    }
    if (action === "annuler") { res.writeHead(303, { Location: s.cancel_url }); return res.end(); }
  }
  // Remboursement déclenché par un test : POST /test/rembourser/:id
  const remb = url.pathname.match(/^\/test\/rembourser\/([\w-]+)$/);
  if (remb && req.method === "POST") {
    const s = sessions.get(remb[1]);
    if (!s?.payment_intent) return envoyer(res, 404, { ok: false });
    return envoyer(res, 200, { ok: true, statut: await notifier("charge.refunded", { payment_intent: s.payment_intent, refunded: true, amount_refunded: s.amount_total }) });
  }
  if (url.pathname === "/") return envoyer(res, 200, "Simulateur Stripe local", "text/plain; charset=utf-8");
  envoyer(res, 404, { error: { code: "inconnu" } });
}).listen(port, () => console.log(`Simulateur Stripe (test) : http://localhost:${port}/ → notifications vers ${site}`));
