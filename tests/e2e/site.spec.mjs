// Tests de bout en bout : chaque page, navigation, liens, marchés, tarifs, formulaires, assistant, clavier, mobile.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";

const donnees = JSON.parse(readFileSync(new URL("../../src/data/marches.json", import.meta.url), "utf8"));
const PAGES = [
  ["/", "Construisez l’entreprise qui encaisse chaque mois."],
  ["/programme/", "La formation : tout pour créer un bon SaaS"],
  ["/idees/", "15 marchés, 300 niches, 1 500 idées de SaaS"],
  ["/tarifs/", "Choisissez votre formule"],
  ["/questions/", "Vos questions"],
  ["/contact/", "Contact"],
  ["/inscription/", "Je m’inscris"],
  ["/commande/", "Commande"],
  ["/mentions-legales/", "Mentions légales"],
  ["/cgv/", "Conditions générales de vente"],
  ["/confidentialite/", "Politique de confidentialité"],
  ["/retractation/", "Droit de rétractation"],
  ...donnees.marches.map((m) => [`/idees/${m.id}/`, m.nom]),
];

/** Collecte les erreurs de console et les requêtes vers des domaines extérieurs. */
function surveiller(page) {
  const erreurs = [];
  const externes = [];
  page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("request", (r) => { if (!r.url().startsWith("http://localhost")) externes.push(r.url()); });
  return { erreurs, externes };
}

test.describe("chaque page", () => {
  for (const [url, h1] of PAGES) {
    test(`${url} s’affiche correctement`, async ({ page }) => {
      const s = surveiller(page);
      const rep = await page.goto(url);
      expect(rep.status()).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText(h1);
      await expect(page).toHaveTitle(/AUREVIA SAAS/);
      expect(await page.locator('meta[name="description"]').getAttribute("content")).toBeTruthy();
      await expect(page.locator("a.lien-evitement")).toHaveAttribute("href", "#contenu");
      const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(debord, "pas de défilement horizontal").toBeLessThanOrEqual(0);
      expect(s.erreurs, "console sans erreur").toEqual([]);
      expect(s.externes, "aucune ressource extérieure (polices locales)").toEqual([]);
    });
  }

  test("titres d’onglet tous différents", async ({ page }) => {
    const titres = new Set();
    for (const [url] of PAGES) { await page.goto(url); titres.add(await page.title()); }
    expect(titres.size).toBe(PAGES.length);
  });

  test("page inconnue : 404 avec un titre et un lien de retour", async ({ page }) => {
    const rep = await page.goto("/cette-page-n-existe-pas/");
    expect(rep.status()).toBe(404);
    await expect(page.locator("h1")).toHaveText("Page introuvable");
  });
});

test("tous les liens internes mènent à une page existante", async ({ page, request }) => {
  const vus = new Set();
  for (const [url] of PAGES) {
    await page.goto(url);
    const liens = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
    for (const l of liens) {
      if (l.startsWith("#") && l.length > 1) {
        // Ancre sur la même page : l'élément visé doit exister.
        expect(await page.locator(`[id="${l.slice(1)}"]`).count(), `ancre ${l} sur ${url}`).toBe(1);
        vus.add(url + l);
        continue;
      }
      if (!l.startsWith("/") || l.startsWith("//")) continue;
      const [chemin, ancre] = l.split("#");
      const cle = chemin + (ancre ? "#" + ancre : "");
      if (vus.has(cle)) continue;
      vus.add(cle);
      const r = await request.get(chemin.split("?")[0] || url);
      expect(r.status(), `lien ${l} sur ${url}`).toBe(200);
      if (ancre && chemin) {
        const html = await r.text();
        expect(html.includes(`id="${ancre}"`), `ancre #${ancre} sur ${chemin}`).toBeTruthy();
      }
    }
  }
  expect(vus.size).toBeGreaterThan(30);
});

test("sitemap, robots.txt et anciennes adresses à ancre", async ({ page, request }) => {
  const sm = await request.get("/sitemap-0.xml");
  expect(sm.status()).toBe(200);
  const xml = await sm.text();
  expect(xml).toContain("/idees/sante/");
  expect(xml).not.toContain("/commande/");
  expect((await request.get("/robots.txt")).status()).toBe(200);
  for (const [ancre, cible] of [["formation", "/programme/"], ["tarifs", "/tarifs/"], ["cgv", "/cgv/"], ["idees", "/idees/"]]) {
    await page.goto(`/#${ancre}`);
    await expect(page).toHaveURL(new RegExp(`${cible}$`));
  }
});

test.describe("marchés et idées", () => {
  test("chaque bouton de marché de l’accueil ouvre le bon marché", async ({ page }) => {
    for (const m of donnees.marches) {
      await page.goto("/");
      await page.getByRole("link", { name: m.court, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/idees/${m.id}/$`));
      await expect(page.locator("h1")).toHaveText(m.nom);
    }
  });

  test("les 1 500 idées sont affichées, 100 par marché, avec le message de non-validation", async ({ page }) => {
    let total = 0;
    for (const m of donnees.marches) {
      await page.goto(`/idees/${m.id}/`);
      const n = await page.locator("[data-idee]").count();
      expect(n, m.nom).toBe(100);
      await expect(page.locator(".niche")).toHaveCount(20);
      await expect(page.getByText("Une idée rédigée n’est pas une niche validée").first()).toBeVisible();
      // Chaque idée du fichier est bien sur la page.
      const noms = await page.locator("[data-idee] h3").allTextContents();
      expect(noms).toEqual(m.niches.flatMap((x) => x.idees.map((i) => i.nom)));
      total += n;
    }
    expect(total).toBe(1500);
  });

  test("une puce de niche fait défiler jusqu’à la niche", async ({ page }) => {
    await page.goto("/idees/btp/");
    await page.getByRole("link", { name: "5. Couvreurs" }).click();
    await expect(page).toHaveURL(/#couvreurs$/);
    await expect(page.locator("#couvreurs h2")).toBeInViewport();
  });
});

test.describe("tarifs", () => {
  test("trois prix conservés, pas de fausse preuve de ventes, mention TVA non affirmée", async ({ page }) => {
    await page.goto("/tarifs/");
    const montants = await page.locator(".tarif .montant").allTextContents();
    expect(montants.map((t) => t.match(/\d+,\d+ €/)[0])).toEqual(["14,90 €", "24,90 €", "54,90 €"]);
    await expect(page.getByText("Le plus choisi")).toHaveCount(0);
    await expect(page.getByText("Notre recommandation")).toBeVisible();
    await expect(page.locator(".tarif .taxes").first()).toContainText("Mention de TVA à confirmer");
    await expect(page.getByText("Les cours en vidéo").first()).toBeVisible();
    await expect(page.getByText("En préparation").first()).toBeVisible();
    await expect(page.getByText("Les commandes en ligne ne sont pas encore ouvertes.")).toBeVisible();
  });

  test("les boutons « Choisir » sont alignés en bas des cartes (ordinateur)", async ({ page }, info) => {
    test.skip(info.project.name !== "ordinateur", "cartes empilées sur mobile");
    await page.goto("/tarifs/");
    const bas = await page.locator(".tarif .btn").evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().bottom)));
    expect(new Set(bas).size).toBe(1);
    const titres = await page.locator(".tarif h3").evaluateAll((hs) => hs.map((h) => Math.round(h.getBoundingClientRect().top)));
    expect(new Set(titres).size).toBe(1);
  });

  test("choisir une formule pré-remplit l’inscription", async ({ page }) => {
    await page.goto("/tarifs/");
    await page.getByRole("link", { name: /Choisir la formule Accompagné/ }).click();
    await expect(page).toHaveURL(/\/inscription\/\?formule=accompagne$/);
    await expect(page.getByLabel(/Formule qui vous intéresse/)).toHaveValue("accompagne");
  });
});

test.describe("explorateur d’idées", () => {
  const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const attendu = (mot) => donnees.marches.flatMap((m) => m.niches.flatMap((n) => n.idees.filter((i) =>
    norm(`${i.nom} ${i.description} ${n.nom} ${m.nom} ${m.court}`).includes(mot)))).length;

  test("recherche sans accents ni majuscules, compteur exact", async ({ page }) => {
    await page.goto("/idees/");
    const q = page.getByLabel("Rechercher une idée, une niche ou un métier");
    await q.fill("medecine");
    const n = attendu("medecine");
    expect(n).toBeGreaterThan(0);
    await expect(page.locator("#explo-compte")).toHaveText(`${n} idée${n > 1 ? "s" : ""} trouvée${n > 1 ? "s" : ""}.`);
    await expect(page.locator("#explo-resultats .idee").first()).toBeVisible();
    await q.fill("MÉDECINE");
    await expect(page.locator("#explo-compte")).toHaveText(`${n} idée${n > 1 ? "s" : ""} trouvée${n > 1 ? "s" : ""}.`);
    await expect(page.locator("#explo-resultats .idee").first()).toContainText("Médecine esthétique");
  });

  test("aucun résultat : message clair et bouton pour tout effacer", async ({ page }) => {
    await page.goto("/idees/");
    await page.getByLabel("Rechercher une idée, une niche ou un métier").fill("zzqxw");
    await expect(page.locator("#explo-compte")).toHaveText("0 idée trouvée.");
    await expect(page.getByText("Aucune idée ne correspond à votre recherche.")).toBeVisible();
    await page.getByRole("button", { name: "Effacer la recherche" }).click();
    await expect(page.locator("#explo-vide")).toBeHidden();
    await expect(page.getByLabel("Rechercher une idée, une niche ou un métier")).toBeFocused();
  });

  test("filtre par marché : 100 idées, affichage progressif", async ({ page }) => {
    await page.goto("/idees/");
    await page.locator("#explo-marche").selectOption("finance");
    await expect(page.locator("#explo-compte")).toHaveText("100 idées trouvées.");
    await expect(page.locator("#explo-resultats .idee")).toHaveCount(24);
    await expect(page.locator("#explo-resultats .idee .num").first()).toContainText("Finance et fintech");
    await page.getByRole("button", { name: /Afficher plus de résultats/ }).click();
    await expect(page.locator("#explo-resultats .idee")).toHaveCount(48);
  });

  test("favoris : conservés dans le navigateur après rechargement, visibles sur la page du marché", async ({ page }) => {
    await page.goto("/idees/");
    await page.getByLabel("Rechercher une idée, une niche ou un métier").fill("DevisDent");
    const fav = page.getByRole("button", { name: "Favori : DevisDent" });
    await expect(fav).toHaveAttribute("aria-pressed", "false");
    await fav.click();
    await expect(fav).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#annonce-actions")).toContainText("DevisDent ajouté aux favoris");
    await page.reload();
    await expect(page.locator("#explo-nb-favoris")).toHaveText("1");
    await page.getByLabel(/Seulement mes favoris/).check();
    await expect(page.locator("#explo-compte")).toHaveText("1 idée trouvée.");
    await page.goto("/idees/sante/");
    await expect(page.getByRole("button", { name: "Favori : DevisDent" })).toHaveAttribute("aria-pressed", "true");
  });

  test("copier une idée : le texte copié rappelle qu’elle n’est pas validée", async ({ page, context, browserName }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/idees/btp/");
    await page.getByRole("button", { name: "Copier l’idée DevisPlomb" }).click();
    await expect(page.locator("#annonce-actions")).toHaveText("Idée copiée dans le presse-papiers.");
    const texte = await page.evaluate(() => navigator.clipboard.readText());
    expect(texte).toContain("DevisPlomb : devis à partir de photos du problème");
    expect(texte).toContain("n’est pas une niche validée");
  });

  test("filtre à l’intérieur d’un marché, avec état vide", async ({ page }) => {
    await page.goto("/idees/sante/");
    const champ = page.getByLabel("Filtrer les idées de ce marché");
    await champ.fill("ordonnance");
    const n = donnees.marches[0].niches.flatMap((x) => x.idees.filter((i) => norm(`${i.nom} ${i.description} ${x.nom}`).includes("ordonnance"))).length;
    await expect(page.locator("#filtre-compte")).toHaveText(`${n} idée${n > 1 ? "s" : ""} sur 100 dans ce marché.`);
    await expect(page.locator("[data-idee]:visible")).toHaveCount(n);
    await champ.fill("zzqxw");
    await expect(page.getByText("Aucune idée de ce marché ne correspond à ce filtre.")).toBeVisible();
    await champ.fill("");
    await expect(page.locator("[data-idee]:visible")).toHaveCount(100);
  });
});

test.describe("programme", () => {
  test("sommaire : un lien ouvre le bon module ; « Tout ouvrir » puis « Tout fermer »", async ({ page }) => {
    await page.goto("/programme/");
    await expect(page.locator("details.module")).toHaveCount(6);
    await page.getByRole("navigation", { name: "Sommaire du programme" }).getByRole("link", { name: /04 Fixer le prix/ }).click();
    await expect(page).toHaveURL(/#module-4$/);
    await expect(page.locator("#module-4")).toHaveAttribute("open", "");
    const bouton = page.getByRole("button", { name: "Tout ouvrir" });
    await bouton.click();
    for (let i = 1; i <= 6; i++) await expect(page.locator(`#module-${i}`)).toHaveAttribute("open", "");
    await expect(page.getByRole("button", { name: "Tout fermer" })).toBeVisible();
    await page.getByRole("button", { name: "Tout fermer" }).click();
    await expect(page.locator("details.module[open]")).toHaveCount(0);
  });

  test("lien direct vers un module : il s’ouvre à l’arrivée", async ({ page }) => {
    await page.goto("/programme/#module-5");
    await expect(page.locator("#module-5")).toHaveAttribute("open", "");
    await expect(page.locator("#module-5 .resultat")).toContainText("Livrable");
  });
});

test.describe("accueil : éléments de vente", () => {
  test("le laboratoire tire une vraie idée du catalogue, dans le marché choisi", async ({ page }) => {
    await page.goto("/");
    const nomsImmo = donnees.marches.find((m) => m.id === "immobilier").niches.flatMap((n) => n.idees.map((i) => i.nom));
    await page.locator("#labo-marche").selectOption("immobilier");
    for (let k = 0; k < 3; k++) {
      await page.getByRole("button", { name: "Tirer une idée" }).click();
      await expect(page.locator("#labo-ou")).toContainText("Immobilier ·");
      const nom = await page.locator("#labo-nom").textContent();
      expect(nomsImmo).toContain(nom);
      const lien = await page.locator("#labo-lien").getAttribute("href");
      expect(lien).toMatch(/^\/idees\/immobilier\/#[a-z0-9-]+$/);
    }
    await expect(page.locator("#labo-carte")).toContainText("n’est pas une niche validée");
  });

  test("tarifs sur l’accueil et graphique du simulateur qui réagit", async ({ page }) => {
    await page.goto("/");
    const montants = await page.locator(".tarif .montant").allTextContents();
    expect(montants.map((t) => t.match(/\d+,\d+ €/)[0])).toEqual(["14,90 €", "24,90 €", "54,90 €"]);
    const avant = await page.locator(".graphe .barre").last().getAttribute("height");
    await page.locator("#r-clients").fill("1000");
    const apres = await page.locator(".graphe .barre").last().getAttribute("height");
    expect(Number(apres)).toBeGreaterThan(Number(avant));
  });

  test("comparatif des formules : rien d’inventé, éléments en préparation signalés", async ({ page }) => {
    await page.goto("/tarifs/");
    const table = page.getByRole("table", { name: "Comparer les formules" });
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(6);
    await expect(table.getByText("En préparation").first()).toBeVisible();
    await expect(table.getByText("Modalités à définir")).toBeVisible();
  });
});

test.describe("formulaires", () => {
  // Adresse unique par test et par appareil : les tests tournent en parallèle sur le même stockage.
  const emailUnique = (info, nom) => `${nom}-${info.project.name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemple.fr`;
  // Délai humain avant l'envoi : le serveur refuse les envois faits moins de 1,5 s après l'ouverture (robots).
  const attendreCommeUnHumain = (page) => page.waitForTimeout(1_600);

  test("inscription : erreurs claires puis enregistrement réel, sans prétendre qu’un e-mail est parti", async ({ page }, info) => {
    await page.goto("/inscription/");
    await page.getByRole("button", { name: "Envoyer mon inscription" }).click();
    await expect(page.locator("#err-prenom")).toBeVisible();
    await expect(page.getByLabel(/^Prénom/)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel(/^Prénom/)).toBeFocused();

    await page.getByLabel(/^Prénom/).fill("Marie");
    await page.getByLabel(/^Nom/).fill("Durand");
    const email = emailUnique(info, "marie");
    await page.getByLabel(/^E-mail/).fill(email);
    await page.getByLabel(/^Profession/).fill("Comptable");
    await page.getByLabel(/politique de confidentialité/).check();
    await attendreCommeUnHumain(page);
    await page.getByRole("button", { name: "Envoyer mon inscription" }).click();
    const zone = page.locator("#zone-message");
    await expect(zone).toContainText("Votre inscription est enregistrée.");
    await expect(zone).toContainText(/Référence : INS-\d{8}-/);
    await expect(zone).toContainText("Aucun e-mail de confirmation automatique");
    await expect(zone).not.toContainText("vient de vous être envoyé");
    const premiereRef = (await zone.textContent()).match(/INS-\d{8}-[A-Z0-9]{6}/)[0];

    // Second envoi avec le même e-mail : pas de doublon, même référence.
    await page.reload();
    await page.getByLabel(/^Prénom/).fill("Marie");
    await page.getByLabel(/^Nom/).fill("Durand");
    await page.getByLabel(/^E-mail/).fill(email.toUpperCase());
    await page.getByLabel(/^Profession/).fill("Comptable");
    await page.getByLabel(/politique de confidentialité/).check();
    await attendreCommeUnHumain(page);
    await page.getByRole("button", { name: "Envoyer mon inscription" }).click();
    await expect(zone).toContainText("Vous êtes déjà inscrit(e).");
    await expect(zone).toContainText(premiereRef);
    await expect(zone).toContainText("Aucun doublon n’a été créé.");
  });

  // Le refus côté serveur est testé de façon déterministe dans tests/unitaires ; ici on vérifie l'affichage.
  test("inscription : envoi jugé trop rapide → message clair, rien d’annoncé comme enregistré", async ({ page }, info) => {
    let corps = null;
    await page.route("/api/inscription", (r) => { corps = r.request().postDataJSON(); r.fulfill({ status: 400, contentType: "application/json", body: '{"ok":false,"code":"trop_rapide"}' }); });
    await page.goto("/inscription/");
    await page.getByLabel(/^Prénom/).fill("Robot");
    await page.getByLabel(/^Nom/).fill("Rapide");
    await page.getByLabel(/^E-mail/).fill(emailUnique(info, "robot"));
    await page.getByLabel(/^Profession/).fill("Test");
    await page.getByLabel(/politique de confidentialité/).check();
    await page.getByRole("button", { name: "Envoyer mon inscription" }).click();
    const zone = page.locator("#zone-message");
    await expect(zone).toContainText("Envoi trop rapide");
    await expect(zone).not.toContainText("enregistrée.");
    expect(typeof corps.ouvert_le).toBe("number");   // l'heure d'ouverture est bien transmise au serveur
  });

  test("inscription : coupure réseau → aucun faux succès, parcours e-mail proposé", async ({ page }) => {
    await page.route("/api/inscription", (r) => r.abort("internetdisconnected"));
    await page.goto("/inscription/");
    await page.getByLabel(/^Prénom/).fill("Paul");
    await page.getByLabel(/^Nom/).fill("Martin");
    await page.getByLabel(/^E-mail/).fill("paul@exemple.fr");
    await page.getByLabel(/^Profession/).fill("Artisan");
    await page.getByLabel(/politique de confidentialité/).check();
    await page.getByRole("button", { name: "Envoyer mon inscription" }).click();
    const zone = page.locator("#zone-message");
    await expect(zone).toContainText("n’a pas été enregistrée");
    await expect(zone).not.toContainText("Votre inscription est enregistrée");
    await expect(page.getByRole("button", { name: "Envoyer mon inscription" })).toBeEnabled();
  });

  test("inscription : si le serveur est indisponible, parcours e-mail explicite (aucune ouverture automatique)", async ({ page, context }) => {
    await page.route("/api/inscription", (r) => r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"code":"stockage_non_configure"}' }));
    let popups = 0;
    context.on("page", () => popups++);
    await page.goto("/inscription/?formule=essentiel");
    await page.getByLabel(/^Prénom/).fill("Paul");
    await page.getByLabel(/^Nom/).fill("Martin");
    await page.getByLabel(/^E-mail/).fill("paul@exemple.fr");
    await page.getByLabel(/^Profession/).fill("Artisan");
    await page.getByLabel(/politique de confidentialité/).check();
    await page.getByRole("button", { name: "Envoyer mon inscription" }).click();
    const zone = page.locator("#zone-message");
    await expect(zone).toContainText("n’a pas été enregistrée");
    const mailto = await zone.getByRole("link", { name: "Ouvrir mon application mail" }).getAttribute("href");
    expect(mailto).toMatch(/^mailto:lelouparthur1@gmail\.com\?subject=/);
    expect(decodeURIComponent(mailto)).toContain("Formule : Essentiel");
    expect(popups).toBe(0);
  });

  test("rétractation : demande enregistrée et horodatée", async ({ page }, info) => {
    await page.goto("/retractation/");
    await page.getByLabel(/^Prénom/).fill("Marie");
    await page.getByLabel(/^Nom/).fill("Durand");
    await page.getByLabel(/^E-mail/).fill(emailUnique(info, "retract"));
    await page.getByLabel(/Date de la commande/).fill("2026-10-30");
    await page.getByLabel(/Je déclare me rétracter/).check();
    await attendreCommeUnHumain(page);
    await page.getByRole("button", { name: "Confirmer ma rétractation" }).click();
    const zone = page.locator("#zone-message");
    await expect(zone).toContainText("Votre demande de rétractation est enregistrée.");
    await expect(zone).toContainText(/RET-\d{8}-/);
    await expect(zone).toContainText("Aucun accusé de réception n’a pu être envoyé");
  });

  test("commande : fermée, renvoie vers l’inscription", async ({ page, request }) => {
    await page.goto("/commande/?formule=complet");
    await expect(page.getByText("Les commandes en ligne ne sont pas encore ouvertes.")).toBeVisible();
    await expect(page.locator("#form-commande")).toHaveCount(0);
    const r = await request.post("/api/commande", { data: {} });
    expect(r.status()).toBe(403);
  });
});

test.describe("assistant", () => {
  test("mode secours : la question sur la formule Complet répond 24,90 €", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Posez votre question/ }).click();
    await expect(page.getByLabel("Votre question")).toBeFocused();
    await page.getByLabel("Votre question").fill("combien coûte la formule complète ?");
    await page.keyboard.press("Enter");
    const journal = page.locator("#chat-journal");
    await expect(journal).toContainText("La formule Complet coûte 24,90 €");
    await expect(journal).toContainText("Réponse tirée des informations du site.");
    await expect(journal.getByRole("link", { name: "Voir les tarifs →" })).toBeVisible();
  });

  test("assistant ouvert : bouton d’ouverture masqué, panneau opaque", async ({ page }) => {
    await page.goto("/tarifs/");
    await page.getByRole("button", { name: /Posez votre question/ }).click();
    await expect(page.locator("#chat-ouvrir")).toBeHidden();
    const fond = await page.locator("#chat-panneau").evaluate((p) => getComputedStyle(p).backgroundColor);
    expect(fond).toBe("rgb(11, 13, 24)");
  });

  test("Échap ferme l’assistant et rend le focus au bouton", async ({ page }) => {
    await page.goto("/programme/");
    const bouton = page.getByRole("button", { name: /Posez votre question/ });
    await bouton.click();
    await expect(page.locator("#chat-panneau")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#chat-panneau")).toBeHidden();
    await expect(bouton).toBeFocused();
    await expect(bouton).toHaveAttribute("aria-expanded", "false");
  });

  test("le bouton de l’assistant ne cache pas le bas de page", async ({ page }) => {
    await page.goto("/tarifs/");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const bouton = await page.locator("#chat-ouvrir").boundingBox();
    const dernier = await page.locator(".pied .avert").boundingBox();
    expect(dernier.y + dernier.height, "le dernier texte finit au-dessus du bouton").toBeLessThanOrEqual(bouton.y);
  });
});

test.describe("clavier et mobile", () => {
  test("le lien « Aller au contenu » est le premier élément et mène au contenu", async ({ page }) => {
    await page.goto("/tarifs/");
    await page.keyboard.press("Tab");
    const lien = page.getByRole("link", { name: "Aller au contenu" });
    await expect(lien).toBeFocused();
    await expect(lien).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#contenu$/);
    await expect(page.locator("#contenu")).toBeFocused();
  });

  test("menu : tous les liens accessibles, page actuelle indiquée", async ({ page }, info) => {
    await page.goto("/questions/");
    if (info.project.name === "mobile") {
      const menu = page.getByRole("button", { name: "Menu" });
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
    }
    const nav = page.getByRole("navigation", { name: "Navigation principale" });
    for (const nom of ["Le programme", "Marchés et idées", "Tarifs", "Questions", "Contact"]) {
      await expect(nav.getByRole("link", { name: nom })).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "Questions" })).toHaveAttribute("aria-current", "page");
    if (info.project.name === "mobile") {
      await expect(nav.getByRole("link", { name: "Je m’inscris" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Menu" })).toBeFocused();
      await expect(nav.getByRole("link", { name: "Tarifs" })).toBeHidden();
    }
  });

  test("mobile : le titre de l’accueil n’est pas caché sous l’en-tête", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "AUREVIA SAAS", exact: true }).click();
    const entete = await page.locator(".entete").boundingBox();
    const h1 = await page.locator("h1").boundingBox();
    expect(h1.y).toBeGreaterThanOrEqual(entete.y + entete.height);
  });

  test("marges latérales d’au moins 16 px sur chaque titre principal", async ({ page }) => {
    for (const [url] of PAGES.slice(0, 12)) {
      await page.goto(url);
      const h1 = await page.locator("h1").boundingBox();
      const largeur = page.viewportSize().width;
      expect(h1.x, url).toBeGreaterThanOrEqual(16);
      expect(largeur - (h1.x + h1.width), url).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe("accessibilité automatique (axe)", () => {
  for (const url of ["/", "/programme/", "/idees/", "/idees/sante/", "/tarifs/", "/questions/", "/contact/", "/inscription/", "/retractation/", "/cgv/"]) {
    test(`${url} sans violation WCAG A/AA détectée`, async ({ page }) => {
      await page.goto(url);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const resume = r.violations.map((v) => `${v.id} (${v.impact}) : ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(resume).toEqual([]);
    });
  }
});

test("accessibilité (axe) : recherche d’idées avec résultats, favori actif et message", async ({ page }) => {
  await page.goto("/idees/");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByLabel("Rechercher une idée, une niche ou un métier").fill("devis");
  await expect(page.locator("#explo-resultats .idee").first()).toBeVisible();
  await page.locator("#explo-resultats button[data-favori]").first().click();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${v.id} : ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});

test("préférence « réduire les animations » respectée", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const anim = await page.evaluate(() => ({
    halo: getComputedStyle(document.body, "::after").animationName,
    grille: document.querySelector(".horizon") ? getComputedStyle(document.querySelector(".horizon"), "::before").animationName : "none",
    orb: getComputedStyle(document.querySelector(".orb")).animationName,
    scroll: getComputedStyle(document.documentElement).scrollBehavior,
  }));
  expect(anim).toEqual({ halo: "none", grille: "none", orb: "none", scroll: "auto" });
});
