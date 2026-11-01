// Tests dans un vrai navigateur (Chromium), sur ordinateur et sur téléphone.
// Le site construit (dist/) est servi par le serveur local, avec un stockage temporaire.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4399;
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  webServer: {
    command: `node scripts/serveur-local.mjs`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    env: { PORT: String(PORT), DOSSIER_DONNEES: "test-results/donnees", LIMITE_FORMULAIRES_HEURE: "1000", ANTHROPIC_API_KEY: "", BREVO_API_KEY: "" },
  },
  projects: [
    { name: "ordinateur", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
