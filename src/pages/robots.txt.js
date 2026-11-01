// robots.txt : bloque l'indexation tant que le vrai nom de domaine n'est pas configuré (SITE_URL).
import { SITE_PROVISOIRE } from "../lib/constantes.js";

export function GET({ site }) {
  const provisoire = !site || site.origin === new URL(SITE_PROVISOIRE).origin;
  const corps = provisoire
    ? "User-agent: *\nDisallow: /\n"
    : `User-agent: *\nDisallow: /commande/\nDisallow: /api/\n\nSitemap: ${new URL("/sitemap-index.xml", site).href}\n`;
  return new Response(corps, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
