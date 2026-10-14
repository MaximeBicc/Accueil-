# Propositions et validation des acronymes

Le glossaire distingue les lecteurs connectés et les membres du groupe de validation. Un lecteur peut proposer un terme et suivre ses propositions. Les membres du groupe conservent l'ajout direct, la modification, la suppression et l'import Excel. Leur bouton **Propositions** porte un badge en haut à droite indiquant le nombre de demandes en attente.

Dans la liste d'attente, un validateur peut corriger l'acronyme, le libellé et la définition puis valider, ou refuser en indiquant un motif obligatoire. Seule une validation crée une fiche visible dans le tableau public. Le statut et le motif du refus restent consultables par le proposant dans **Mes propositions**.

## Installation dans XWiki

La fonctionnalité utilise les API de groupes XWiki 10.8 ou ultérieur. Les fichiers du dépôt sont à installer ensemble ; leur présence sur GitHub ne modifie pas l'instance XWiki.

1. Mettre à jour les deux pages et les trois extensions existantes décrites dans [GLOSSAIRE_PAGE.md](GLOSSAIRE_PAGE.md).
2. Créer une **JavaScript Extension** sur `TestPage.PAGE.Glossaire.CODE.GlossaireWorkflow.WebHome`, avec le contenu de `xwiki/TestPage/PAGE/Glossaire/CODE/GlossaireWorkflow.js`. Elle est appelée explicitement par la page du glossaire.
3. Copier `xwiki/TestPage/PAGE/Glossaire/CODE/GlossaireWorkflow.xwiki` dans `TestPage.PAGE.Glossaire.CODE.GlossaireWorkflow.WebHome`, en syntaxe XWiki 2.1. Il s'agit de la même page que l'extension de l'étape précédente : son contenu sert de point d'entrée aux propositions et décisions, et son objet JavaScript Extension contient le script client.
4. Créer les deux classes décrites ci-dessous, puis la configuration du groupe.
5. Créer la page conteneur `TestPage.PAGE.Glossaire.PROPOSITIONS.WebHome`. Appliquer les droits ci-dessous et enregistrer les pages de script avec un compte de confiance disposant des droits d'écriture sur l'espace des propositions. Recharger le navigateur sans cache.

Les noms de classes sont sensibles à la casse : `glossaireConfigurationClass` et `glossairePropositionClass` commencent par une minuscule, comme la classe existante `glossaireClass`.

## Choisir le groupe

Créer la classe `TestPage.PAGE.Glossaire.CODE.glossaireConfigurationClass.WebHome`, avec un champ :

| Propriété | Type | Réglage |
| --- | --- | --- |
| `reviewGroup` | String | Taille 255 ; référence exacte du groupe XWiki |

Créer `TestPage.PAGE.Glossaire.CODE.Configuration.WebHome`, y ajouter un objet de cette classe et renseigner `reviewGroup`, par exemple `XWiki.GlossaireValidateurs`. Une référence qualifiée telle que `monwiki:XWiki.Validateurs` est aussi possible. Les membres des sous-groupes sont pris en compte.

Sans configuration, le groupe par défaut est **`XWiki.GlossaireValidateurs`**. Créer ce groupe ou renseigner le groupe existant dans la configuration, puis y ajouter les validateurs. Les droits de modération reposent sur l'appartenance au groupe ; le rôle d'administrateur ne la remplace pas automatiquement.

## Classe des propositions

Créer `TestPage.PAGE.Glossaire.CODE.glossairePropositionClass.WebHome` avec ces propriétés :

| Propriété | Type | Usage |
| --- | --- | --- |
| `acronyme` | String, taille 255 | Acronyme proposé |
| `libelle` | String, taille 255 | Libellé complet |
| `definition` | TextArea | Définition |
| `author` | TextArea | Référence absolue du proposant, enregistrée par le serveur |
| `submittedAt` | Date | Date de proposition |
| `status` | Static List | Valeurs `pending`, `approved`, `rejected` ; sélection unique |
| `reviewComment` | TextArea | Commentaire de validation ou motif du refus |
| `reviewer` | TextArea | Référence absolue du validateur |
| `reviewedAt` | Date | Date de décision |
| `publishedRef` | TextArea | Référence de la fiche publiée |

Les propositions sont stockées dans des documents distincts de `TestPage.PAGE.Glossaire.PROPOSITIONS`. Les fiches validées portent toujours la classe existante `TestPage.PAGE.Glossaire.CODE.glossaireClass.WebHome` dans DATA. Le stockage séparé empêche une proposition en attente d'apparaître dans le glossaire.

## Droits à appliquer

Les contrôles des boutons et des requêtes serveur complètent les droits natifs XWiki. Configurer ces droits avant d'ouvrir la fonctionnalité :

| Zone | Lecteurs connectés | Groupe de validation | Compte de confiance qui enregistre les scripts |
| --- | --- | --- | --- |
| Page du glossaire | View | View | Edit, Script |
| CODE, classes et configuration | View ; aucun Edit/Delete/Admin | View | Edit, Script |
| DATA, fiches publiées | View ; aucun Edit/Delete/Admin | View, Edit, Delete | Droits de maintenance habituels |
| PROPOSITIONS | Aucun Edit/Delete/Admin ; pas de View direct nécessaire | View | View, Edit |

Protéger aussi `TestPage.PAGE.Glossaire.DATA.WebHome`, qui contient le point d'entrée historique : les lecteurs et validateurs n'ont pas à modifier ce script. Adapter les droits hérités pour réserver l'écriture et la suppression des fiches DATA au groupe de validation. Un groupe de validation doit disposer des droits d'ajout de nouvelles fiches sous DATA.

Utiliser les listes d'autorisation pour restreindre l'accès. Éviter un refus explicite global à `XWikiAllGroup`, car les validateurs appartiennent aussi à ce groupe. Les droits d'administration de l'instance restent sous le contrôle des administrateurs du wiki.

Les écritures de propositions utilisent `getDocumentAsAuthor` et `saveAsAuthor`, avec les droits de l'auteur effectif du script. Cela permet aux lecteurs de proposer sans leur accorder le droit de modifier directement la file d'attente. L'auteur effectif doit avoir **View + Edit** sur PROPOSITIONS ; la page du glossaire doit être enregistrée par un auteur ayant **View** sur ces documents pour afficher la liste filtrée. Aucun droit Programming n'est nécessaire pour ces API.

L'identité du proposant vient du compte connecté, et les décisions restent enregistrées dans les champs d'audit. Les textes saisis sont échappés avant affichage. Un visiteur anonyme peut consulter le glossaire mais ne peut pas proposer.

## Vérification du parcours

1. Avec un utilisateur connecté hors du groupe, vérifier l'absence de la colonne Actions et des boutons d'import/suppression. Envoyer une proposition : elle apparaît dans **Mes propositions**, sans créer de fiche DATA.
2. Avec un membre du groupe, vérifier le badge puis ouvrir la liste. Modifier les champs et valider : la fiche apparaît dans le tableau, la demande sort de la liste et le compteur diminue.
3. Envoyer une autre proposition. Un refus sans motif doit être bloqué ; un refus motivé doit être visible par son auteur et ne créer aucune fiche DATA.
4. Recharger les deux sessions et vérifier la persistance des états. Un autre lecteur ne doit pas voir les propositions de cet auteur.
5. Vérifier qu'une requête directe de modification, suppression, import ou validation est refusée pour un utilisateur hors du groupe. Vérifier aussi POST, CSRF et les droits natifs DATA/PROPOSITIONS.
6. Tester une décision à partir d'une ancienne version de la proposition : elle doit être refusée et inviter au rechargement. La référence publiée est déterministe par proposition pour éviter les doublons lors des nouvelles tentatives.

La validation automatisée exécute les vrais templates avec une API XWiki simulée, puis les extensions dans Chromium. Un essai après installation sur l'instance XWiki reste nécessaire pour ses droits, groupes et versions d'extensions.


## Résultats des tests

```sh
java -cp '/chemin/vers/jars/*' tests/GlossaireVelocityTest.java /tmp/glossaire-rendered.html
node tests/Glossaire.browser.test.js /tmp/glossaire-rendered.html
node tests/GlossaireWorkflow.browser.test.js /tmp
node tests/Accueil-Tracking.test.js
```

Résultat : **74 vérifications Velocity**, **17 vérifications navigateur du glossaire**, **28 vérifications navigateur du circuit de validation**, et le test d'accueil passent. Les **17 fichiers JavaScript** de `xwiki/` et `preview/` passent la vérification de syntaxe.

Les tests comprennent les trois profils, les requêtes de gestion forgées, les droits natifs, le CSRF, l'absence de publication avant validation, les corrections, les refus motivés, le compteur, les décisions périmées et la reprise après un échec partiel. Les captures sont enregistrées à côté des fixtures HTML.

Les vérifications de version rejettent les décisions prises depuis une ancienne liste. Elles ne constituent pas un verrou transactionnel entre deux décisions exactement simultanées ; la destination unique évite la création de plusieurs fiches pour la même proposition.
