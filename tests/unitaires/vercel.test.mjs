// Tests de l'adaptation à Vercel : stockage Redis (faux serveur REST) et reconstruction du chemin d'origine.
import test from "node:test";
import assert from "node:assert/strict";
import { creerStockage, redisConfigure } from "../../serveur/stockage.js";
import { requeteOriginale, adresseIp } from "../../serveur/vercel.js";

/** Faux Upstash : GET, SET (avec EX) et EVAL du script de comparaison-écriture, avec délais aléatoires. */
function fauxUpstash() {
  const m = new Map();
  const journal = [];
  const fetchFn = async (url, init) => {
    assert.equal(init.headers.Authorization, "Bearer jeton-test");
    const [cmd, ...a] = JSON.parse(init.body);
    journal.push([cmd, ...a]);
    await new Promise((ok) => setTimeout(ok, Math.random() * 6));
    let result = null;
    if (cmd === "GET") result = m.get(a[0]) ?? null;
    else if (cmd === "SET") { m.set(a[0], a[1]); result = "OK"; }
    else if (cmd === "EVAL") {
      const [, , k, attendu, nouveau] = a;
      const c = m.get(k);
      if ((c === undefined && attendu === "") || (c !== undefined && c === attendu)) { m.set(k, nouveau); result = 1; } else result = 0;
    }
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  return { fetchFn, m, journal };
}
const env = { UPSTASH_REDIS_REST_URL: "https://exemple.upstash.io/", UPSTASH_REDIS_REST_TOKEN: "jeton-test" };

test("Redis : sans variables, pas de stockage (réponse « non configuré »)", () => {
  assert.equal(creerStockage("redis", { env: {} }), null);
  assert.equal(redisConfigure({ KV_REST_API_URL: "https://a.io", KV_REST_API_TOKEN: "t" }).url, "https://a.io");
});

test("Redis : enregistrer, lire, absent, compteurs expirants", async () => {
  const f = fauxUpstash();
  const s = creerStockage("redis", { env, fetchFn: f.fetchFn });
  assert.equal(s.mode, "redis");
  assert.equal(await s.lire("commandes", "X"), null);
  await s.enregistrer("commandes", "X", { a: 1 });
  assert.deepEqual(await s.lire("commandes", "X"), { a: 1 });
  await s.enregistrer("compteurs", "c-1", { n: 1 });
  assert.ok(f.journal.some((j) => j[0] === "SET" && j[1] === "aurevia:compteurs:c-1" && j.includes("EX")));
});

test("Redis : modifier en parallèle ne perd aucune mise à jour", async () => {
  const f = fauxUpstash();
  const s = creerStockage("redis", { env, fetchFn: f.fetchFn });
  await Promise.all(Array.from({ length: 6 }, (_, i) => s.modifier("droits", "u", (v) => ({ ...(v ?? {}), [`k${i}`]: i }))));
  assert.equal(Object.keys(await s.lire("droits", "u")).length, 6);
  // undefined = ne rien changer
  assert.deepEqual(await s.modifier("droits", "u", () => undefined), await s.lire("droits", "u"));
});

test("Redis : fichiers protégés lus depuis le base64", async () => {
  const f = fauxUpstash();
  const s = creerStockage("redis", { env, fetchFn: f.fetchFn });
  assert.equal(await s.lireFichier("fichiers-formation", "a.pdf"), null);
  f.m.set("aurevia:fichiers-formation:a.pdf", Buffer.from([37, 80, 68, 70]).toString("base64"));
  assert.deepEqual([...(await s.lireFichier("fichiers-formation", "a.pdf"))], [37, 80, 68, 70]);
});

test("Redis : une erreur du service remonte (jamais de succès silencieux)", async () => {
  const s = creerStockage("redis", { env, fetchFn: async () => new Response(JSON.stringify({ error: "WRONGPASS" }), { status: 401 }) });
  await assert.rejects(() => s.lire("a", "b"), { name: "ErreurRedis" });
});

test("Vercel : le chemin d'origine et le corps brut sont reconstruits", async () => {
  const corps = '{"type":"x"}';
  const r = await requeteOriginale(new Request("https://site.vercel.app/api/espace?p=paiement/webhook&x=1", { method: "POST", headers: { "content-type": "application/json" }, body: corps }));
  const u = new URL(r.url);
  assert.equal(u.pathname, "/api/paiement/webhook");
  assert.equal(u.searchParams.get("x"), "1");
  assert.equal(u.searchParams.get("p"), null);
  assert.equal(await r.text(), corps);
  const g = await requeteOriginale(new Request("https://site.vercel.app/api/espace?p=formation%2Flecon&id=m1-l1"));
  assert.equal(new URL(g.url).pathname, "/api/formation/lecon");
  const direct = new Request("https://site.vercel.app/api/etat");
  assert.equal(await requeteOriginale(direct), direct);
});

test("Vercel : adresse IP lue dans les en-têtes", () => {
  assert.equal(adresseIp(new Request("https://a.b/", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } })), "1.2.3.4");
  assert.equal(adresseIp(new Request("https://a.b/", { headers: { "x-real-ip": "9.9.9.9" } })), "9.9.9.9");
  assert.equal(adresseIp(new Request("https://a.b/")), null);
});
