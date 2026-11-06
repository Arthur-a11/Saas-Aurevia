// Simulateur LOCAL de l'API Brevo, pour les tests uniquement : aucun e-mail réel n'est envoyé.
//   POST /v3/smtp/email   : « accepte » le message (201) et le garde en mémoire ;
//   GET  /test/messages   : liste des messages reçus (?a=adresse pour filtrer) ;
//   POST /test/panne      : { "active": true } → répond 503 (simule une panne de Brevo).
// Usage : PORT_BREVO=4396 node scripts/brevo-simule.mjs
import http from "node:http";

const port = Number(process.env.PORT_BREVO || 4396);
const messages = [];
let panne = false;

const lire = async (req) => { const m = []; for await (const x of req) m.push(x); return Buffer.concat(m).toString(); };
const envoyer = (res, statut, corps) => { res.writeHead(statut, { "Content-Type": "application/json" }); res.end(JSON.stringify(corps)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === "/v3/smtp/email" && req.method === "POST") {
    if (!String(req.headers["api-key"] || "").startsWith("xkeysib-")) return envoyer(res, 401, { code: "unauthorized" });
    if (panne) return envoyer(res, 503, { code: "service_unavailable" });
    const m = JSON.parse(await lire(req));
    messages.push({ a: m.to?.[0]?.email, sujet: m.subject, texte: m.textContent, de: m.sender?.email, le: new Date().toISOString() });
    return envoyer(res, 201, { messageId: `<simule-${messages.length}@brevo.local>` });
  }
  if (url.pathname === "/test/messages") {
    const a = url.searchParams.get("a");
    return envoyer(res, 200, messages.filter((m) => !a || m.a === a));
  }
  if (url.pathname === "/test/panne" && req.method === "POST") {
    panne = Boolean(JSON.parse((await lire(req)) || "{}").active);
    return envoyer(res, 200, { panne });
  }
  if (url.pathname === "/") return envoyer(res, 200, { simulateur: "brevo" });
  envoyer(res, 404, { code: "inconnu" });
}).listen(port, () => console.log(`Simulateur Brevo (test) : http://localhost:${port}/`));
