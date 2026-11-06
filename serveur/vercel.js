// Adaptation à Vercel : même logique serveur (serveur/*.js), autre enveloppe que Netlify.
// Chaque fonction de api/ appelle executer(). Les routes /api/compte/*, /api/paiement/*… sont réécrites par vercel.json
// vers une seule fonction avec le vrai chemin dans le paramètre « p » : on reconstruit alors la requête d'origine.
import { creerStockage } from "./stockage.js";

export function adresseIp(requete) {
  const h = requete.headers;
  return (h.get("x-real-ip") || (h.get("x-forwarded-for") || "").split(",")[0] || "").trim() || null;
}

/** Remet le chemin d'origine (/api/compte/connexion…) dans l'URL quand vercel.json l'a réécrit. */
export async function requeteOriginale(requete) {
  const u = new URL(requete.url);
  const p = u.searchParams.get("p");
  if (p === null) return requete;
  u.searchParams.delete("p");
  u.pathname = `/api/${p.replace(/^\/+/, "")}`;
  // Corps relu tel quel (octets bruts) : la signature des notifications Stripe en dépend.
  const corps = ["GET", "HEAD"].includes(requete.method) ? undefined : await requete.arrayBuffer();
  return new Request(u, { method: requete.method, headers: requete.headers, body: corps });
}

export function executer(traiter) {
  return {
    async fetch(requete) {
      const env = process.env;
      const originale = await requeteOriginale(requete);
      return traiter(originale, { env, stockage: creerStockage("redis", { env }), ip: adresseIp(requete) });
    },
  };
}
