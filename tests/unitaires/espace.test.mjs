// Tests des comptes, du paiement (Stripe simulé, AUCUN paiement réel) et des droits d'accès.
import { test } from "node:test";
import assert from "node:assert/strict";
import { traiterEspace } from "../../serveur/espace.js";
import { creerStockage } from "../../serveur/stockage.js";
import { signer, verifierSignature, modePaiement } from "../../serveur/stripe.js";
import { pointsBloquants, catalogueParDefaut } from "../../serveur/formation.js";
import { raisonsBlocageReel, conditionsParDefaut } from "../../serveur/ouverture.js";
import { CONTENUS } from "../../serveur/contenus/index.js";
import { contenuOffre, comparatif } from "../../src/lib/offres.js";
import site from "../../src/data/site.json" with { type: "json" };

const SECRET = "whsec_test_unitaire";
const ENV_TEST = { STRIPE_SECRET_KEY: "sk_test_unitaire", STRIPE_WEBHOOK_SECRET: SECRET };
const PRIX = { essentiel: 1490, complet: 2490, accompagne: 5490 };
const ATTENDU = { essentiel: 37, complet: 43, accompagne: 43 };

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
  for (const code of ["contenus_non_valides", "information_legale_manquante", "cgv_non_relues", "duree_acces_non_definie", "confirmation_email_impossible", "regles_non_verifiees"]) {
    assert.ok(etat.data.ventes.essentiel.raisons.includes(code), code);
  }
  assert.ok(etat.data.ventes.accompagne.raisons.includes("accompagnement_non_defini"));
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
    assert.equal((await b.appel("/api/formation/lecon?id=m1-l1", { cookie: c })).statut, 403);

    const achat = await b.acheter(c, formule);
    const s = b.payer(sessionDe(b, achat.data.reference).id);
    assert.equal(s.amount_total, PRIX[formule]);
    const n = await b.notifier({ id: `evt_${formule}`, type: "checkout.session.completed", data: { object: s } });
    assert.equal(n.data.resultat, "payee");

    const apres = await b.appel("/api/formation", { cookie: c });
    // Les 6 modules pour toutes les formules : 19 leçons + 6 exercices + 6 checklists + 6 fiches (+ 6 modèles hors Essentiel).
    assert.equal(ouvertes(apres.data).length, ATTENDU[formule]);
    for (const m of apres.data.modules) assert.ok(m.lecons.some((l) => l.type === "lecon" && l.acces === "ouvert"), m.id);
    assert.equal(apres.data.formules[0].formule, formule);
    // Les vidéos sont incluses mais en préparation : signalées, jamais présentées comme disponibles.
    assert.equal(apres.data.modules[0].lecons.find((l) => l.type === "video").acces, "en-preparation");
    assert.equal(apres.data.modules[0].lecons.find((l) => l.type === "modele").acces, formule === "essentiel" ? "non-inclus" : "ouvert");
    assert.equal(ressource(apres.data, "communaute"), formule === "essentiel" ? "non-inclus" : "en-preparation");
    assert.equal(ressource(apres.data, "avis"), formule === "accompagne" ? "a-definir" : "non-inclus");
    const lecon = await b.appel("/api/formation/lecon?id=m3-l2", { cookie: c });
    assert.equal(lecon.statut, 200);
    assert.equal(lecon.data.lecon.statut, "brouillon");
    assert.ok(lecon.data.lecon.contenu.sections.length > 0);
    assert.equal((await b.appel("/api/formation/lecon?id=m1-video", { cookie: c })).statut, 404);
    const modele = await b.appel("/api/formation/lecon?id=m2-modele", { cookie: c });
    assert.equal(modele.statut, formule === "essentiel" ? 403 : 200);
    const fichier = await b.appel("/api/formation/fichier?id=m2-modele", { cookie: c });
    assert.equal(fichier.statut, formule === "essentiel" ? 403 : 200);
    if (formule !== "essentiel") assert.match(await fichier.reponse.text(), /# Modèle : fiche de cadrage du MVP/);
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
  assert.equal(ouvertes((await b.appel("/api/formation", { cookie: c })).data).length, ATTENDU.essentiel);
});

test("remboursement total : l'accès est retiré ; partiel : accès conservé", async () => {
  const b = banc();
  const c = await b.compte();
  const achat = await b.acheter(c, "complet");
  const s = b.payer(sessionDe(b, achat.data.reference).id);
  await b.notifier({ id: "evt_ok", type: "checkout.session.completed", data: { object: s } });
  await b.notifier({ id: "evt_rp", type: "charge.refunded", data: { object: { payment_intent: s.payment_intent, refunded: false, amount_refunded: 500 } } });
  assert.equal(ouvertes((await b.appel("/api/formation", { cookie: c })).data).length, ATTENDU.complet);
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
  assert.equal(ouvertes((await b.appel("/api/formation", { cookie: c })).data).length, ATTENDU.essentiel);
});

test("progression : enregistrée dans le compte, retrouvée après déconnexion et reconnexion", async () => {
  const b = banc();
  const c = await b.compte();
  const achat = await b.acheter(c, "essentiel");
  await b.notifier({ id: "evt_p", type: "checkout.session.completed", data: { object: b.payer(sessionDe(b, achat.data.reference).id) } });
  const p = await b.appel("/api/formation/progression", { methode: "POST", cookie: c, corps: { lecon: "m1-l1", fait: true } });
  assert.deepEqual(p.data.progression, { faites: 1, total: ATTENDU.essentiel });
  assert.equal((await b.appel("/api/formation/progression", { methode: "POST", cookie: c, corps: { lecon: "m1-video", fait: true } })).statut, 404);
  await b.appel("/api/compte/deconnexion", { methode: "POST", cookie: c, corps: {} });
  assert.equal((await b.appel("/api/formation", { cookie: c })).statut, 401);
  const re = await b.appel("/api/compte/connexion", { methode: "POST", corps: { email: "lea@exemple.fr", motDePasse: "motdepasse-solide" } });
  const vue = await b.appel("/api/formation", { cookie: re.cookie });
  assert.equal(vue.data.progression.faites, 1);
  assert.equal(vue.data.prochaine, "m1-l2");
});

test("téléchargement protégé : servi seulement à une personne qui a le droit", async () => {
  const catalogue = structuredClone(catalogueParDefaut);
  const fiche = catalogue.modules[0].lecons.find((l) => l.id === "m1-fiche");
  Object.assign(fiche, { type: "fiche-pdf", statut: "valide", fichier: "fiche-m1.pdf" });
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

// ---------------------------------------------------------------- Contenus et offres
test("contenus : chaque élément rédigé du catalogue a un texte ; chaque module a objectifs, exercice, fiche, modèle, checklist", () => {
  for (const m of catalogueParDefaut.modules) {
    const c = CONTENUS[m.id];
    assert.ok(c.objectifs.length >= 3, m.id);
    assert.ok(c.lecons.length >= 3, m.id);
    for (const l of c.lecons) assert.ok(l.sections.length >= 2 && l.aRetenir.length >= 2, l.id);
    assert.ok(c.exercice.criteres.length >= 3 && c.exercice.corrige.paragraphes.length >= 1, m.id);
    assert.ok(c.fiche.points.length >= 5 && c.modele.sections.length >= 2 && c.checklist.length >= 5, m.id);
    for (const e of m.lecons.filter((x) => x.type === "lecon")) assert.ok(c.lecons.some((l) => l.id === e.id), e.id);
  }
});

test("contenus : rien n'est marqué « valide » sans validation d'Arthur ; les vidéos restent en préparation", () => {
  const elements = catalogueParDefaut.modules.flatMap((m) => m.lecons);
  assert.equal(elements.filter((e) => e.statut === "valide").length, 0);
  for (const v of elements.filter((e) => e.type === "video")) assert.equal(v.statut, "en-preparation");
  assert.equal(catalogueParDefaut.ressources.find((r) => r.id === "communaute").statut, "en-preparation");
});

test("contenus : les exemples chiffrés sont annoncés comme fictifs, aucune promesse de revenus", () => {
  const texte = JSON.stringify(CONTENUS);
  for (const interdit of [/garanti(?!s\.)/i, /revenu passif/i, /devenez riche/i, /\d+ ?000 ?€ par mois/]) assert.doesNotMatch(texte.replace("ne peuvent pas être garantis", ""), interdit);
  const exemples = texte.match(/Exemple[^"]{0,40}/g) || [];
  assert.ok(exemples.length > 10);
  for (const e of exemples) assert.match(e, /fictif|Exemple :|Exemple de (bilan|fiche|plan|calcul|corrigé)|Exemples/i, e);
});

test("offres : une seule source pour les tarifs, la commande et l'espace (formation.json)", () => {
  assert.deepEqual(contenuOffre("essentiel").map((x) => x.droit), catalogueParDefaut.acces.essentiel);
  assert.equal(contenuOffre("essentiel")[0].statut, "brouillon");
  assert.equal(contenuOffre("complet").find((x) => x.droit === "videos").statut, "en-preparation");
  assert.equal(contenuOffre("accompagne").find((x) => x.droit === "avis").statut, "a-definir");
  const lignes = comparatif();
  assert.deepEqual(lignes.find((l) => l.droit === "lecons").formules, [true, true, true]);
  assert.deepEqual(lignes.find((l) => l.droit === "avis").formules, [false, false, true]);
});

// ---------------------------------------------------------------- Ouverture des ventes réelles
test("vente réelle : bloquée côté serveur tant qu'une condition manque, même si on force paiement.actif", async () => {
  const configOuverte = { ...site, paiement: { ...site.paiement, actif: true } };
  const r = raisonsBlocageReel("complet", { BREVO_API_KEY: "x", EMAIL_EXPEDITEUR: "a@b.fr", SITE_URL: "https://exemple.fr" }, { config: configOuverte });
  assert.ok(r.some((x) => x.code === "information_legale_manquante"));
  assert.ok(!r.some((x) => x.code === "ventes_fermees"));
  const b = banc({ STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x", BREVO_API_KEY: "x", EMAIL_EXPEDITEUR: "a@b.fr" }, { config: configOuverte });
  const c = await b.compte();
  const achat = await b.acheter(c, "complet");
  assert.equal(achat.statut, 403);
  assert.equal(b.stripe.appels.filter((a) => a.url.includes("checkout")).length, 0, "aucune session de paiement réelle créée");
});

test("vente réelle : possible seulement quand TOUT est rempli (simulation avec données factices de test)", () => {
  const complet = structuredClone(site);
  complet.paiement.actif = true;
  for (const k of Object.keys(complet.entreprise)) complet.entreprise[k] = "valeur de test";
  complet.regimeTva = "franchise";
  for (const o of [complet.mediateur, complet.hebergeur]) for (const k of Object.keys(o)) o[k] = "valeur de test";
  const cfg = structuredClone(conditionsParDefaut);
  Object.assign(cfg.juridique, { cgvRelues: true, reglesVerifieesSourcesOfficielles: true });
  cfg.frequencePaiement.confirmeeParArthur = true;
  cfg.dureeAcces.valeur = "a-vie";
  cfg.ouvertureSansRenonciation.validee = true;
  cfg.contenusValides = true;
  const catalogue = structuredClone(catalogueParDefaut);
  for (const m of catalogue.modules) for (const l of m.lecons) if (l.droit !== "videos") l.statut = "valide";
  catalogue.acces.essentiel = ["lecons", "fiches"];   // essai : sans les vidéos en préparation
  const env = { BREVO_API_KEY: "x", EMAIL_EXPEDITEUR: "a@b.fr", SITE_URL: "https://exemple.fr" };
  assert.deepEqual(raisonsBlocageReel("essentiel", env, { cfg, config: complet, catalogue }), []);
  assert.ok(raisonsBlocageReel("complet", env, { cfg, config: complet, catalogue }).length > 0, "communauté en préparation");
});

// ---------------------------------------------------------------- Ouverture et durée d'accès
for (const [ouverture, accepte, attendu] of [["differee", false, "differe"], ["differee", true, "immediat"], ["immediate", false, "immediat"]]) {
  test(`ouverture ${ouverture}, accord d'accès immédiat ${accepte ? "donné" : "non donné"} → accès ${attendu}`, async () => {
    const cfg = structuredClone(conditionsParDefaut);
    cfg.ouvertureSansRenonciation.valeur = ouverture;
    const b = banc(ENV_TEST, { conditions: cfg });
    const c = await b.compte();
    const achat = await b.acheter(c, "essentiel", { cgv: true, accesImmediat: accepte });
    await b.notifier({ id: `evt_${ouverture}_${accepte}`, type: "checkout.session.completed", data: { object: b.payer(sessionDe(b, achat.data.reference).id) } });
    const n = ouvertes((await b.appel("/api/formation", { cookie: c })).data).length;
    assert.equal(n, attendu === "immediat" ? ATTENDU.essentiel : 0);
    const cmd = await b.ctx.stockage.lire("commandes", achat.data.reference);
    assert.equal(cmd.accords.accesImmediat.accepte, accepte, "preuve du choix conservée");
    assert.equal(cmd.conditions.version, cfg.versionConditions, "version des conditions conservée");
  });
}

test("durée d'accès : 12 mois → l'accès se ferme après un an ; non décidée → aucune date de fin, affichée « à définir »", async () => {
  const cfg = structuredClone(conditionsParDefaut);
  cfg.dureeAcces.valeur = "12-mois";
  const b = banc(ENV_TEST, { conditions: cfg });
  const c = await b.compte();
  const achat = await b.acheter(c, "essentiel");
  await b.notifier({ id: "evt_duree", type: "checkout.session.completed", data: { object: b.payer(sessionDe(b, achat.data.reference).id) } });
  const v = await b.appel("/api/formation", { cookie: c });
  assert.ok(v.data.formules[0].finLe);
  assert.equal(v.data.dureeAcces, cfg.dureeAcces.options["12-mois"]);
  b.avancer(366 * 24 * 3_600_000);
  // La session (30 jours) a expiré : on se reconnecte, l'accès de 12 mois est terminé.
  const re = await b.appel("/api/compte/connexion", { methode: "POST", corps: { email: "lea@exemple.fr", motDePasse: "motdepasse-solide" } });
  const apres = await b.appel("/api/formation", { cookie: re.cookie });
  assert.equal(ouvertes(apres.data).length, 0);
  assert.equal(apres.data.formules[0].termine, true);

  const b2 = banc();
  const c2 = await b2.compte();
  const a2 = await b2.acheter(c2, "essentiel");
  await b2.notifier({ id: "evt_sansduree", type: "checkout.session.completed", data: { object: b2.payer(sessionDe(b2, a2.data.reference).id) } });
  const v2 = await b2.appel("/api/formation", { cookie: c2 });
  assert.equal(v2.data.formules[0].finLe, null);
  assert.equal(v2.data.dureeAcces, null);
});

// ---------------------------------------------------------------- E-mails
function fauxBrevo(statut = 201) {
  const envois = [];
  const fetchFn = async (url, init) => {
    if (String(url).includes("/smtp/email")) { envois.push(JSON.parse(init.body)); return new Response(statut === "panne" ? "" : "{}", { status: statut === "panne" ? 503 : statut }); }
    return null;
  };
  return { envois, fetchFn };
}
const ENV_BREVO = { ...ENV_TEST, BREVO_API_KEY: "xkeysib-test", EMAIL_EXPEDITEUR: "contact@exemple.fr", SITE_URL: "https://exemple.fr" };

/** Banc où Stripe ET Brevo sont simulés. */
function bancEmails(statutBrevo = 201, extra = {}) {
  const brevo = fauxBrevo(statutBrevo);
  const b = banc(ENV_BREVO, extra);
  const fetchStripe = b.ctx.fetchFn;
  b.ctx.fetchFn = async (url, init) => (String(url).includes("/smtp/email") ? brevo.fetchFn(url, init) : fetchStripe(url, init));
  return { ...b, brevo };
}

test("e-mail de commande : accepté par Brevo → « accepte » ; contient date d'ouverture, accords, version, vendeur à compléter", async () => {
  const b = bancEmails();
  const c = await b.compte();
  const achat = await b.acheter(c, "complet");
  await b.notifier({ id: "evt_mail", type: "checkout.session.completed", data: { object: b.payer(sessionDe(b, achat.data.reference).id) } });
  const st = await b.appel(`/api/paiement/statut?commande=${achat.data.reference}`, { cookie: c });
  assert.equal(st.data.emailConfirmation, "accepte");
  const mail = b.brevo.envois.find((m) => m.subject.includes(achat.data.reference));
  assert.match(mail.textContent, /Votre accès est ouvert depuis le/);
  assert.match(mail.textContent, /Durée d’accès : durée d’accès \[à compléter\]/);
  assert.match(mail.textContent, /Je demande à accéder aux contenus numériques dès maintenant.* : oui/);
  assert.match(mail.textContent, /SIREN : \[à compléter\]/);
  assert.match(mail.textContent, /MODE TEST/);
});

test("e-mail : Brevo en panne → « echec » (jamais annoncé comme envoyé) ; non configuré → « non-configure »", async () => {
  const b = bancEmails("panne");
  const c = await b.compte();
  const achat = await b.acheter(c, "essentiel");
  await b.notifier({ id: "evt_panne", type: "checkout.session.completed", data: { object: b.payer(sessionDe(b, achat.data.reference).id) } });
  assert.equal((await b.appel(`/api/paiement/statut?commande=${achat.data.reference}`, { cookie: c })).data.emailConfirmation, "echec");
  assert.equal(ouvertes((await b.appel("/api/formation", { cookie: c })).data).length, ATTENDU.essentiel, "l'accès ne dépend pas de l'e-mail");
  const b2 = banc();
  const c2 = await b2.compte();
  const a2 = await b2.acheter(c2, "essentiel");
  await b2.notifier({ id: "evt_nc", type: "checkout.session.completed", data: { object: b2.payer(sessionDe(b2, a2.data.reference).id) } });
  assert.equal((await b2.appel(`/api/paiement/statut?commande=${a2.data.reference}`, { cookie: c2 })).data.emailConfirmation, "non-configure");
});

// ---------------------------------------------------------------- Mot de passe oublié
const lienDe = (mail) => mail.textContent.match(/#jeton=([\w-]+)/)[1];

test("mot de passe oublié : sans Brevo, parcours bloqué honnêtement (503) pour toutes les adresses", async () => {
  const b = banc();
  await b.compte();
  for (const email of ["lea@exemple.fr", "inconnu@exemple.fr"]) {
    const r = await b.appel("/api/compte/mot-de-passe-oublie", { methode: "POST", corps: { email } });
    assert.equal(r.statut, 503);
    assert.equal(r.data.code, "emails_non_configures");
  }
});

test("mot de passe oublié : même réponse que le compte existe ou non ; jeton jamais stocké en clair", async () => {
  const b = bancEmails();
  await b.compte();
  const oui = await b.appel("/api/compte/mot-de-passe-oublie", { methode: "POST", corps: { email: "lea@exemple.fr" } });
  const non = await b.appel("/api/compte/mot-de-passe-oublie", { methode: "POST", corps: { email: "inconnu@exemple.fr" } });
  assert.equal(oui.statut, non.statut);
  assert.deepEqual(oui.data, non.data);
  const mails = b.brevo.envois.filter((m) => m.subject.includes("Réinitialisation"));
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to[0].email, "lea@exemple.fr");
  const jeton = lienDe(mails[0]);
  assert.ok(jeton.length >= 40);
  assert.ok(!JSON.stringify([...b.ctx.stockage._contenu.values()]).includes(jeton));
});

test("réinitialisation : nouveau mot de passe, usage unique, anciennes sessions fermées, ancien mot de passe refusé", async () => {
  const b = bancEmails();
  const ancienneSession = await b.compte();
  await b.appel("/api/compte/mot-de-passe-oublie", { methode: "POST", corps: { email: "lea@exemple.fr" } });
  const jeton = lienDe(b.brevo.envois.find((m) => m.subject.includes("Réinitialisation")));
  assert.equal((await b.appel("/api/compte/reinitialiser", { methode: "POST", corps: { jeton, motDePasse: "court" } })).statut, 400);
  b.avancer(1000);
  const ok = await b.appel("/api/compte/reinitialiser", { methode: "POST", corps: { jeton, motDePasse: "nouvelle-phrase-solide" } });
  assert.equal(ok.statut, 200);
  assert.equal((await b.appel("/api/compte/reinitialiser", { methode: "POST", corps: { jeton, motDePasse: "encore-une-autre-phrase" } })).data.code, "lien_invalide");
  assert.equal((await b.appel("/api/compte/moi", { cookie: ancienneSession })).data.connecte, false);
  assert.equal((await b.appel("/api/compte/connexion", { methode: "POST", corps: { email: "lea@exemple.fr", motDePasse: "motdepasse-solide" } })).statut, 401);
  assert.equal((await b.appel("/api/compte/connexion", { methode: "POST", corps: { email: "lea@exemple.fr", motDePasse: "nouvelle-phrase-solide" } })).statut, 200);
});

test("réinitialisation : lien expiré après 30 minutes, jeton inventé refusé, demandes répétées limitées", async () => {
  const b = bancEmails();
  await b.compte();
  await b.appel("/api/compte/mot-de-passe-oublie", { methode: "POST", corps: { email: "lea@exemple.fr" } });
  const jeton = lienDe(b.brevo.envois.find((m) => m.subject.includes("Réinitialisation")));
  b.avancer(31 * 60_000);
  assert.equal((await b.appel("/api/compte/reinitialiser", { methode: "POST", corps: { jeton, motDePasse: "nouvelle-phrase-solide" } })).data.code, "lien_invalide");
  assert.equal((await b.appel("/api/compte/reinitialiser", { methode: "POST", corps: { jeton: "x".repeat(43), motDePasse: "nouvelle-phrase-solide" } })).data.code, "lien_invalide");
  let dernier;
  for (let i = 0; i < 4; i++) dernier = await b.appel("/api/compte/mot-de-passe-oublie", { methode: "POST", corps: { email: "lea@exemple.fr" } });
  assert.equal(dernier.statut, 429);
});

test("création de compte : e-mail de bienvenue « accepte » si Brevo accepte, sans bloquer le compte sinon", async () => {
  const b = bancEmails("panne");
  const r = await b.appel("/api/compte/creation", { methode: "POST", corps: { prenom: "Léa", email: "lea@exemple.fr", motDePasse: "motdepasse-solide", confidentialite: true } });
  assert.equal(r.statut, 201);
  assert.equal(r.data.email, "echec");
});
