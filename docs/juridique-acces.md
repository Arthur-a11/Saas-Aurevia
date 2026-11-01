# Audit : début d'accès et droit de rétractation

Rédigé le 1er novembre 2026. **Ceci n'est pas un avis juridique.**

## Ce qui n'a pas pu être vérifié

Les sources officielles (Légifrance, EUR-Lex) **n'étaient pas accessibles** depuis l'environnement de travail : les adresses ne répondaient pas. Les points ci-dessous viennent :

- de résultats de recherche (sites juridiques, associations de consommateurs) ;
- de la connaissance générale de la directive 2011/83/UE.

Ils doivent être confirmés par un juriste sur les textes en vigueur. Tant que ce n'est pas fait, `conditions.json > juridique.reglesVerifieesSourcesOfficielles` vaut `false` et **le serveur refuse toute vente réelle**.

## Ce que disent les sources consultées (à confirmer)

### 1. Contenus numériques (leçons, fiches, modèles) : article L221-28, 13° du Code de la consommation

Le droit de rétractation ne s'applique plus lorsque deux conditions sont réunies :

- l'exécution a commencé avec l'**accord préalable exprès** du consommateur ;
- le consommateur a **reconnu qu'il perdait** ainsi son droit de rétractation.

Le professionnel doit aussi **confirmer** cet accord et cette reconnaissance sur un support durable, par exemple un e-mail (article L221-13).

### 2. Sans cet accord

**Aucun texte consulté n'oblige à attendre 14 jours.** Si le vendeur ouvre l'accès tout de suite sans l'accord exprès, le client garde son droit de rétractation. D'après les sources consultées, il peut alors se rétracter sans rien payer pour les contenus consultés (article L221-26, à vérifier).

Ouvrir l'accès seulement à la fin du délai est donc un **choix commercial** qui protège le vendeur. Ce n'est **pas une obligation légale universelle**.

### 3. Service d'accompagnement (formule Accompagné)

- **Article L221-25.** Le service ne commence pendant le délai que sur **demande expresse** du client. Si le client se rétracte ensuite, il paie la part du service déjà fournie.
- **Article L221-28, 1°.** Le droit de rétractation disparaît si le service est **entièrement exécuté** avant la fin du délai, avec accord exprès et renoncement.
- Ces règles sont différentes de celles des contenus numériques : le site garde donc deux cases séparées.

### 4. Si l'information manque

Si le client n'a pas été correctement informé de son droit de rétractation, le délai peut être prolongé de 12 mois.

### 5. Fonction de rétractation en ligne

Depuis le 19 juin 2026, le vendeur doit proposer une fonction de rétractation en ligne. Elle vient de la directive (UE) 2023/2673, transposée en France. Elle existe sur `/retractation/`, mais le libellé exact imposé reste à vérifier.

## Ce que fait le site

| Point | Comportement | Où le régler |
|---|---|---|
| Case « accès immédiat + perte du droit » | Facultative, **jamais précochée** (test automatique). Si elle est cochée, l'accès s'ouvre dès le paiement confirmé. | `serveur/validation.js` |
| Sans cette case | Accès **différé de 14 jours** : comportement actuel, conservé en attendant ta décision. Autre option prête : `"immediate"`, où l'accès est immédiat et le client garde son droit. | `conditions.json > ouvertureSansRenonciation` |
| Case « début de l'accompagnement » | Séparée, facultative, seulement pour la formule Accompagné. | `commande.astro` |
| Preuve des choix | Pour chaque commande, le serveur conserve le texte exact de chaque case, la réponse (oui ou non), la version des textes, la version des conditions et la date. | magasin `commandes` |
| Information avant paiement | Bloc « Avant de payer » : ouverture, durée, vendeur, paiement unique. | `/commande/` |
| Confirmation | Envoyée par e-mail après paiement : accords, version, date d'ouverture, durée, vendeur. Si Brevo n'est pas connecté, l'espace client dit qu'aucun e-mail n'est parti. | `serveur/emails.js` |

## Sources consultées (secondaires, à vérifier)

- [LegalPlace : renoncement exprès au droit de rétractation](https://www.legalplace.fr/guides/renoncement-expres-droit-retractation)
- [donneespersonnelles.fr : contenu numérique et accès immédiat](https://donneespersonnelles.fr/contenu-numerique-acces-immediat)
- [Village de la Justice : tout savoir sur le droit de rétractation](https://www.village-justice.com/articles/commerce-tout-savoir-sur-droit-retractation,48261.html)
- [UFC-Que Choisir (fiche DGCCRF, novembre 2023) : délais de réflexion ou de rétractation](https://artois.ufcquechoisir.fr/wp-content/uploads/sites/115/2025/01/DGCCRF-121-les-délais-de-réflexion-ou-de-rétractation-Novembre-2023.pdf)
- [Légifrance : Code de la consommation](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044133347) (lien trouvé, page non consultable depuis l'environnement)
