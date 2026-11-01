// Stockage des enregistrements (inscriptions, commandes, rétractations) et des compteurs de limites.
// Trois modes :
//  - "netlify"  : Netlify Blobs (en production sur Netlify, aucune clé à fournir) ;
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
  if (mode === "netlify") return stockageNetlify();
  return null;
}

function stockageMemoire() {
  const m = new Map();
  return {
    mode: "memoire",
    async enregistrer(collection, id, donnees) { m.set(`${collection}/${id}`, structuredClone(donnees)); },
    async lire(collection, id) { return structuredClone(m.get(`${collection}/${id}`) ?? null); },
    _contenu: m,
  };
}

function stockageFichier(dossier) {
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
  };
}

function stockageNetlify() {
  let blobs;
  const magasin = async (collection) => {
    blobs ??= await import("@netlify/blobs");
    // Cohérence forte : une écriture est relue immédiatement (indispensable pour les compteurs de limites).
    return blobs.getStore({ name: collection, consistency: "strong" });
  };
  return {
    mode: "netlify",
    async enregistrer(collection, id, donnees) { await (await magasin(collection)).setJSON(id, donnees); },
    async lire(collection, id) { return (await (await magasin(collection)).get(id, { type: "json" })) ?? null; },
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
