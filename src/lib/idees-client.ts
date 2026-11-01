// Outils côté navigateur pour explorer les idées : recherche, favoris et copie.
// Les favoris sont enregistrés UNIQUEMENT dans ce navigateur (localStorage) : rien n'est envoyé au serveur.

export type Idee = { id: string; nom: string; description: string; marcheId: string; marche: string; nicheId: string; niche: string; cle: string };

/** Minuscules, sans accents ni ponctuation : « Médecine » et « medecine » se retrouvent. */
export const normaliser = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’'\-_/]/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

let cache: Idee[] | null = null;
/** Charge les 1 500 idées (fichier séparé, chargé seulement quand on en a besoin). */
export async function chargerIdees(): Promise<Idee[]> {
  if (cache) return cache;
  const { default: d } = await import("../data/marches.json");
  cache = d.marches.flatMap((m) =>
    m.niches.flatMap((n) =>
      n.idees.map((i) => ({
        id: `${m.id}:${n.id}:${i.nom}`,
        nom: i.nom,
        description: i.description,
        marcheId: m.id,
        marche: m.nom,
        nicheId: n.id,
        niche: n.nom,
        cle: normaliser(`${i.nom} ${i.description} ${n.nom} ${m.nom} ${m.court}`),
      })),
    ),
  );
  return cache;
}

/** Recherche : tous les mots doivent être présents ; tri par pertinence (nom, puis niche, puis description). */
export function rechercher(idees: Idee[], requete: string, marcheId = "", seulement?: Set<string>): Idee[] {
  const mots = normaliser(requete).split(" ").filter(Boolean);
  const liste = idees.filter((i) => (!marcheId || i.marcheId === marcheId) && (!seulement || seulement.has(i.id)) && mots.every((m) => i.cle.includes(m)));
  if (!mots.length) return liste;
  const score = (i: Idee) => {
    const nom = normaliser(i.nom), niche = normaliser(i.niche), desc = normaliser(i.description);
    return mots.reduce((s, m) => s + (nom.includes(m) ? 5 : 0) + (niche.includes(m) ? 3 : 0) + (desc.includes(m) ? 1 : 0), 0);
  };
  return liste.map((i) => [score(i), i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
}

// ---------- Favoris (localStorage, avec repli silencieux si le navigateur le refuse)
const CLE = "aurevia:favoris:v1";
export function lireFavoris(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(CLE) || "[]");
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
/** Bascule un favori. Retourne { favori, enregistre } : enregistre=false si le navigateur bloque le stockage. */
export function basculerFavori(id: string): { favori: boolean; enregistre: boolean } {
  const f = lireFavoris();
  const favori = !f.has(id);
  favori ? f.add(id) : f.delete(id);
  try {
    localStorage.setItem(CLE, JSON.stringify([...f]));
    window.dispatchEvent(new CustomEvent("favoris-modifies"));
    return { favori, enregistre: true };
  } catch {
    return { favori: !favori, enregistre: false };
  }
}

// ---------- Copie (presse-papiers, avec repli par sélection de texte)
export const texteIdee = (i: { nom: string; description: string; marche: string; niche: string }) =>
  `${i.nom} : ${i.description} (marché ${i.marche}, niche ${i.niche}). Idée à tester auprès de vrais clients : une idée rédigée n’est pas une niche validée.`;

export async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    const zone = document.createElement("textarea");
    zone.value = texte;
    zone.setAttribute("readonly", "");
    zone.style.position = "fixed";
    zone.style.opacity = "0";
    document.body.append(zone);
    zone.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    zone.remove();
    return ok;
  }
}
