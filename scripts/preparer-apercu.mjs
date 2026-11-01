// Prépare une copie de dist/ consultable comme page claude.ai (aperçu de travail).
// - liens « /tarifs/ » → liens relatifs « ../tarifs/index.html » ;
// - page d'accueil sans balises <html>/<head>/<body> (ajoutées par claude.ai à la publication) ;
// - bandeau « Aperçu » sur chaque page. Les fonctions serveur n'existent pas dans l'aperçu.
// Usage : npm run build && node scripts/preparer-apercu.mjs   → dossier apercu/ + apercu/fichiers.json
import { cp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const racine = path.resolve("dist");
const sortie = path.resolve(process.argv[2] || "apercu");
await rm(sortie, { recursive: true, force: true });
await cp(racine, sortie, { recursive: true });
for (const f of ["sitemap-index.xml", "sitemap-0.xml", "robots.txt", "404.html", "commande/index.html"]) await rm(path.join(sortie, f), { force: true });
await rm(path.join(sortie, "commande"), { recursive: true, force: true });
// Les noms commençant par « _ » sont réservés par claude.ai : _astro/ devient ressources/.
await rename(path.join(sortie, "_astro"), path.join(sortie, "ressources"));

async function lister(dossier) {
  const out = [];
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) out.push(...(await lister(p)));
    else out.push(p);
  }
  return out;
}
const fichiers = await lister(sortie);
const pages = new Set(fichiers.filter((f) => f.endsWith("index.html")).map((f) => "/" + path.relative(sortie, path.dirname(f)).split(path.sep).join("/") + "/").map((p) => p.replace("//", "/")));

function relatif(depuisFichier, cible) {
  const [chemin, suite = ""] = cible.split(/(?=[?#])/);
  let c = chemin;
  if (pages.has(c) || c === "/") c = c + "index.html";
  if (c === "/index.html" || c === "//index.html") c = "/index.html";
  const rel = path.relative(path.dirname(depuisFichier), path.join(sortie, c)).split(path.sep).join("/");
  return (rel || "index.html") + suite;
}

const BANDEAU = `<details style="position:relative;z-index:30;background:#e8c46a;color:#06122b;font:500 .88rem/1.45 system-ui,sans-serif;padding:.5rem max(16px,env(safe-area-inset-right,0px)) .5rem max(16px,env(safe-area-inset-left,0px))"><summary style="cursor:pointer;font-weight:700;text-align:center;min-height:auto;display:list-item">Aperçu AUREVIA SAAS – version 5 en test (1er novembre 2026) · voir les nouveautés et les limites</summary><div style="max-width:60rem;margin:.4rem auto 0;text-align:left"><p style="margin:.2rem 0"><strong>Nouveau :</strong> formation payante rédigée (en brouillon, à relire), tarifs avec statuts réels (« Rédigé, en relecture », « En préparation »), séparation gratuit / payant sur le Programme, pages Mon compte, Mot de passe oublié et Ma formation.</p><p style="margin:.2rem 0"><strong>Dans cet aperçu :</strong> il n’y a pas de serveur, donc la création de compte, le paiement et l’espace Ma formation affichent « indisponible » ; ils ont été testés à part, avec un faux Stripe local. Aucun paiement réel. Version non publiée sur le site en ligne. Contenus « En préparation » et textes légaux en brouillon.</p></div></details>`;

for (const f of fichiers) {
  const rel = path.relative(sortie, f).split(path.sep).join("/");
  if (f.endsWith(".css")) {
    const css = (await readFile(f, "utf8")).replaceAll("url(/fonts/", "url(../fonts/");
    await writeFile(f, css);
    continue;
  }
  if (f.endsWith(".js")) {
    // Le préchargement de Vite utilise des adresses absolues (/_astro/…) introuvables dans l'aperçu :
    // on le vide (les modules restent chargés normalement par leurs imports relatifs).
    const js = (await readFile(f, "utf8")).replace(
      "function(e){return`/`+e}",
      "function(e){return new URL(e.replace(`_astro/`,``),import.meta.url).href}",
    );
    await writeFile(f, js);
    continue;
  }
  if (!f.endsWith(".html")) continue;
  let html = (await readFile(f, "utf8")).replaceAll("/_astro/", "/ressources/");
  html = html.replace(/(href|src)="(\/[^"/][^"]*|\/)"/g, (_, a, cible) => `${a}="${relatif(f, cible)}"`);
  // Chaînes de redirection des anciennes ancres (script de l'accueil).
  html = html.replace(/"(\/[a-z-]+\/)"/g, (m, cible) => (pages.has(cible) ? `"${relatif(f, cible)}"` : m));
  html = html.replace(/<body([^>]*)>/, `<body$1>${BANDEAU}`);
  if (rel === "index.html") {
    html = html.replace(/<title>[^<]*<\/title>/, "<title>Aperçu AUREVIA SAAS</title>")
      .replace(/<!doctype html>/i, "").replace(/<html[^>]*>/, "").replace("</html>", "")
      .replace("<head>", "").replace("</head>", "").replace(/<body[^>]*>/, "").replace("</body>", "");
    html = html.replace("<title>", '<style>html{color-scheme:dark}</style><title>');
    // La classe « js » était posée sur <html> : on la repose via script (déjà présent).
  }
  await writeFile(f, html);
}

const liste = (await lister(sortie)).map((f) => path.relative(sortie, f).split(path.sep).join("/")).filter((r) => r !== "index.html");
const nomDossier = path.relative(process.cwd(), sortie).split(path.sep).join("/");
const carte = Object.fromEntries(liste.map((r) => [r, `${nomDossier}/${r}`]));
await writeFile(path.join(sortie, "..", `${path.basename(sortie)}-fichiers.json`), JSON.stringify(carte, null, 2));
console.log(`Aperçu prêt : ${liste.length + 1} fichiers (page principale : apercu/index.html).`);
