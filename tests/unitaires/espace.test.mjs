// Tests des comptes, du paiement (Stripe simulé, AUCUN paiement réel) et des droits d'accès.
import { test } from "node:test";
import assert from "node:assert/strict";
import { traiterEspace } from "../../serveur/espace.js";
import { creerStockage } from "../../serveur/stockage.js";
import { signer, verifierSignature, modePaiement } from "../../serveur/stripe.js";
import { pointsBloquants, catalogueParDefaut } from "../../serveur/formation.js";
import site from "../../src/data/site.json" with { type: "json" };

const SECRET = "whsec_test_unitaire";
const ENV_TEST = { STRIPE_SECRET_KEY: "sk_test_unitaire", STRIPE_WEBHOOK_SECRET: SECRET };
const PRIX = { essentiel: 1490, complet: 2490, accompagne: 5490 };

/** Faux Stripe : enregistre les appels et garde les sessions créées (aucun appel réseau). */
function fauxStripe() {
  const sessions = new Map();
  const appels = [];
  const fetchFn = async (url, init) => {
    appels.push({ url, init });
    const u = new URL(url);
    if (init.method === "POST" && u.pathname === "/v1/checkout/sessions") {
      const p = new URLSearchParams(init.body);
      const id = `cs_test_${sessions.size + 1}`;
      const s = {
        id, object: "checkout.session", url: `https://checkout.stripe.com/c/pay/${id}`, status: "open", payment_status: "unpaid",
        amount_total: Number(p.get("line_items[0][price_data][unit_amount]")), currency: p.get("line_items[0][price_data][currency]"),
        client_reference_id: p.get("client_reference_id"), metadata: { commande: p.get("metadata[commande]"), formule: p.get("metadata[formule]") },
        payment_intent: `pi_${id}`, mode: p.get("mode"),
      };
      sessions.set(id, s);
      return new Response(JSON.stringify(s), { status: 200 });
    }
    const m = u.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/);
    if (init.method === "GET" && m && sessions.has(m[1])) return new Response(JSON.stringify(sessions.get(m[1])), { status: 200 });
    return new Response(JSON.stringify({ error: { code: "resource_missing" } }), { status: 404 });
  };
  return { fetchFn, sessions, appels };
}

function banc(env = ENV_TEST, extra = {}) {
  const stripe = fauxStripe();
  let horloge = Date.parse("2026-11-02T10:00:00Z");
  const ctx = { env, stockage: creerStockage("memoire"), ip: "203.0.113.9", fetchFn: stripe.fetchFn, maintenant: () => horloge, ...extra };
  const appel = async (chemin, { methode = "GET", corps, cookie, entetes = {} } = {}) => {
    const r = await traiterEspace(new Request(`http://localhost${chemin}`, {
      method: methode,
      headers: { ...(corps !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...entetes },
      body: corps === undefined ? undefined : typeof corps === "string" ? corps : JSON.stringify(corps),
    }), ctx);
    return { statut: r.status, data: await r.clone().json().catch(() => null), cookie: r.headers.get("set-cookie")?.split(";")[0], reponse: r };
  };
  const compte = async (email = "lea@exemple.fr", mdp = "motdepasse-solide") => {
    const r = await appel("/api/compte/creation", { methode: "POST", corps: { prenom: "Léa", email, motDePasse: mdp, confidentialite: true } });
    assert.equal(r.statut, 201);
    return r.cookie;
  };
  const notifier = async (ev, secret = SECRET) => {
    const corps = JSON.stringify({ livemode: false, ...ev });
    return appel("/api/paiement/webhook", { methode: "POST", corps, entetes: { "Stripe-Signature": signer(corps, secret, Math.floor(horloge / 1000)) } });
  };
  const acheter = async (cookie, formule, accords = { cgv: true, accesImmediat: true }) =>
    appel("/api/paiement/session", { methode: "POST", cookie, corps: { formule, ...accords } });
  const payer = (sessionId) => { const s = stripe.sessions.get(sessionId); s.status = "complete"; s.payment_status = "paid"; return s; };
  return { ctx, appel, compte, notifier, acheter, payer, stripe, avancer: (ms) => { horloge += ms; } };
}

const sessionDe = (b, ref) => [...b.stripe.sessions.values()].find((s) => s.metadata.commande === ref);
const ouvertes = (data) => data.modules.flatMap((m) => m.lecons).filter((l) => l.acces === "ouvert").map((l) => l.id);
const ressource = (data, id) => data.ressources.find((r) => r.id === id).acces;

// ---------------------------------------------------------------- Catalogue
test("catalogue : chaque formule de site.json a ses droits ; les éléments « En préparation » restent bloquants", () => {
  for (const f of site.formules) assert.ok(catalogueParDefaut.acces[f.id], f.id);
  assert.deepEqual(pointsBloquants("essentiel").length > 0, true);
  // Complet contient tout l'Essentiel ; Accompagné contient tout le Complet (textes des formules).
  for (const d of catalogueParDefaut.acces.essentiel) assert.ok(catalogueParDefaut.acces.complet.includes(d));
  for (const d of catalogueParDefaut.acces.complet) assert.ok(catalogueParDefaut.acces.accompagne.includes(d));
});

test("mode de paiement : test, réel ou non configuré ; jamais sans secret de notification", () => {
  assert.equal(modePaiement({}), null);
  assert.equal(modePaiement({ STRIPE_SECRET_KEY: "sk_test_x" }), null);
  assert.equal(modePaiement(ENV_TEST), "test");
  assert.equal(modePaiement({ STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x" }), "reel");
});

test("signature des notifications : bonne acceptée ; corps modifié, mauvais secret ou trop ancienne refusés", () => {
  const corps = '{"id":"evt_1"}';
  const t = 1_800_000_000;
  const sig = signer(corps, SECRET, t);
  assert.equal(verifierSignature(corps, sig, SECRET, t), true);
  assert.equal(verifierSignature(corps.replace("1", "2"), sig, SECRET, t), false);
  assert.equal(verifierSignature(corps, signer(corps, "whsec_autre", t), SECRET, t), false);
  assert.equal(verifierSignature(corps, sig, SECRET, t + 301), false);
  assert.equal(verifierSignature(corps, "n'importe quoi", SECRET, t), false);
});

// ---------------------------------------------------------------- Comptes
test("compte : création, session par cookie HttpOnly, mot de passe jamais stocké en clair", async () => {
  const b = banc();
  const r = await b.appel("/api/compte/creation", { methode: "POST", corps: { prenom: "Léa", email: "Lea@Exemple.fr", motDePasse: "motdepasse-solide", confidentialite: true } });
  assert.equal(r.statut, 201);
  const entete = r.reponse.headers.get("set-cookie");
  assert.match(entete, /HttpOnly/);
  assert.match(entete, /SameSite=Lax/);
  const brut = JSON.stringify([...b.ctx.stockage._contenu.values()]);
  assert.ok(!brut.includes("motdepasse-solide"));
  assert.equal((await b.appel("/api/compte/moi", { cookie: r.cookie })).data.prenom, "Léa");
  const doublon = await b.appel("/api/compte/creation", { methode: "POST", corps: { prenom: "L", email: "lea@exemple.fr", motDePasse: "autre-motdepasse", confidentialite: true } });
  assert.equal(doublon.statut, 409);
  const court = await b.appel("/api/compte/creation", { methode: "POST", corps: { prenom: "L", email: "x@exemple.fr", motDePasse: "court", confidentialite: true } });
  assert.equal(court.statut, 400);
});

test("connexion : mauvais mot de passe refusé, déconnexion effective, autre site refusé", async () => {
  const b = banc();
  const c = await b.compte();
  assert.equal((await b.appel("/api/compte/connexion", { methode: "POST", corps: { email: "lea@exemple.fr", motDePasse: "mauvais-mot" } })).statut, 401);
  assert.equal((await b.appel("/api/compte/connexion", { methode: "POST", corps: { email: "inconnu@exemple.fr", motDePasse: "mauvais-mot" } })).statut, 401);
  assert.equal((await b.appel("/api/compte/deconnexion", { methode: "POST", cookie: c, corps: {} })).statut, 200);
  assert.equal((await b.appel("/api/compte/moi", { cookie: c })).data.connecte, false);
  const ok = await b.appel("/api/compte/connexion", { methode: "POST", corps: { email: "LEA@exemple.fr", motDePasse: "motdepasse-solide" } });
  assert.equal(ok.statut, 200);
  assert.equal((await b.appel("/api/compte/moi", { cookie: ok.cookie })).data.connecte, true);
  const ext = await b.appel("/api/compte/connexion", { methode: "POST", corps: { email: "lea@exemple.fr", motDePasse: "x" }, entetes: { Origin: "https://autre-site.example" } });
  assert.equal(ext.statut, 403);
});

test("connexion : trop d'essais pour une même adresse → 429", async () => {
  const b = banc();
  await b.compte();
  let dernier;
  for (let i = 0; i < 11; i++) dernier = await b.appel("/api/compte/connexion", { methode: "POST", corps: { email: "lea@exemple.fr", motDePasse: "mauvais-mot" } });
  assert.equal(dernier.statut, 429);
});

// ---------------------------------------------------------------- Paiement
test("sans clés Stripe : paiement « non configuré », aucune page de paiement créée", async () => {
  const b = banc({});
  const c = await b.compte();
  const etat = await b.appel("/api/paiement/etat");
  assert.equal(etat.data.mode, null);
  assert.equal(etat.data.ventes.complet.ouverte, false);
  const r = await b.acheter(c, "complet");
  assert.equal(r.statut, 503);
  assert.equal(b.stripe.appels.length, 0);
});

test("mode réel : ventes fermées tant que paiement.actif = false et que des contenus sont en préparation", async () => {
  assert.equal(site.paiement.actif, false);
  const b = banc({ STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x" });
  const c = await b.compte();
  const etat = await b.appel("/api/paiement/etat");
  assert.equal(etat.data.mode, "reel");
  assert.ok(etat.data.ventes.essentiel.raisons.includes("ventes_fermees"));
  assert.ok(etat.data.ventes.essentiel.raisons.includes("contenus_en_preparation"));
  const r = await b.acheter(c, "essentiel");
  assert.equal(r.statut, 403);
  assert.equal(b.stripe.appels.length, 0);
});

test("achat : connexion obligatoire, CGV obligatoires, montant fixé par le serveur (paiement unique)", async () => {
  const b = banc();
  assert.equal((await b.acheter(undefined, "complet")).statut, 401);
  const c = await b.compte();
  assert.equal((await b.acheter(c, "complet", { cgv: false })).statut, 400);
  assert.equal((await b.acheter(c, "inexistante", { cgv: true })).statut, 400);
  const r = await b.appel("/api/paiement/session", { methode: "POST", cookie: c, corps: { formule: "complet", cgv: true, prix: 1, montant: 1 } });
  assert.equal(r.statut, 201);
  assert.match(r.data.url, /^https:\/\/checkout\.stripe\.com\//);
  const corps = new URLSearchParams(b.stripe.appels[0].init.body);
  assert.equal(corps.get("line_items[0][price_data][unit_amount]"), "2490");
  assert.equal(corps.get("mode"), "payment");
  assert.match(corps.get("success_url"), /\/formation\/\?commande=CMD-/);
  assert.equal(b.stripe.appels[0].init.headers["Idempotency-Key"], `session-${r.data.reference}`);
  assert.equal(b.stripe.appels[0].init.headers.Authorization, "Bearer sk_test_unitaire");
});

for (const formule of ["essentiel", "complet", "accompagne"]) {
  test(`formule ${formule} : un paiement confirmé débloque exactement ses contenus, et rien d'autre`, async () => {
    const b = banc();
    const c = await b.compte();
    const avant = await b.appel("/api/formation", { cookie: c });
    assert.equal(avant.statut, 200);
    assert.deepEqual(ouvertes(avant.data), []);
    assert.equal((await b.appel("/api/formation/lecon?id=m1-texte", { cookie: c })).statut, 403);

    const achat = await b.acheter(c, formule);
    const s = b.payer(sessionDe(b, achat.data.reference).id);
    assert.equal(s.amount_total, PRIX[formule]);
    const n = await b.notifier({ id: `evt_${formule}`, type: "checkout.session.completed", data: { object: s } });
    assert.equal(n.data.resultat, "payee");

    const apres = await b.appel("/api/formation", { cookie: c });
    assert.deepEqual(ouvertes(apres.data), ["m1-texte", "m2-texte", "m3-texte", "m4-texte", "m5-texte", "m6-texte"]);
    assert.equal(apres.data.formules[0].formule, formule);
    // Les vidéos et fiches sont incluses mais en préparation : signalées, jamais présentées comme disponibles.
    assert.equal(apres.data.modules[0].lecons.find((l) => l.type === "video").acces, "en-preparation");
    assert.equal(ressource(apres.data, "modeles"), formule === "essentiel" ? "non-inclus" : "en-preparation");
    assert.equal(ressource(apres.data, "avis"), formule === "accompagne" ? "a-definir" : "non-inclus");
    const lecon = await b.appel("/api/formation/lecon?id=m3-texte", { cookie: c });
    assert.equal(lecon.statut, 200);
    assert.ok(lecon.data.lecon.contenu.points.length > 0);
    assert.equal((await b.appel("/api/formation/lecon?id=m1-video", { cookie: c })).statut, 404);
    assert.equal((await b.appel("/api/formation/fichier?id=modeles", { cookie: c })).statut, formule === "essentiel" ? 403 : 404);
  });
}

test("redirection falsifiée : revenir sur /formation/?commande=… sans paiement ne débloque rien", async () => {
  const b = banc();
  const c = await b.compte();
  const achat = await b.acheter(c, "complet");
  const statut = await b.appel(`/api/paiement/statut?commande=${achat.data.reference}`, { cookie: c });
  assert.equal(statut.data.statut, "en-attente");
  assert.deepEqual(ouvertes((await b.appel("/api/formation", { cookie: c })).data), []);
  // Commande d'une autre personne, ou référence inventée : introuvable.
  const autre = await b.compte("autre@exemple.fr");
  assert.equal((await b.appel(`/api/paiement/statut?commande=${achat.data.reference}`, { cookie: autre })).statut, 404);
  assert.equal((await b.appel("/api/paiement/statut?commande=CMD-20261102-AAAAAA", { cookie: c })).statut, 404);
});

test("notification falsifiée (mauvaise signature) ou montant différent : aucun accès", async () => {
  const b = banc();
  const c = await b.compte();
  const achat = await b.acheter(c, "accompagne");
  const s = b.payer(sessionDe(b, achat.data.reference).id);
  const faux = await b.notifier({ id: "evt_faux", type: "checkout.session.completed", data: { object: s } }, "whsec_pirate");
  assert.equal(faux.statut, 400);
  const sansSignature = await b.appel("/api/paiement/webhook", { methode: "POST", corps: JSON.stringify({ id: "evt_x", type: "checkout.session.completed", data: { object: s } }) });
  assert.equal(sansSignature.statut, 400);
  const montant = await b.notifier({ id: "evt_montant", type: "checkout.session.completed", data: { object: { ...s, amount_total: 100 } } });
  assert.equal(montant.data.resultat, "anomalie");
  assert.deepEqual(ouvertes((await b.appel("/api/formation", { cookie: c })).data), []);
});

test("notifications répétées : un seul achat enregistré, aucun doublon", async () => {
  const b = banc();
  const c = await b.compte();
  const achat = await b.acheter(c, "complet");
  const s = b.payer(sessionDe(b, achat.data.reference).id);
  const ev = { id: "evt_repete", type: "checkout.session.completed", data: { object: s } };
  assert.equal((await b.notifier(ev)).data.resultat, "payee");
  assert.equal((await b.notifier(ev)).data.doublon, true);
  // Même paiement, autre identifiant de notification (ex. async_payment_succeeded) : toujours un seul achat.
  assert.equal((await b.notifier({ ...ev, id: "evt_autre", type: "checkout.session.async_payment_succeeded" })).data.resultat, "deja-traitee");
  const dossier = await b.ctx.stockage.lire("droits", (await b.ctx.stockage.lire("commandes", achat.data.reference)).compte);
  assert.equal(Object.keys(dossier.achats).length, 1);
  assert.equal(dossier.historique.filter((h) => h.action === "ouverture").length, 1);
  assert.equal((await b.acheter(c, "complet")).statut, 409);   // formule déjà détenue
});

test("paiement refusé, en attente ou abandonné : aucun accès", async () => {
  const b = banc();
  const c = await b.compte();
  const a1 = await b.acheter(c, "essentiel");
  const s1 = sessionDe(b, a1.data.reference);
  assert.equal((await b.notifier({ id: "evt_att", type: "checkout.session.completed", data: { object: { ...s1, status: "complete", payment_status: "unpaid" } } })).data.resultat, "paiement-en-attente");
  assert.equal((await b.notifier({ id: "evt_refus", type: "checkout.session.async_payment_failed", data: { object: s1 } })).data.resultat, "refuse");
  const a2 = await b.acheter(c, "complet");
  assert.equal((await b.notifier({ id: "evt_exp", type: "checkout.session.expired", data: { object: sessionDe(b, a2.data.reference) } })).data.resultat, "annule");
  assert.deepEqual(ouvertes((await b.appel("/api/formation", { cookie: c })).data), []);
  assert.equal((await b.ctx.stockage.lire("commandes", a1.data.reference)).statut, "refuse");
});

test("vérification au retour : le serveur interroge Stripe lui-même si la notification tarde", async () => {
  const b = banc();
  const c = await b.compte();
  const achat = await b.acheter(c, "essentiel");
  b.payer(sessionDe(b, achat.data.reference).id);
  const r = await b.appel(`/api/paiement/statut?commande=${achat.data.reference}`, { cookie: c });
  assert.equal(r.data.statut, "payee");
  assert.ok(b.stripe.appels.some((a) => a.init.method === "GET"));
  assert.equal(ouvertes((await b.appel("/api/formation", { cookie: c })).data).length, 6);
});

test("remboursement total : l'accès est retiré ; partiel : accès conservé", async () => {
  const b = banc();
  const c = await b.compte();
  const achat = await b.acheter(c, "complet");
  const s = b.payer(sessionDe(b, achat.data.reference).id);
  await b.notifier({ id: "evt_ok", type: "checkout.session.completed", data: { object: s } });
  await b.notifier({ id: "evt_rp", type: "charge.refunded", data: { object: { payment_intent: s.payment_intent, refunded: false, amount_refunded: 500 } } });
  assert.equal(ouvertes((await b.appel("/api/formation", { cookie: c })).data).length, 6);
  await b.notifier({ id: "evt_rt", type: "charge.refunded", data: { object: { payment_intent: s.payment_intent, refunded: true, amount_refunded: 2490 } } });
  assert.deepEqual(ouvertes((await b.appel("/api/formation", { cookie: c })).data), []);
  assert.equal((await b.ctx.stockage.lire("commandes", achat.data.reference)).statut, "rembourse");
});

test("notification du mode test reçue par un site en mode réel : ignorée", async () => {
  const b = banc();
  const corps = JSON.stringify({ id: "evt_live", livemode: true, type: "checkout.session.completed", data: { object: {} } });
  const r = await b.appel("/api/paiement/webhook", { methode: "POST", corps, entetes: { "Stripe-Signature": signer(corps, SECRET, Math.floor(b.ctx.maintenant() / 1000)) } });
  assert.equal(r.data.ignore, "mode_different");
});

test("sans accord d'accès immédiat : droit de rétractation conservé, accès ouvert après 14 jours", async () => {
  const b = banc();
  const c = await b.compte();
  const achat = await b.acheter(c, "essentiel", { cgv: true, accesImmediat: false });
  const s = b.payer(sessionDe(b, achat.data.reference).id);
  await b.notifier({ id: "evt_14j", type: "checkout.session.completed", data: { object: s } });
  const r = await b.appel("/api/formation", { cookie: c });
  assert.deepEqual(ouvertes(r.data), []);
  assert.equal(r.data.formules[0].ouvert, false);
  b.avancer(14 * 24 * 3_600_000);
  assert.equal(ouvertes((await b.appel("/api/formation", { cookie: c })).data).length, 6);
});

test("progression : enregistrée dans le compte, retrouvée après déconnexion et reconnexion", async () => {
  const b = banc();
  const c = await b.compte();
  const achat = await b.acheter(c, "essentiel");
  await b.notifier({ id: "evt_p", type: "checkout.session.completed", data: { object: b.payer(sessionDe(b, achat.data.reference).id) } });
  const p = await b.appel("/api/formation/progression", { methode: "POST", cookie: c, corps: { lecon: "m1-texte", fait: true } });
  assert.deepEqual(p.data.progression, { faites: 1, total: 6 });
  assert.equal((await b.appel("/api/formation/progression", { methode: "POST", cookie: c, corps: { lecon: "m1-video", fait: true } })).statut, 404);
  await b.appel("/api/compte/deconnexion", { methode: "POST", cookie: c, corps: {} });
  assert.equal((await b.appel("/api/formation", { cookie: c })).statut, 401);
  const re = await b.appel("/api/compte/connexion", { methode: "POST", corps: { email: "lea@exemple.fr", motDePasse: "motdepasse-solide" } });
  const vue = await b.appel("/api/formation", { cookie: re.cookie });
  assert.equal(vue.data.progression.faites, 1);
  assert.equal(vue.data.prochaine, "m2-texte");
});

test("téléchargement protégé : servi seulement à une personne qui a le droit", async () => {
  const catalogue = structuredClone(catalogueParDefaut);
  Object.assign(catalogue.modules[0].lecons[2], { statut: "disponible", fichier: "fiche-m1.pdf" });
  const b = banc(ENV_TEST, { catalogue });
  b.ctx.stockage._contenu.set("fichier:fichiers-formation/fiche-m1.pdf", new Uint8Array([37, 80, 68, 70]));
  const sansCompte = await b.appel("/api/formation/fichier?id=m1-fiche");
  assert.equal(sansCompte.statut, 401);
  const c = await b.compte();
  assert.equal((await b.appel("/api/formation/fichier?id=m1-fiche", { cookie: c })).statut, 403);
  const achat = await b.acheter(c, "essentiel");
  await b.notifier({ id: "evt_f", type: "checkout.session.completed", data: { object: b.payer(sessionDe(b, achat.data.reference).id) } });
  const ok = await b.appel("/api/formation/fichier?id=m1-fiche", { cookie: c });
  assert.equal(ok.statut, 200);
  assert.match(ok.reponse.headers.get("cache-control"), /no-store/);
  assert.match(ok.reponse.headers.get("content-disposition"), /attachment/);
});
