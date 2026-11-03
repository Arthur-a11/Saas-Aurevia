# Ce qu'il reste à faire avant d'ouvrir les ventes

Mis à jour le 2 novembre 2026. Les ventes réelles restent bloquées par le serveur tant que ces points ne sont pas réglés.

Ce document ne remplace ni un comptable ni un juriste. Les règles (seuils, taux, démarches) changent : vérifiez toujours sur les sites officiels indiqués.

## 1. Votre entreprise

Pour vendre la formation, il faut une entreprise déclarée, avec un numéro SIREN.

**Le plus simple pour démarrer seul : la micro-entreprise.**

- La création est gratuite et se fait en ligne sur le guichet officiel : https://formalites.entreprise.gouv.fr
- Les informations officielles sur le statut se trouvent sur https://www.autoentrepreneur.urssaf.fr
- L'activité à déclarer ressemble à « formation en ligne » ou « vente de contenus numériques ». Le guichet propose des codes : choisissez le plus proche, et demandez à l'URSSAF en cas de doute.
- **TVA** : une micro-entreprise peut souvent bénéficier de la « franchise en base de TVA ». Elle n'ajoute alors pas de TVA, et ses prix portent la mention « TVA non applicable, art. 293 B du CGI ». Les seuils ont changé récemment : vérifiez-les sur https://www.impots.gouv.fr ou auprès d'un comptable.

**Ce qu'il faudra me donner ensuite (je le mets sur le site)**

- votre nom ou le nom de l'entreprise ;
- le statut (par exemple « entrepreneur individuel ») ;
- l'adresse à afficher ;
- le numéro SIREN ;
- « franchise de TVA » ou votre numéro de TVA.

Si vous ne voulez pas afficher votre adresse personnelle, demandez au guichet ou à un comptable ce qui est possible (domiciliation).

## 2. Le médiateur de la consommation

Comme vous vendez à des particuliers, la loi vous oblige à proposer gratuitement à vos clients un médiateur de la consommation en cas de litige. C'est un service payant pour vous : je ne peux pas y souscrire à votre place.

1. La liste officielle des médiateurs agréés se trouve sur https://www.economie.gouv.fr/mediation-conso. Cherchez ceux qui acceptent le commerce en ligne ou la formation.
2. Comparez deux ou trois médiateurs : le prix d'adhésion, le prix par litige, et les secteurs acceptés.
3. Souscrivez au contrat.
4. Donnez-moi son nom, son adresse postale et l'adresse de son site : je les ajoute aux CGV et aux mentions légales.

## 3. L'avis personnel (formule Accompagné)

**Déjà fait** : vous avez choisi « un retour écrit sur le projet envoyé, une fois par mois d'abonnement, réponse sous 5 jours ouvrés ». C'est maintenant affiché sur les pages Tarifs et CGV.

**Encore à décider, en une phrase chacun :**

1. **Limites.** Que se passe-t-il si l'élève n'utilise pas son retour du mois : le perd-il ou le garde-t-il pour le mois suivant ? Comment envoie-t-il son projet (e-mail, formulaire), et quelle taille maximale (par exemple 2 pages) ?
2. **Part du prix pour le service.** Sur les 54,90 € par mois, quelle part correspond à votre retour écrit ? Cette part sert au calcul en cas de rétractation, et votre juriste ou comptable peut vous aider à la fixer.

## 4. La formation : relecture faite, validation à vous

J'ai relu les 6 modules (19 leçons, exercices, fiches, modèles, checklists).

**Ce que j'ai corrigé**

- Module 1, leçon 2 : « c'est des millions » est devenu « ce sont des millions ».
- Module 1, exercice : la fiche et la checklist demandaient la phrase « Mon logiciel aide [public] à [résultat] », mais aucune leçon ne disait de l'écrire. C'est maintenant une étape de l'exercice.
- Module 6, leçon 1 : le résumé disait « regardez les personnes derrière les pourcentages », sans explication dans la leçon. Un paragraphe l'explique maintenant, avec un exemple.
- Module 6, fiche : il manquait le 5e indicateur (rentabilité par client). Il est ajouté.

**Ce que j'ai vérifié sans rien trouver à corriger**

- Les calculs des exemples (seuil de 6 clients, churn de 5 %, activation de 60 %) sont justes.
- Les exemples sont tous marqués « fictif », et aucune leçon ne promet de revenus.
- Les points juridiques des leçons (prospection, RGPD, TVA, faux témoignages) renvoient à la CNIL, à un comptable ou à un juriste, sans rien affirmer de risqué.

**Ce que vous seul pouvez juger**

- Le ton vous ressemble-t-il ? Vous allez le signer.
- Les outils cités (Bubble, Softr, Glide, Airtable, Make, Zapier, n8n, Figma, Canva, Penpot) : les connaissez-vous et les recommanderiez-vous ?
- Manque-t-il un sujet qui vous semble important ?

Toute la formation se lit dans `docs/formation/relecture.md`. Quand vous l'avez lue, dites-moi « je valide le module X » (ou « tout »). Je passerai alors ces éléments en « validé ». Jusque-là, ils restent en brouillon.

**Les vidéos n'existent pas encore.** Les scripts sont prêts (`docs/formation/scripts-videos.md`). Les vidéos restent « en préparation » sur le site jusqu'à ce que vous les tourniez.

## 5. Publier la nouvelle version sur le site officiel (mis de côté le 3 novembre)

Arthur a demandé que le site de test devienne le site officiel. C'est prêt, mais en attente pour deux raisons :

- **Crédits Netlify épuisés** : les mises en ligne sont en pause (bandeau rouge sur Netlify). Elles reprennent au prochain cycle de facturation, ou plus tôt avec une offre payante (choix d'Arthur).
- Arthur préfère publier en même temps que les informations d'entreprise (SIREN, etc.).

Déjà vérifié : `SEL_EMPREINTE` existe sur le projet officiel `aurevia-saas`, donc les comptes y seront protégés.

Le jour venu, Claude :
1. pose une étiquette de sauvegarde sur la version officielle actuelle ;
2. publie la branche `refonte-visuelle` sur `main` (le site officiel suit `main`) ;
3. vérifie le site officiel avec Arthur, page par page.

Les paiements restent fermés : aucune clé Stripe n'est ajoutée au site officiel. À décider ce jour-là : régler `SITE_URL` (pour que Google indexe le site) et, si Arthur le souhaite, les e-mails Brevo, qui servent aussi au mot de passe oublié.

## 6. Dossier pour le juriste

Montrez-lui les pages CGV, Mentions légales, Confidentialité et Rétractation du site de test (https://aurevia-saas-test.netlify.app), ainsi que ces questions.

1. **Délai de 14 jours avec un abonnement.** J'ai choisi d'ouvrir l'accès 14 jours après le paiement, sauf si le client demande un accès immédiat et renonce à son droit de rétractation. Avec un abonnement mensuel, le premier mois est payé avant l'ouverture. Est-ce conforme, et est-ce clair pour le client ? Faut-il plutôt proposer seulement l'accès immédiat avec renonciation ?
2. **Résiliation.** La résiliation se fait en ligne à tout moment, et l'accès reste ouvert jusqu'à la fin du mois payé. La loi impose-t-elle autre chose (bouton de résiliation, information avant renouvellement) ?
3. **Formule Accompagné.** Elle mélange des contenus numériques et un service (le retour écrit). Les règles de rétractation de l'article 8 des CGV sont-elles correctes ? Comment fixer la part du prix du service ?
4. **Remboursements.** Que prévoir en cas de remboursement partiel, ou de rétractation après un début d'accès ?
5. **Mentions obligatoires.** Manque-t-il quelque chose dans les mentions légales, les CGV ou l'e-mail de confirmation de commande ?
6. **Données personnelles.** La politique de confidentialité est-elle complète (Stripe, Brevo, Netlify, durées de conservation) ?

Quand il a validé, dites-le-moi : je retirerai les mentions « brouillon » et je débloquerai ce point.
