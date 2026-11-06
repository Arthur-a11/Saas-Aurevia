# Mise en ligne sur Vercel (branche `vercel-test`)

État : code **prêt pour un test**, jamais déployé. Le site officiel (branche `main`, Netlify) n'est pas modifié.
Ce qui est vérifié : le stockage Redis et la reconstruction des routes (7 tests unitaires, avec un faux Redis). Ce qui **n'est pas vérifié** : la construction du site et les tests navigateur (réseau bloqué dans l'environnement de Claude), et tout le fonctionnement sur le vrai Vercel et le vrai Redis.

## Ce qui a changé par rapport à Netlify
- `api/*.mjs` : les 5 fonctions Vercel (même logique serveur que sur Netlify, dans `serveur/`).
- `vercel.json` : construction, redirection des routes `/api/compte/*`, `/api/paiement/*`, `/api/formation/*`, `/api/abonnement/*` vers `api/espace`, en-têtes de sécurité.
- `serveur/stockage.js` : nouveau stockage « redis » (Upstash) à la place de Netlify Blobs. Écritures simultanées protégées par comparaison avant écriture.
- `serveur/vercel.js` : enveloppe Vercel (adresse IP, chemin d'origine, corps brut pour la signature Stripe).
- Les fichiers Netlify (`netlify/`, `netlify.toml`) sont **gardés** pour pouvoir comparer. On les retirera à la bascule.

## Étapes pour toi (une à la fois)
1. **Compte Vercel** : vercel.com, « Continue with GitHub ». Attention : l'offre gratuite (Hobby) est en principe réservée à un usage non commercial. Pour vendre la formation, vérifie les conditions et prévois sans doute l'offre Pro.
2. **Nouveau projet** : « Add New > Project », choisis `Arthur-a11/saas-aurevia`, branche **`vercel-test`**. Réglages détectés automatiquement (Astro). Ne mets pas encore de domaine.
3. **Base Redis** : dans le projet, onglet « Storage » > Marketplace > **Upstash Redis** > créer, puis « Connect to project ». Vercel pose les variables `KV_REST_API_URL` et `KV_REST_API_TOKEN` (ou `UPSTASH_…`).
4. **Variables** (Settings > Environment Variables), saisies par toi seul, jamais dans la conversation :
   `SEL_EMPREINTE` (32 caractères au hasard, nouveau pour ce projet de test), `SITE_URL` (l'adresse `.vercel.app` du test), `STRIPE_SECRET_KEY` (**`sk_test_…`** uniquement), `STRIPE_WEBHOOK_SECRET`, `BREVO_API_KEY`, `EMAIL_EXPEDITEUR`, et `ASSISTANT_IA` / `ANTHROPIC_API_KEY` si tu veux l'assistant.
5. **Redéployer**, puis ouvrir `https://TON-TEST.vercel.app/api/etat` : il doit indiquer `"stockage": "redis"`.
6. **Webhook Stripe (mode test)** : créer une destination vers `https://TON-TEST.vercel.app/api/paiement/webhook` avec les mêmes événements que sur Netlify (voir `docs/paiement-et-acces.md`), puis copier son secret dans `STRIPE_WEBHOOK_SECRET`.
7. Dis-moi « test en ligne » : je lance le parcours (compte, connexion, achat test 4242, résiliation) avec toi.

## Avant d'arrêter Netlify (ne rien arrêter avant)
- Exporter les données du site officiel (comptes, commandes, droits) : à faire depuis Netlify (Blobs). Rien n'a été migré par ce code.
- Domaine : le déplacer vers Vercel seulement après validation complète du test.
- Mettre à jour l'adresse du webhook Stripe du site officiel et `SITE_URL`.
- Retirer `netlify/`, `netlify.toml`, `@netlify/blobs` et le mode « netlify » du stockage, puis mettre à jour `CLAUDE.md` (hébergeur) et le bandeau « Powered by Netlify » de l'assistant.
