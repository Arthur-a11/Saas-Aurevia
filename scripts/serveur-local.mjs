// Serveur local : sert le site construit (dist/) et les fonctions /api/*, comme en production.
// Usage : npm run build && npm run serveur
// Variables : PORT (4321), STOCKAGE ("fichier" par défaut, "aucun" pour simuler un stockage absent),
//             DOSSIER_DONNEES (.donnees-locales), et les mêmes secrets qu'en production (voir .env.example).
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { traiterInscription, traiterRetractation, traiterCommande, traiterAssistant } from "../serveur/fonctions.js";
import { creerStockage } from "../serveur/stockage.js";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const port = Number(process.env.PORT || 4321);
const modeStockage = process.env.STOCKAGE === "aucun" ? null : "fichier";
const stockage = creerStockage(modeStockage, { dossier: process.env.DOSSIER_DONNEES || ".donnees-locales" });
const ROUTES = {
  "/api/inscription": traiterInscription,
  "/api/retractation": traiterRetractation,
  "/api/commande": traiterCommande,
  "/api/assistant": traiterAssistant,
};
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".png": "image/png",
};

async function fichier(url) {
  let p = path.normalize(decodeURIComponent(url.pathname));
  if (p.includes("..")) return null;
  let complet = path.join(racine, p);
  try {
    const s = await stat(complet);
    if (s.isDirectory()) {
      if (!url.pathname.endsWith("/")) return { redirection: url.pathname + "/" + url.search };
      complet = path.join(complet, "index.html");
    }
    return { contenu: await readFile(complet), type: TYPES[path.extname(complet)] || "application/octet-stream" };
  } catch {
    return null;
  }
}

const serveur = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = ROUTES[url.pathname];
  if (route) {
    const morceaux = [];
    for await (const m of req) morceaux.push(m);
    const corps = Buffer.concat(morceaux);
    const requete = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : corps });
    const reponse = await route(requete, { env: process.env, stockage, ip: req.socket.remoteAddress });
    res.writeHead(reponse.status, Object.fromEntries(reponse.headers));
    res.end(Buffer.from(await reponse.arrayBuffer()));
    return;
  }
  const f = await fichier(url);
  if (f?.redirection) { res.writeHead(301, { Location: f.redirection }); res.end(); return; }
  if (f) { res.writeHead(200, { "Content-Type": f.type }); res.end(f.contenu); return; }
  const page404 = await readFile(path.join(racine, "404.html")).catch(() => "Page introuvable");
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end(page404);
});

serveur.listen(port, () => {
  console.log(`Site local : http://localhost:${port}/ (stockage : ${modeStockage ?? "aucun"}, assistant IA : ${process.env.ANTHROPIC_API_KEY ? "clé présente" : "non connecté"}, e-mails : ${process.env.BREVO_API_KEY ? "Brevo" : "non connectés"})`);
});
