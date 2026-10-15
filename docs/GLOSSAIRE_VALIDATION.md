# Propositions et validation des acronymes

Le glossaire distingue les lecteurs connectés et les membres du groupe de validation. Un lecteur peut proposer un terme et suivre ses propositions. Les membres du groupe conservent l'ajout direct, la modification, la suppression et l'import Excel. Leur bouton **Propositions** porte un badge en haut à droite indiquant le nombre de demandes en attente.

Dans la liste d'attente, un validateur peut corriger l'acronyme, le libellé et la définition puis valider, ou refuser en indiquant un motif obligatoire. Seule une validation crée une fiche visible dans le tableau public. Le statut et le motif du refus restent consultables par le proposant dans **Mes propositions**.

## Installation dans XWiki

La fonctionnalité utilise les API de groupes XWiki 10.8 ou ultérieur. Les fichiers du dépôt sont à installer ensemble ; leur présence sur GitHub ne modifie pas l'instance XWiki.

1. Mettre à jour les deux pages et les trois extensions décrites dans [GLOSSAIRE_PAGE.md](GLOSSAIRE_PAGE.md).
2. Copier **tout le contenu** de `xwiki/TestPage/PAGE/Glossaire/DATA/WebHome.xwiki` dans **`TestPage.PAGE.Glossaire.DATA.WebHome`**, en syntaxe XWiki 2.1. DATA reçoit tous les ajouts, modifications, suppressions, imports, propositions et décisions.
3. Copier les JavaScript dans les deux extensions existantes `GlossaireExtension` et `GlossairePageExtension`. Les formulaires et la modération sont inclus dans ces extensions.
4. Créer les deux classes décrites ci-dessous, puis la configuration du groupe.
5. Créer la page conteneur `TestPage.PAGE.Glossaire.PROPOSITIONS.WebHome`. Appliquer les droits ci-dessous et enregistrer DATA avec un compte de confiance disposant des droits d'écriture sur l'espace des propositions. Recharger le navigateur sans cache.

L'organisation est la suivante :

| Page / espace | Rôle |
| --- | --- |
| `TestPage.PAGE.Glossaire.WebHome` | Affichage du tableau et des formulaires, sans écriture de données |
| `TestPage.PAGE.Glossaire.DATA.WebHome` | Traitements côté serveur, contrôles des droits et réponses aux formulaires |
| Fiches sous `TestPage.PAGE.Glossaire.DATA` | Stockage des acronymes publiés |
| `TestPage.PAGE.Glossaire.PROPOSITIONS.WebHome` et ses fiches | Stockage des propositions et de leur historique |

Si une ancienne version avec une page COMMANDE ou `CODE.GlossaireWorkflow.WebHome` a déjà été installée, remplacer ensemble la page d'affichage, DATA et les deux extensions JavaScript par les fichiers actuels. Après vérification, supprimer ces anciennes pages devenues inutiles. Le glossaire utilise uniquement DATA pour ses requêtes ; le JavaScript de la modération reste intégré à `GlossairePageExtension`.

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
| DATA.WebHome, page de traitement | View ; aucun Edit/Delete/Admin | View ; aucun Edit/Delete/Admin | View, Edit, Script |
| Fiches publiées sous DATA | View ; aucun Edit/Delete/Admin | View, Edit, Delete | Droits de maintenance habituels |
| PROPOSITIONS | Aucun Edit/Delete/Admin ; pas de View direct nécessaire | View | View, Edit |

Protéger **la page `TestPage.PAGE.Glossaire.DATA.WebHome` elle-même** contre les modifications par les lecteurs et les validateurs : elle contient les traitements exécutés avec l'auteur de confiance. Accorder au groupe de validation les droits Edit/Delete sur les **fiches enfants de DATA**, avec création de nouvelles fiches, sans lui accorder l'édition de la page de traitement. Utiliser les réglages XWiki des droits de la page et de ses enfants pour distinguer ces périmètres.

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
java -cp '/chemin/vers/jars/*' tests/GlossaireXWikiParsingTest.java
node tests/Glossaire.browser.test.js /tmp/glossaire-rendered.html
node tests/GlossaireWorkflow.browser.test.js /tmp
node tests/Accueil-Tracking.test.js
```

Résultat : **99 vérifications Velocity**, **20 vérifications navigateur du glossaire**, **42 vérifications navigateur du circuit de validation**, et le test d'accueil passent. **13 contrôles du vrai parseur XWiki 16.10.17 puis de Velocity passent aussi**, avec détection d'un `#end` ou d'une fermeture de macro manquants. Les vérifications Java ont été exécutées avec les moteurs Velocity 1.7 et 2.3 ; ne mettre qu'un seul moteur à la fois dans le classpath. Le test de parsing exige le JAR `org.xwiki.rendering:xwiki-rendering-wikimodel:16.10.17` en plus des dépendances Velocity. Les **16 fichiers JavaScript** de `xwiki/` et `preview/` passent la vérification de syntaxe.

Les tests comprennent les trois profils, les requêtes de gestion forgées, les droits natifs, le CSRF, l'absence de publication avant validation, les corrections, les refus motivés, le compteur, les décisions périmées et la reprise après un échec partiel. Les captures sont enregistrées à côté des fixtures HTML.

Les vérifications de version rejettent les décisions prises depuis une ancienne liste. Elles ne constituent pas un verrou transactionnel entre deux décisions exactement simultanées ; la destination unique évite la création de plusieurs fiches pour la même proposition.


## Erreur « encountered EOF »

Une erreur EOF signale que le parseur a atteint la fin du texte alors qu'il attendait une fermeture. Remplacer le contenu **entier** des pages, via l'éditeur Wiki/source en syntaxe XWiki 2.1. Ne pas coller les scripts dans l'éditeur visuel ni conserver un fragment de l'ancien contenu autour du nouveau.

La page d'affichage commence par `{{velocity}}` puis `{{html clean="false"}}` et se termine par `{{/html}}` puis `{{/velocity}}`. DATA commence par `{{velocity output="false"}}` et se termine par `{{/velocity}}`. Conserver les directives `#end` et ces fermetures.

Les conditions Velocity de la page d'affichage sont placées sur des lignes séparées des attributs et des libellés HTML. Les tests traitent le contenu complet du bloc Velocity, y compris le bloc HTML interne. L'erreur signalée n'a pas été reproduite avec le fichier complet du dépôt ; son message complet et sa ligne/colonne permettent de diagnostiquer un contenu différent installé sur le wiki.
