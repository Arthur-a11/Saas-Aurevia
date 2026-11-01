// Tests unitaires des fonctions serveur (aucun appel réseau réel : e-mails et IA sont simulés DANS LES TESTS uniquement).
import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { traiterInscription, traiterRetractation, traiterAssistant, traiterEtat, parametresAssistant } from "../../serveur/fonctions.js";
import { creerStockage } from "../../serveur/stockage.js";
import { validerInscription, validerRetractation } from "../../serveur/validation.js";
import site from "../../src/data/site.json" with { type: "json" };

const req = (url, corps, entetes = {}) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json", ...entetes }, body: JSON.stringify(corps) });
const INSCRIPTION = { prenom: "Marie", nom: "Durand", email: "marie@exemple.fr", profession: "Comptable", formule: "complet", confidentialite: true };
const ctxBase = (extra = {}) => ({ env: {}, stockage: creerStockage("memoire"), ip: "203.0.113.5", ...extra });

test("validation : champs obligatoires, e-mail, formule, case de confidentialité", () => {
  const r = validerInscription({});
  assert.equal(r.ok, false);
  for (const c of ["prenom", "nom", "email", "profession", "formule", "confidentialite"]) assert.ok(r.erreurs[c], c);
  assert.ok(validerInscription({ ...INSCRIPTION, email: "pas-un-email" }).erreurs.email);
  assert.ok(validerInscription({ ...INSCRIPTION, tel: "abc" }).erreurs.tel);
  assert.equal(validerInscription(INSCRIPTION).ok, true);
});

test("rétractation : date future refusée", () => {
  const r = validerRetractation({ ...INSCRIPTION, dateCommande: "2099-01-01", declaration: true }, new Date("2026-11-01"));
  assert.ok(r.erreurs.dateCommande);
});

test("inscription : sans stockage, réponse 503 « non configuré » (aucune simulation)", async () => {
  const r = await traiterInscription(req("/api/inscription", INSCRIPTION), { env: {}, stockage: null });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, "stockage_non_configure");
});

test("inscription : enregistrée, e-mail NON annoncé comme envoyé si Brevo n'est pas configuré", async () => {
  const ctx = ctxBase();
  const r = await traiterInscription(req("/api/inscription", INSCRIPTION), ctx);
  assert.equal(r.status, 201);
  const d = await r.json();
  assert.match(d.reference, /^INS-\d{8}-[A-Z0-9]{6}$/);
  assert.equal(d.emailConfirmation, "non-configure");
  const enr = await ctx.stockage.lire("inscriptions", d.reference);
  assert.equal(enr.valeurs.email, "marie@exemple.fr");
  assert.ok(enr.consentements.confidentialite.length > 20);
  assert.ok(!JSON.stringify(enr).includes("203.0.113.5"), "l'IP ne doit pas être stockée en clair");
});

test("inscription : e-mail « accepte » (accepté par Brevo, pas « reçu ») seulement si l'API d'envoi répond OK", async () => {
  const appels = [];
  const fauxFetch = async (url, o) => { appels.push([url, JSON.parse(o.body)]); return new Response("{}", { status: 201 }); };
  const ctx = ctxBase({ env: { BREVO_API_KEY: "x", EMAIL_EXPEDITEUR: "contact@exemple.fr" }, fetchFn: fauxFetch });
  const d = await (await traiterInscription(req("/api/inscription", INSCRIPTION), ctx)).json();
  assert.equal(d.emailConfirmation, "accepte");
  assert.equal(appels[0][1].to[0].email, "marie@exemple.fr");

  const ctxEchec = ctxBase({ env: { BREVO_API_KEY: "x", EMAIL_EXPEDITEUR: "c@e.fr" }, fetchFn: async () => new Response("", { status: 500 }) });
  const d2 = await (await traiterInscription(req("/api/inscription", INSCRIPTION), ctxEchec)).json();
  assert.equal(d2.emailConfirmation, "echec");
});

test("inscription : erreurs de champs renvoyées, robot refusé, autre site refusé, limite par heure", async () => {
  const ctx = ctxBase();
  const r = await traiterInscription(req("/api/inscription", { ...INSCRIPTION, email: "" }), ctx);
  assert.equal(r.status, 400);
  assert.ok((await r.json()).erreurs.email);
  assert.equal((await traiterInscription(req("/api/inscription", { ...INSCRIPTION, site_web: "spam" }), ctx)).status, 400);
  assert.equal((await traiterInscription(req("/api/inscription", INSCRIPTION, { Origin: "https://pirate.example" }), ctx)).status, 403);
  const ctx2 = ctxBase({ env: { LIMITE_FORMULAIRES_HEURE: "2" } });
  const statuts = [];
  for (let i = 0; i < 3; i++) statuts.push((await traiterInscription(req("/api/inscription", { ...INSCRIPTION, email: `personne${i}@exemple.fr` }), ctx2)).status);
  assert.deepEqual(statuts, [201, 201, 429]);
});

test("rétractation : enregistrée et horodatée, accusé « non-configure » sans e-mail", async () => {
  const ctx = ctxBase();
  const r = await traiterRetractation(req("/api/retractation", { ...INSCRIPTION, dateCommande: "2026-10-30", declaration: true }), ctx);
  assert.equal(r.status, 201);
  const d = await r.json();
  assert.match(d.reference, /^RET-/);
  assert.ok(Date.parse(d.recuLe));
  assert.equal(d.emailAccuse, "non-configure");
});

// ---------------------------------------------------------------- Assistant
const faux = (impl) => ({ beta: { messages: { create: impl } } });
const Q = { question: "Combien coûte la formule Complet ?" };

test("assistant : sans clé API, « non configuré » sans code d'erreur (le navigateur passe en mode secours)", async () => {
  const r = await traiterAssistant(req("/api/assistant", Q), ctxBase());
  assert.equal(r.status, 200);
  assert.equal((await r.json()).code, "assistant_non_configure");
});

test("assistant : paramètres de coût par défaut et requête envoyée", async () => {
  assert.deepEqual(parametresAssistant({}), { modele: "claude-opus-5-5", maxTokens: 1500, effort: "low", limiteIpJour: 20, limiteJour: 200, delaiMs: 8000 });
  assert.equal(parametresAssistant({ ASSISTANT_DELAI_MS: "60000" }).delaiMs, 9000, "jamais au-delà de la limite Netlify");
  let recu;
  const ctx = ctxBase({ env: { ANTHROPIC_API_KEY: "cle-test", ASSISTANT_IA: "active" }, clientAnthropic: faux(async (p) => { recu = p; return { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: "24,90 €." }] }; }) });
  const r = await traiterAssistant(req("/api/assistant", { ...Q, historique: [{ role: "assistant", texte: "Bonjour" }, { role: "user", texte: "Salut" }, { role: "assistant", texte: "Oui ?" }] }), ctx);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).reponse, "24,90 €.");
  assert.equal(recu.max_tokens, 1500);
  assert.equal(recu.output_config.effort, "low");
  assert.equal(recu.messages[0].role, "user");
  assert.equal(recu.messages.at(-1).content, Q.question);
  assert.ok(recu.system[0].text.includes("24,90 €"));
  assert.equal(recu.system[0].cache_control.type, "ephemeral");
});

test("assistant : limites par visiteur et globale", async () => {
  const ok = faux(async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] }));
  const ctx = ctxBase({ env: { ANTHROPIC_API_KEY: "k", ASSISTANT_IA: "active", ASSISTANT_LIMITE_IP_JOUR: "2" }, clientAnthropic: ok });
  const s = [];
  for (let i = 0; i < 3; i++) s.push((await traiterAssistant(req("/api/assistant", Q), ctx)).status);
  assert.deepEqual(s, [200, 200, 429]);
  const ctxG = ctxBase({ env: { ANTHROPIC_API_KEY: "k", ASSISTANT_IA: "active", ASSISTANT_LIMITE_JOUR: "1" }, clientAnthropic: ok });
  await traiterAssistant(req("/api/assistant", Q), { ...ctxG, ip: "198.51.100.1" });
  const r = await traiterAssistant(req("/api/assistant", Q), { ...ctxG, ip: "198.51.100.2" });
  assert.equal((await r.json()).code, "limite_globale");
});

test("assistant : surcharge, quota et clé invalide → 503, jamais de plantage", async () => {
  const erreur = (Classe, status) => { const e = Object.create(Classe.prototype); e.status = status; return e; };
  for (const [e, code] of [
    [erreur(Anthropic.RateLimitError, 429), "assistant_occupe"],
    [erreur(Anthropic.APIError, 529), "assistant_occupe"],
    [erreur(Anthropic.InternalServerError, 500), "assistant_indisponible"],
    [erreur(Anthropic.AuthenticationError, 401), "assistant_indisponible"],
    [new Error("réseau"), "assistant_indisponible"],
  ]) {
    const ctx = ctxBase({ env: { ANTHROPIC_API_KEY: "k", ASSISTANT_IA: "active" }, clientAnthropic: faux(async () => { throw e; }) });
    const orig = console.error; console.error = () => {};
    const r = await traiterAssistant(req("/api/assistant", Q), ctx);
    console.error = orig;
    assert.equal(r.status, 503);
    assert.equal((await r.json()).code, code);
  }
});

test("assistant : question vide ou trop longue refusée", async () => {
  const ctx = ctxBase({ env: { ANTHROPIC_API_KEY: "k", ASSISTANT_IA: "active" } });
  assert.equal((await traiterAssistant(req("/api/assistant", { question: "" }), ctx)).status, 400);
  assert.equal((await traiterAssistant(req("/api/assistant", { question: "x".repeat(601) }), ctx)).status, 400);
});

// ---------------------------------------------------------------- Corrections de la passe qualité
test("assistant : une clé seule ne suffit pas, il faut ASSISTANT_IA=active (aucune dépense par accident)", async () => {
  let appele = false;
  const ctx = ctxBase({ env: { ANTHROPIC_API_KEY: "k" }, clientAnthropic: faux(async () => { appele = true; return {}; }) });
  const r = await traiterAssistant(req("/api/assistant", Q), ctx);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, false);
  assert.equal(d.code, "assistant_non_configure");
  assert.equal(appele, false);
});

test("inscription : un second envoi avec le même e-mail ne crée pas de doublon", async () => {
  const ctx = ctxBase();
  const a = await (await traiterInscription(req("/api/inscription", INSCRIPTION), ctx)).json();
  const r2 = await traiterInscription(req("/api/inscription", { ...INSCRIPTION, email: "MARIE@exemple.fr", formule: "essentiel" }), ctx);
  assert.equal(r2.status, 200);
  const b = await r2.json();
  assert.equal(b.doublon, true);
  assert.equal(b.reference, a.reference);
  const inscriptions = [...ctx.stockage._contenu.keys()].filter((k) => k.startsWith("inscriptions/"));
  assert.equal(inscriptions.length, 1);
  assert.ok(![...ctx.stockage._contenu.keys()].some((k) => k.includes("marie@")), "e-mail jamais utilisé en clair comme clé");
});

test("inscription : après 24 h, une nouvelle inscription est possible", async () => {
  let t = Date.parse("2026-11-01T10:00:00Z");
  const ctx = ctxBase({ maintenant: () => t });
  const a = await (await traiterInscription(req("/api/inscription", INSCRIPTION), ctx)).json();
  t += 25 * 3_600_000;
  const b = await (await traiterInscription(req("/api/inscription", INSCRIPTION), ctx)).json();
  assert.notEqual(a.reference, b.reference);
  assert.equal(b.doublon, undefined);
});

test("rétractation : la même demande renvoyée garde sa première référence", async () => {
  const ctx = ctxBase();
  const corps = { ...INSCRIPTION, dateCommande: "2026-10-30", declaration: true };
  const a = await (await traiterRetractation(req("/api/retractation", corps), ctx)).json();
  const b = await (await traiterRetractation(req("/api/retractation", corps), ctx)).json();
  assert.equal(b.doublon, true);
  assert.equal(b.reference, a.reference);
  assert.equal(b.recuLe, a.recuLe);
});

test("anti-robot : formulaire envoyé moins de 1,5 s après l'ouverture refusé, envoi normal accepté", async () => {
  const t = Date.parse("2026-11-01T10:00:00Z");
  const ctx = ctxBase({ maintenant: () => t });
  const vite = await traiterInscription(req("/api/inscription", { ...INSCRIPTION, ouvert_le: t - 300 }), ctx);
  assert.equal(vite.status, 400);
  assert.equal((await vite.json()).code, "trop_rapide");
  const normal = await traiterInscription(req("/api/inscription", { ...INSCRIPTION, ouvert_le: t - 20_000 }), ctx);
  assert.equal(normal.status, 201);
});

test("taille : un corps annoncé trop gros est refusé sans être lu", async () => {
  const r = new Request("http://localhost/api/inscription", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "999999" }, body: JSON.stringify(INSCRIPTION) });
  const rep = await traiterInscription(r, ctxBase());
  assert.equal(rep.status, 400);
  assert.equal((await rep.json()).code, "requete_invalide");
});

test("journaux : aucune donnée personnelle en cas d'erreur de stockage", async () => {
  const lignes = [];
  const orig = console.error; console.error = (...a) => lignes.push(a.join(" "));
  const stockage = creerStockage("memoire");
  stockage.enregistrer = async (c) => { if (c === "inscriptions") throw new Error("marie@exemple.fr Durand"); };
  const r = await traiterInscription(req("/api/inscription", INSCRIPTION), { env: {}, stockage, ip: "1.2.3.4" });
  console.error = orig;
  assert.equal(r.status, 503);
  assert.ok(lignes.length > 0);
  assert.ok(lignes.every((l) => !l.includes("marie@") && !l.includes("Durand")), lignes.join("\n"));
});

test("état : oui/non uniquement, aucune valeur secrète renvoyée", async () => {
  const env = { SEL_EMPREINTE: "valeur-tres-secrete-123", ANTHROPIC_API_KEY: "sk-ant-secret", BREVO_API_KEY: "xkeysib-secret", EMAIL_EXPEDITEUR: "a@b.fr" };
  const r = await traiterEtat(new Request("http://localhost/api/etat"), { env, stockage: creerStockage("memoire"), deploiement: { id: "d1", contexte: "production" } });
  assert.equal(r.status, 200);
  const texte = await r.text();
  for (const secret of ["valeur-tres-secrete-123", "sk-ant-secret", "xkeysib-secret"]) assert.ok(!texte.includes(secret), secret);
  const d = JSON.parse(texte);
  assert.equal(d.configuration.selEmpreinte, true);
  assert.equal(d.configuration.emails, true);
  assert.equal(d.configuration.assistantIA, false, "la clé seule n'active pas l'IA");
  assert.equal(d.configuration.paiementActif, false);
  assert.equal(d.deploiement.id, "d1");
  assert.equal((await traiterEtat(new Request("http://localhost/api/etat", { method: "POST" }), { env })).status, 405);
});

test("lecture des variables Netlify : process.env et Netlify.env fusionnés", async () => {
  const { lireEnv } = await import("../../netlify/env.mjs");
  const avant = globalThis.Netlify;
  globalThis.Netlify = { env: { toObject: () => ({ SEL_EMPREINTE: "depuis-netlify-env" }) } };
  const { env, sources } = lireEnv();
  globalThis.Netlify = avant;
  assert.equal(env.SEL_EMPREINTE, "depuis-netlify-env");
  assert.equal(sources.netlifyEnv, true);
});
