// Tests dans un vrai navigateur (Chromium), sur ordinateur et sur téléphone.
// Le site construit (dist/) est servi par le serveur local, avec un stockage temporaire.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4399;
export const PORT_PAIEMENT = 4397;
export const PORT_STRIPE = 4398;
export const PORT_BREVO = 4396;
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  webServer: [
    {
      command: `node scripts/serveur-local.mjs`,
      url: `http://localhost:${PORT}/`,
      reuseExistingServer: false,
      env: { PORT: String(PORT), DOSSIER_DONNEES: "test-results/donnees", LIMITE_FORMULAIRES_HEURE: "1000", ANTHROPIC_API_KEY: "", BREVO_API_KEY: "", STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "" },
    },
    // Second site, en MODE TEST de paiement, relié au simulateur Stripe local (aucun paiement réel).
    {
      command: `node scripts/serveur-local.mjs`,
      url: `http://localhost:${PORT_PAIEMENT}/`,
      reuseExistingServer: false,
      env: { PORT: String(PORT_PAIEMENT), DOSSIER_DONNEES: "test-results/donnees-paiement", LIMITE_COMPTES_HEURE: "1000", ANTHROPIC_API_KEY: "",
        BREVO_API_KEY: "xkeysib-simule", EMAIL_EXPEDITEUR: "test@exemple.fr", BREVO_API_URL: `http://localhost:${PORT_BREVO}/v3`,
        STRIPE_SECRET_KEY: "sk_test_simule", STRIPE_WEBHOOK_SECRET: "whsec_simule", STRIPE_API_URL: `http://localhost:${PORT_STRIPE}/v1` },
    },
    {
      command: `node scripts/brevo-simule.mjs`,
      url: `http://localhost:${PORT_BREVO}/`,
      reuseExistingServer: false,
      env: { PORT_BREVO: String(PORT_BREVO) },
    },
    {
      command: `node scripts/stripe-simule.mjs`,
      url: `http://localhost:${PORT_STRIPE}/`,
      reuseExistingServer: false,
      env: { PORT_STRIPE: String(PORT_STRIPE), SITE: `http://localhost:${PORT_PAIEMENT}`, STRIPE_WEBHOOK_SECRET: "whsec_simule" },
    },
  ],
  projects: [
    { name: "ordinateur", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
