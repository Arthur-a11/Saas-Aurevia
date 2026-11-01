// Outils HTTP communs aux fonctions serveur (format Request / Response standard du Web).
import { createHash, randomBytes } from "node:crypto";

export const json = (statut, corps) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

/** Lit un corps JSON de taille limitée. Retourne null si absent, trop gros ou invalide. */
export async function lireJson(requete, max = 20_000) {
  const type = requete.headers.get("content-type") || "";
  if (!type.includes("application/json")) return null;
  // Refus immédiat si la taille annoncée dépasse la limite (évite de lire un corps énorme).
  const annonce = Number(requete.headers.get("content-length"));
  if (Number.isFinite(annonce) && annonce > max) return null;
  const texte = await requete.text();
  if (texte.length > max) return null;
  try {
    const d = JSON.parse(texte);
    return d && typeof d === "object" && !Array.isArray(d) ? d : null;
  } catch {
    return null;
  }
}

/** Refuse les appels venant d'un autre site (protection simple contre l'abus des fonctions). */
export function origineAutorisee(requete, env) {
  const origine = requete.headers.get("origin");
  if (!origine) return true; // appels sans navigateur (tests, outils) : les autres limites s'appliquent
  const autorisees = new Set([new URL(requete.url).origin]);
  for (const o of (env.ORIGINES_AUTORISEES || "").split(",").map((x) => x.trim()).filter(Boolean)) autorisees.add(o);
  return autorisees.has(origine);
}

/** Empreinte non réversible de l'adresse IP (on ne stocke jamais l'IP en clair). */
export function empreinteIp(ip, env) {
  const sel = env.SEL_EMPREINTE || "sel-par-defaut-a-remplacer";
  return createHash("sha256").update(`${sel}:${ip || "inconnue"}`).digest("hex").slice(0, 32);
}

/** Empreinte non réversible d'une valeur (ex. e-mail) pour détecter les doublons sans la stocker en clair. */
export function empreinte(valeur, env) {
  const sel = env.SEL_EMPREINTE || "sel-par-defaut-a-remplacer";
  return createHash("sha256").update(`${sel}|${String(valeur).trim().toLowerCase()}`).digest("hex").slice(0, 32);
}

/** Référence lisible : préfixe + date + suffixe aléatoire, ex. INS-20261101-7F3K9Q. */
export function reference(prefixe, date = new Date()) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const alea = Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
  return `${prefixe}-${date.toISOString().slice(0, 10).replaceAll("-", "")}-${alea}`;
}

export const methodeNonAutorisee = () => json(405, { ok: false, code: "methode_non_autorisee" });
