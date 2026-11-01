// Parcours d'achat complet dans un vrai navigateur, en MODE TEST, avec le simulateur Stripe local.
// Aucun paiement réel : le site de test (port 4397) parle au simulateur (port 4398), jamais à Stripe.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PORT_PAIEMENT, PORT_STRIPE } from "../../playwright.config.mjs";

const SITE = `http://localhost:${PORT_PAIEMENT}`;
const STRIPE = `http://localhost:${PORT_STRIPE}`;
const MDP = "phrase-de-test-solide";
const NOMS = { essentiel: "Essentiel", complet: "Complet", accompagne: "Accompagné" };
const PRIX = { essentiel: "14,90 €", complet: "24,90 €", accompagne: "54,90 €" };
const unique = () => `eleve-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemple.fr`;

function surveiller(page) {
  const erreurs = [];
  page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
  page.on("pageerror", (e) => erreurs.push(e.message));
  return erreurs;
}

async function creerCompte(page, email = unique(), suite = "") {
  await page.goto(`${SITE}/compte/${suite ? `?suite=${encodeURIComponent(suite)}` : ""}`);
  const f = page.locator("#form-creation");
  await f.getByLabel("Prénom").fill("Camille");
  await f.getByLabel("E-mail").fill(email);
  await f.getByLabel("Mot de passe").fill(MDP);
  await f.getByLabel(/politique de confidentialité/).check();
  await f.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL(suite ? `${SITE}${suite}` : `${SITE}/formation/`);
  return email;
}

/** Choisit une formule sur la page Tarifs, accepte les accords et ouvre la page de paiement (simulée). */
async function allerAuPaiement(page, formule, { accesImmediat = true } = {}) {
  await page.goto(`${SITE}/tarifs/`);
  await expect(page.locator("#avis-commandes")).toBeHidden();
  await page.getByRole("link", { name: `Choisir la formule ${NOMS[formule]} (${PRIX[formule]})` }).click();
  await expect(page).toHaveURL(new RegExp(`/commande/\\?formule=${formule}$`));
  await expect(page.getByText("Mode test :")).toBeVisible();
  await expect(page.locator(`#formule-${formule}`)).toBeChecked();
  await page.getByLabel(/J’ai lu et j’accepte les conditions générales de vente/).check();
  if (accesImmediat) await page.getByLabel(/Je demande à accéder aux contenus numériques dès maintenant/).check();
  await page.getByRole("button", { name: `Payer ${PRIX[formule]} sur la page sécurisée` }).click();
  await page.waitForURL(/localhost:4398\/c\/pay\//);
  await expect(page.getByText(`Montant : ${PRIX[formule]}`)).toBeVisible();
  return page.url().split("/").pop();
}

const formulesDuCompte = async (page) => (await (await page.request.get(`${SITE}/api/formation`)).json()).formules;

for (const formule of ["essentiel", "complet", "accompagne"]) {
  test(`achat ${NOMS[formule]} : paiement confirmé → modules ouverts, progression conservée après reconnexion`, async ({ page }) => {
    const erreurs = surveiller(page);
    const email = await creerCompte(page);
    await expect(page.getByText("Vous n’avez pas encore de formule")).toBeVisible();
    await expect(page.getByRole("link", { name: "Commencer ma formation" })).toHaveCount(0);

    await allerAuPaiement(page, formule);
    await page.getByRole("button", { name: "Payer (succès)" }).click();
    await page.waitForURL(/\/formation\/\?commande=CMD-/);
    await expect(page.getByText("Paiement confirmé")).toBeVisible();
    await expect(page.getByText(`Formule ${NOMS[formule]}`)).toBeVisible();

    // Exactement les contenus de la formule : 6 leçons ouvertes ; vidéos et fiches signalées en préparation.
    await expect(page.locator(".module-espace")).toHaveCount(6);
    await expect(page.locator(".lecon.ouverte")).toHaveCount(6);
    await expect(page.locator(".lecon.fermee").first()).toContainText("En préparation");
    const modeles = page.locator(".ressources-espace li", { hasText: "Modèles à copier" });
    const avis = page.locator(".ressources-espace li", { hasText: "Avis personnel" });
    await expect(modeles).toContainText(formule === "essentiel" ? "Non inclus dans votre formule" : "En préparation");
    await expect(avis).toContainText(formule === "accompagne" ? "Modalités à définir" : "Non inclus dans votre formule");

    await page.getByRole("link", { name: "Commencer ma formation" }).click();
    await expect(page.locator("h1")).toHaveText("Leçon écrite : trouver une bonne idée");
    await expect(page.locator(".etapes-lecon li").first()).toBeVisible();
    await page.getByRole("button", { name: "Marquer comme terminée" }).click();
    await expect(page.getByText("Progression enregistrée : 1 leçon(s) sur 6.")).toBeVisible();

    // Déconnexion puis reconnexion : l'accès et la progression sont retrouvés.
    await page.goto(`${SITE}/formation/`);
    await page.getByRole("button", { name: "Me déconnecter" }).click();
    await page.waitForURL(`${SITE}/compte/`);
    await page.goto(`${SITE}/formation/`);
    await expect(page.getByText("Connectez-vous pour accéder à votre formation")).toBeVisible();
    await page.goto(`${SITE}/compte/?suite=/formation/`);
    const cx = page.locator("#form-connexion");
    await cx.getByLabel("E-mail").fill(email);
    await cx.getByLabel("Mot de passe").fill(MDP);
    await cx.getByRole("button", { name: "Me connecter" }).click();
    await page.waitForURL(`${SITE}/formation/`);
    await expect(page.getByText("Progression : 1 leçon(s) terminée(s) sur 6")).toBeVisible();
    await expect(page.getByRole("link", { name: "Reprendre ma formation" })).toHaveAttribute("href", "/formation/lecon/?id=m2-texte");
    expect(erreurs).toEqual([]);
  });
}

test("sans paiement : adresse de retour falsifiée et leçon directe ne débloquent rien", async ({ page }) => {
  await creerCompte(page);
  await page.goto(`${SITE}/formation/?commande=CMD-20261102-AAAAAA`);
  await expect(page.getByText("Commande introuvable")).toBeVisible();
  await expect(page.getByText("Vous n’avez pas encore de formule")).toBeVisible();
  await expect(page.locator(".lecon.ouverte")).toHaveCount(0);
  await page.goto(`${SITE}/formation/lecon/?id=m1-texte`);
  await expect(page.getByText("Leçon non incluse")).toBeVisible();
  await expect(page.locator(".etapes-lecon")).toHaveCount(0);
  const r = await page.request.get(`${SITE}/api/formation/lecon?id=m1-texte`);
  expect(r.status()).toBe(403);
});

test("paiement annulé : retour sur la commande, aucun accès", async ({ page }) => {
  await creerCompte(page);
  await allerAuPaiement(page, "complet");
  await page.getByRole("button", { name: "Annuler et revenir au site" }).click();
  await expect(page).toHaveURL(/\/commande\/\?formule=complet&annulee=CMD-/);
  await expect(page.getByText("Paiement annulé")).toBeVisible();
  expect(await formulesDuCompte(page)).toEqual([]);
});

test("paiement refusé : message clair, aucun accès", async ({ page }) => {
  await creerCompte(page);
  await allerAuPaiement(page, "essentiel");
  await page.getByRole("button", { name: "Paiement refusé" }).click();
  await expect(page.getByText("Paiement refusé ou annulé")).toBeVisible();
  await expect(page.locator(".lecon.ouverte")).toHaveCount(0);
  expect(await formulesDuCompte(page)).toEqual([]);
});

test("notification retardée : « Vérification du paiement en cours », puis accès après vérification par le serveur", async ({ page }) => {
  await creerCompte(page);
  await allerAuPaiement(page, "complet");
  // Le premier contrôle du statut est ralenti pour laisser voir l'état d'attente.
  let premier = true;
  await page.route("**/api/paiement/statut**", async (route) => {
    if (premier) { premier = false; await new Promise((r) => setTimeout(r, 1_500)); }
    await route.continue();
  });
  await page.getByRole("button", { name: "Payer, notification retardée" }).click();
  await expect(page.getByText("Vérification du paiement en cours…")).toBeVisible();
  await expect(page.getByText("Paiement confirmé")).toBeVisible();
  await expect(page.locator(".lecon.ouverte")).toHaveCount(6);
});

test("notification reçue deux fois : un seul achat, puis remboursement → accès retiré", async ({ page }) => {
  await creerCompte(page);
  const session = await allerAuPaiement(page, "accompagne");
  await page.getByRole("button", { name: "Payer, notification envoyée deux fois" }).click();
  await expect(page.getByText("Paiement confirmé")).toBeVisible();
  expect((await formulesDuCompte(page)).length).toBe(1);
  // Racheter la même formule est refusé (déjà détenue).
  const r = await page.request.post(`${SITE}/api/paiement/session`, { data: { formule: "accompagne", cgv: true } });
  expect(r.status()).toBe(409);
  // Remboursement total notifié : l'accès est retiré.
  const remb = await page.request.post(`${STRIPE}/test/rembourser/${session}`);
  expect((await remb.json()).statut).toBe(200);
  await page.goto(`${SITE}/formation/`);
  await expect(page.locator(".lecon.ouverte")).toHaveCount(0);
});

test("sans accord d'accès immédiat : paiement confirmé, accès annoncé à la fin du délai de 14 jours", async ({ page }) => {
  await creerCompte(page);
  await allerAuPaiement(page, "essentiel", { accesImmediat: false });
  await page.getByRole("button", { name: "Payer (succès)" }).click();
  await expect(page.getByText(/votre accès s’ouvrira le/)).toBeVisible();
  await expect(page.locator(".lecon.ouverte")).toHaveCount(0);
});

test("non connecté : la commande demande de se connecter, puis revient à la bonne formule", async ({ page }) => {
  await page.goto(`${SITE}/commande/?formule=accompagne`);
  await page.getByRole("link", { name: "Me connecter ou créer mon compte" }).click();
  await creerCompte(page, unique(), "/commande/?formule=accompagne");
  await expect(page.locator("#formule-accompagne")).toBeChecked();
  await expect(page.getByLabel(/Je demande que l’accompagnement commence/)).toBeVisible();
});

test("accessibilité (axe) : commande ouverte et espace de formation rempli", async ({ page }) => {
  await creerCompte(page, unique(), "/commande/?formule=complet");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
  const resume = (r) => r.violations.map((v) => `${v.id} : ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  await expect(page.locator("#form-commande")).toBeVisible();
  expect(resume(await new AxeBuilder({ page }).withTags(tags).analyze())).toEqual([]);
  await allerAuPaiement(page, "complet");
  await page.getByRole("button", { name: "Payer (succès)" }).click();
  await expect(page.locator(".lecon.ouverte")).toHaveCount(6);
  expect(resume(await new AxeBuilder({ page }).withTags(tags).analyze())).toEqual([]);
  const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(debord).toBeLessThanOrEqual(0);
});
