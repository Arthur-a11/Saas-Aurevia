// Configuration Astro : site statique (une vraie page HTML par URL).
// SITE_URL = adresse publique du site (ex. https://www.mon-domaine.fr). Tant qu'elle n'est pas connue,
// une adresse de réserve est utilisée : les liens canoniques et le sitemap devront être régénérés.
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

import { SITE_PROVISOIRE } from "./src/lib/constantes.js";
const site = process.env.SITE_URL || SITE_PROVISOIRE;

export default defineConfig({
  site,
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [
    sitemap({
      filter: (page) => !["/commande/", "/compte/", "/formation/", "/404"].some((x) => page.includes(x)),
    }),
  ],
});
