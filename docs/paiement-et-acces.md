# Paiement et accès à la formation

Mis à jour le 1er novembre 2026. Branche `espace-formation`. **Cette version n'est pas publiée** : le site public reste sur la version précédente (étiquette Git `avant-espace-formation`).

## 1. Le parcours

1. La personne choisit une formule (page Tarifs → Commande).
2. Elle se connecte ou crée son compte (page `/compte/`).
3. Elle coche les accords (CGV obligatoires ; accès immédiat facultatif), puis paie sur la page sécurisée de **Stripe**.
4. Stripe envoie une notification **signée** au serveur (`/api/paiement/webhook`). Le serveur vérifie :
   - la signature ;
   - le montant ;
   - la devise ;
   - la référence de commande.
5. Les droits de la formule sont enregistrés dans le compte (magasin Blobs `droits`).
6. La personne revient sur « Ma formation ». La page affiche « Vérification du paiement en cours » jusqu'à la confirmation, puis le bouton « Commencer ma formation ».
7. À chaque connexion, elle retrouve ses modules et sa progression.

Si la notification tarde, le serveur interroge lui-même Stripe avec la clé secrète.

**Rien ne se débloque par le navigateur** : ni par l'adresse de retour (`?commande=…`), ni par un paramètre, ni par une valeur stockée dans le navigateur.

## 2. Ce que donne chaque formule

La correspondance formules, contenus et droits est **centralisée** dans `src/data/formation.json`. Les tarifs, la commande, le serveur et l'espace client la lisent tous. Le contenu de la formation (brouillons) est dans `serveur/contenus/`, et sa version de relecture dans `docs/formation/relecture.md`.

Les règles d'ouverture (immédiate ou différée), la durée d'accès, l'accompagnement et l'état juridique sont dans `src/data/conditions.json`.

L'état complet et les décisions à prendre sont dans **`docs/etat-et-decisions.md`**. L'audit du délai de 14 jours est dans **`docs/juridique-acces.md`**.

## 3. Sécurité

| Protection | Comment |
|---|---|
| Comptes | Mot de passe protégé par scrypt, jamais stocké en clair. Session par cookie `HttpOnly`, `SameSite=Lax` et `Secure` en HTTPS, valable 30 jours. Le serveur ne garde que l'empreinte du jeton. |
| Essais de connexion | 10 par adresse et par heure, 30 par visiteur. Le temps de réponse est le même que le compte existe ou non. |
| Prix | Fixés par le serveur (`site.json`). Un prix envoyé par le navigateur est ignoré. |
| Notifications | Signature HMAC vérifiée, refus au-delà de 5 minutes (contre le rejeu). Une notification du mode test ne touche pas un site en mode réel. |
| Doublons | Chaque notification n'est traitée qu'une fois, et un achat n'est ouvert qu'une fois par commande. Une formule déjà détenue ne peut pas être rachetée. |
| Paiement en attente, refusé, annulé ou expiré | La commande est notée, aucun droit n'est ouvert. |
| Remboursement | S'il est total, l'accès de la commande est retiré. S'il est partiel, il est noté et l'accès est conservé. |
| Contenus | Les leçons arrivent par `/api/formation/lecon`, après vérification des droits. Les fichiers (fiches, modèles) arrivent par `/api/formation/fichier` depuis le magasin Blobs `fichiers-formation`, jamais depuis une adresse publique. |
| Historique | Magasins Blobs `commandes` (statuts horodatés et accords), `droits` (achats et historique), `evenements-stripe` et `paiements`. |

## 4. Brancher Stripe en MODE TEST (sur une version de test, pas sur le site public)

1. Créez un compte Stripe, puis restez en **mode test** (interrupteur « Test mode »).
2. Ouvrez **Développeurs > Clés API** et copiez la clé secrète de test (`sk_test_…`). Ne la collez jamais dans une conversation.
3. Ouvrez **Développeurs > Webhooks > Ajouter un point de terminaison** :
   - adresse : `https://VOTRE-SITE/api/paiement/webhook` ;
   - événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` et `charge.refunded`.

   Copiez ensuite le « secret de signature » (`whsec_…`).
4. Sur Netlify, ouvrez **Project configuration > Environment variables**. Ajoutez `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET`, puis redéployez.
5. `/api/etat` doit alors afficher `"paiementStripe":"test"`. La page Commande affiche le bandeau « Mode test ». Payez avec la carte de test `4242 4242 4242 4242`.

## 5. Avant les ventes réelles (rien de tout cela n'est fait)

- Identité de l'entreprise, régime de TVA, médiateur de la consommation, CGV relues par un juriste.
- Contenus réellement produits, avec le statut `disponible` dans `formation.json` (et les fichiers déposés dans Blobs `fichiers-formation`).
- E-mails Brevo connectés : confirmation sur support durable. En mode réel, la vente est refusée sans e-mail.
- `paiement.actif: true` dans `site.json`, puis les clés `sk_live_…` et `whsec_…` du mode réel.
- Réinitialisation du mot de passe par e-mail. Elle n'est pas encore faite, faute de Brevo ; d'ici là, la page Compte renvoie vers Contact.
- Litiges (contestations bancaires) et suppression de compte à la demande (RGPD) : à traiter à la main pour l'instant.

## 6. Tests

- Tests serveur (`tests/unitaires/espace.test.mjs`), avec un Stripe simulé :
  - comptes ;
  - signatures ;
  - les 3 formules ;
  - redirection falsifiée ;
  - montant modifié ;
  - notifications répétées ;
  - paiement refusé, en attente ou expiré ;
  - remboursements ;
  - délai de 14 jours ;
  - progression ;
  - téléchargement protégé.
- Tests navigateur (`tests/e2e/paiement.spec.mjs`), sur ordinateur et téléphone, avec le **simulateur Stripe local** (`scripts/stripe-simule.mjs`). Ils couvrent le parcours complet pour les 3 formules, l'annulation, le refus, la notification retardée, la notification en double puis le remboursement, la reconnexion et l'accessibilité.

**Non testé** : le vrai Stripe, même en mode test (aucun compte fourni), et aucun paiement réel.
