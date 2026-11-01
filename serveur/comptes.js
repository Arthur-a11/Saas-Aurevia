// Comptes clients : mots de passe protégés (scrypt), sessions par cookie HttpOnly.
// Le mot de passe n'est jamais stocké : seulement un sel aléatoire et une empreinte scrypt.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
export const COOKIE = "aurevia_session";
export const DUREE_SESSION_MS = 30 * 24 * 3_600_000;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const cleEmail = (email) => createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex");
const cleJeton = (jeton) => createHash("sha256").update(jeton).digest("hex");

export async function hacherMotDePasse(mdp) {
  const sel = randomBytes(16);
  const h = await scryptAsync(String(mdp).normalize("NFC"), sel, 32, PARAMS);
  return { algo: "scrypt", N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, sel: sel.toString("base64"), hash: Buffer.from(h).toString("base64") };
}

export async function verifierMotDePasse(mdp, enregistre) {
  if (!enregistre?.sel || !enregistre?.hash) return false;
  const attendu = Buffer.from(enregistre.hash, "base64");
  const h = Buffer.from(await scryptAsync(String(mdp).normalize("NFC"), Buffer.from(enregistre.sel, "base64"), attendu.length,
    { N: enregistre.N, r: enregistre.r, p: enregistre.p, maxmem: PARAMS.maxmem }));
  return h.length === attendu.length && timingSafeEqual(h, attendu);
}

/** Crée une session et retourne l'en-tête Set-Cookie. Seule l'empreinte du jeton est stockée. */
export async function ouvrirSession(stockage, compte, requete, maintenant = Date.now()) {
  const jeton = randomBytes(32).toString("base64url");
  await stockage.enregistrer("sessions", cleJeton(jeton), { compte: compte.id, email: compte.cleEmail, creeLe: new Date(maintenant).toISOString(), expire: maintenant + DUREE_SESSION_MS });
  return cookie(requete, jeton, DUREE_SESSION_MS / 1000);
}

export async function fermerSession(stockage, requete) {
  const jeton = lireCookie(requete);
  if (jeton) await stockage.enregistrer("sessions", cleJeton(jeton), { revoquee: true, expire: 0 });
  return cookie(requete, "", 0);
}

/** Compte de la personne connectée, ou null. */
export async function compteConnecte(stockage, requete, maintenant = Date.now()) {
  const jeton = lireCookie(requete);
  if (!jeton || jeton.length > 100) return null;
  const s = await stockage.lire("sessions", cleJeton(jeton));
  if (!s || s.revoquee || !(s.expire > maintenant)) return null;
  const c = await stockage.lire("comptes", s.email);
  return c && c.id === s.compte ? c : null;
}

function lireCookie(requete) {
  const brut = requete.headers.get("cookie") || "";
  for (const morceau of brut.split(";")) {
    const [k, ...v] = morceau.trim().split("=");
    if (k === COOKIE) return v.join("=") || null;
  }
  return null;
}

function cookie(requete, valeur, maxAge) {
  const securise = new URL(requete.url).protocol === "https:";
  return `${COOKIE}=${valeur}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge)}${securise ? "; Secure" : ""}`;
}
