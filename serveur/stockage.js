// Stockage des enregistrements (inscriptions, commandes, rétractations) et des compteurs de limites.
// Trois modes :
//  - "netlify"  : Netlify Blobs (en production sur Netlify, aucune clé à fournir) ;
//  - "redis"    : Redis par l'interface REST d'Upstash (Vercel Marketplace). Production sur Vercel ;
//  - "fichier"  : fichiers JSON dans un dossier local. DÉVELOPPEMENT ET TESTS UNIQUEMENT :
//                 ce n'est PAS un stockage persistant en production (le disque d'une fonction
//                 serveur est temporaire et non partagé). Les fonctions Netlify n'utilisent jamais ce mode ;
//  - "memoire"  : en mémoire (tests unitaires).
// Sans mode configuré, creerStockage() retourne null : les fonctions répondent alors « non configuré ».
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function creerStockage(mode, options = {}) {
  if (mode === "memoire") return stockageMemoire();
  if (mode === "fichier") return stockageFichier(options.dossier || ".donnees-locales");
  if (mode === "netlify") return stockageNetlify(options.getStore);
  if (mode === "redis") return stockageRedis(options);
  return null;
}

/**
 * Stockage Redis (Upstash, interface REST) pour Vercel. Aucune dépendance : de simples requêtes HTTPS.
 * Variables lues : UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN (ou KV_REST_API_URL et KV_REST_API_TOKEN,
 * noms posés par Vercel). Retourne null si elles manquent : les fonctions répondent alors « non configuré ».
 * options : { env, fetchFn } (fetchFn sert aux tests).
 */
export function redisConfigure(env = {}) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const jeton = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && jeton ? { url: url.replace(/\/$/, ""), jeton } : null;
}

// Écrit seulement si la valeur n'a pas changé depuis la lecture (comparaison du texte entier). ARGV[1] = "" : clé absente.
const SCRIPT_CAS = `local c = redis.call('GET', KEYS[1])
if (c == false and ARGV[1] == '') or (c ~= false and c == ARGV[1]) then
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
end
return 0`;

function stockageRedis({ env = process.env, fetchFn = fetch } = {}) {
  const cfg = redisConfigure(env);
  if (!cfg) return null;
  const cle = (collection, id) => `aurevia:${collection}:${id}`;
  async function commande(args) {
    const r = await fetchFn(cfg.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.jeton}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(6000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw Object.assign(new Error("redis"), { name: "ErreurRedis" });
    return d.result;
  }
  return {
    mode: "redis",
    async enregistrer(collection, id, donnees) {
      const args = ["SET", cle(collection, id), JSON.stringify(donnees)];
      // Les compteurs de limites expirent seuls (2 jours).
      if (collection === "compteurs") args.push("EX", "172800");
      await commande(args);
    },
    async lire(collection, id) {
      const v = await commande(["GET", cle(collection, id)]);
      return v == null ? null : JSON.parse(v);
    },
    // Même contrat que les autres modes : transformer(valeur) retourne la nouvelle valeur, ou undefined pour ne rien changer.
    async modifier(collection, id, transformer) {
      const k = cle(collection, id);
      for (let essai = 0; essai < 8; essai++) {
        const brut = await commande(["GET", k]);
        const actuel = brut == null ? null : JSON.parse(brut);
        const nouveau = transformer(actuel === null ? null : structuredClone(actuel));
        if (nouveau === undefined) return actuel;
        const ok = await commande(["EVAL", SCRIPT_CAS, "1", k, brut ?? "", JSON.stringify(nouveau)]);
        if (Number(ok) === 1) return nouveau;
        await new Promise((fin) => setTimeout(fin, 40 + Math.random() * 120 * (essai + 1)));
      }
      throw Object.assign(new Error("conflit d'écriture"), { name: "ConflitEcriture" });
    },
    // Fichiers protégés (fiches, modèles) : déposés en base64 sous la clé « aurevia:fichiers-formation:NOM ».
    async lireFichier(collection, id) {
      const v = await commande(["GET", cle(collection, id)]);
      return v == null ? null : new Uint8Array(Buffer.from(v, "base64"));
    },
  };
}

function stockageMemoire() {
  const m = new Map();
  return {
    mode: "memoire",
    async enregistrer(collection, id, donnees) { m.set(`${collection}/${id}`, structuredClone(donnees)); },
    async lire(collection, id) { return structuredClone(m.get(`${collection}/${id}`) ?? null); },
    async lireFichier(collection, id) { return m.get(`fichier:${collection}/${id}`) ?? null; },
    // Lecture + transformation + écriture sans « await » intermédiaire : atomique dans un seul processus.
    async modifier(collection, id, transformer) {
      const cle = `${collection}/${id}`;
      const nouveau = transformer(structuredClone(m.get(cle) ?? null));
      if (nouveau !== undefined) m.set(cle, structuredClone(nouveau));
      return structuredClone(nouveau !== undefined ? nouveau : m.get(cle) ?? null);
    },
    _contenu: m,
  };
}

function stockageFichier(dossier) {
  const files = new Map();
  const chemin = (collection, id) => path.join(dossier, collection, `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  return {
    mode: "fichier",
    async enregistrer(collection, id, donnees) {
      await mkdir(path.join(dossier, collection), { recursive: true });
      await writeFile(chemin(collection, id), JSON.stringify(donnees, null, 2));
    },
    async lire(collection, id) {
      try { return JSON.parse(await readFile(chemin(collection, id), "utf8")); } catch { return null; }
    },
    async lireFichier(collection, id) {
      try { return await readFile(path.join(dossier, collection, id.replace(/[^a-zA-Z0-9_.-]/g, "_"))); } catch { return null; }
    },
    // Développement et tests uniquement (un seul processus) : une file par clé évite les écritures croisées.
    async modifier(collection, id, transformer) {
      const cle = `${collection}/${id}`;
      const precedent = files.get(cle) ?? Promise.resolve();
      let resultat;
      const suivant = precedent.then(async () => {
        let actuel = null;
        try { actuel = JSON.parse(await readFile(chemin(collection, id), "utf8")); } catch { /* absent */ }
        const nouveau = transformer(actuel);
        if (nouveau !== undefined) {
          await mkdir(path.join(dossier, collection), { recursive: true });
          await writeFile(chemin(collection, id), JSON.stringify(nouveau, null, 2));
        }
        resultat = nouveau !== undefined ? nouveau : actuel;
      });
      files.set(cle, suivant.catch(() => {}));
      await suivant;
      return resultat;
    },
  };
}

// getStore peut être fourni par les tests (faux magasin Blobs) ; sinon celui de @netlify/blobs.
function stockageNetlify(getStoreFourni) {
  let getStore = getStoreFourni;
  const magasin = async (collection) => {
    getStore ??= (await import("@netlify/blobs")).getStore;
    // Cohérence forte : une écriture est relue immédiatement (indispensable pour les compteurs de limites).
    return getStore({ name: collection, consistency: "strong" });
  };
  return {
    mode: "netlify",
    async enregistrer(collection, id, donnees) { await (await magasin(collection)).setJSON(id, donnees); },
    async lire(collection, id) { return (await (await magasin(collection)).get(id, { type: "json" })) ?? null; },
    /**
     * Mise à jour sûre quand plusieurs notifications arrivent en même temps : on relit la valeur,
     * on la transforme, et on n'écrit que si personne ne l'a modifiée entre-temps (ETag). Sinon on recommence.
     * transformer(valeur) retourne la nouvelle valeur, ou undefined pour ne rien changer.
     */
    async modifier(collection, id, transformer) {
      const store = await magasin(collection);
      for (let essai = 0; essai < 8; essai++) {
        const lu = await store.getWithMetadata(id, { type: "json" });
        const nouveau = transformer(lu ? structuredClone(lu.data) : null);
        if (nouveau === undefined) return lu?.data ?? null;
        const r = lu?.etag ? await store.setJSON(id, nouveau, { onlyIfMatch: lu.etag }) : await store.setJSON(id, nouveau, { onlyIfNew: true });
        if (r.modified) return nouveau;
        await new Promise((ok) => setTimeout(ok, 40 + Math.random() * 120 * (essai + 1)));
      }
      throw Object.assign(new Error("conflit d'écriture"), { name: "ConflitEcriture" });
    },
    // Fichiers protégés (fiches, modèles) : déposés par Arthur dans le magasin Blobs « fichiers-formation ».
    async lireFichier(collection, id) { return (await (await magasin(collection)).get(id, { type: "arrayBuffer" })) ?? null; },
  };
}

/**
 * Compteur par fenêtre de temps (limites d'usage). Retourne le nouveau total.
 * Remarque : sans verrou, deux requêtes simultanées peuvent compter une seule fois.
 * Suffisant pour limiter les coûts ; ce n'est pas une barrière stricte.
 */
export async function incrementer(stockage, cle, fenetreMs, maintenant = Date.now()) {
  const tranche = Math.floor(maintenant / fenetreMs);
  const id = `${cle}-${tranche}`;
  const actuel = (await stockage.lire("compteurs", id)) || { n: 0, expire: (tranche + 1) * fenetreMs };
  actuel.n += 1;
  await stockage.enregistrer("compteurs", id, actuel);
  return actuel.n;
}
