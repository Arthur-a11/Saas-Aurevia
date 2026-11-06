// Outils du navigateur pour le compte, la commande et l'espace « Ma formation ».
// Le navigateur n'est jamais juge d'un accès : il affiche ce que le serveur répond.
export type Reponse = { statut: number; data: any };

/** Appel au serveur avec délai maximal ; statut 0 si le réseau ou le serveur ne répond pas. */
export async function api(url: string, corps?: unknown, delai = 15_000): Promise<Reponse> {
  try {
    const rep = await fetch(url, {
      method: corps === undefined ? "GET" : "POST",
      headers: corps === undefined ? {} : { "Content-Type": "application/json" },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(delai),
    });
    return { statut: rep.status, data: await rep.json().catch(() => null) };
  } catch {
    return { statut: 0, data: null };
  }
}

/** Petit constructeur d'éléments : le texte passe toujours par textContent (aucune injection HTML). */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | undefined> = {}, ...enfants: (Node | string | null | undefined | false)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") e.className = String(v);
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of enfants) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
}

/** Adresse de retour après connexion : uniquement une page de ce site. */
export function suiteSure(valeur: string | null, defaut = "/formation/") {
  return valeur && /^\/(?!\/)[\w\-/?=&.%]*$/.test(valeur) ? valeur : defaut;
}

export const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
export const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));
