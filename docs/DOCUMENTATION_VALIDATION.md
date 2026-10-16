# Documentation : paramètres, propositions et corbeille

La documentation conserve son explorateur et son arborescence. Le bouton **Propositions** affiche les éléments proposés à leur emplacement dans l'arbre existant. Les imports restent regroupés ; chaque dossier ou document peut être validé ou refusé séparément. **Corbeille** affiche les propositions refusées, conservées pendant sept jours.

## Organisation XWiki

Les traitements restent dans `TestPage.PAGE.doc-test.COMMANDE`. Les données suivent l'organisation du glossaire :

| Page ou espace | Rôle |
| --- | --- |
| `TestPage.PAGE.doc-test.WebHome` | Explorateur et boutons |
| `TestPage.PAGE.doc-test.COMMANDE` | Traitements et réponses de l'explorateur, en Velocity |
| `TestPage.PAGE.doc-test.CODE.DocumentContent` | Affichage contrôlé du contenu documentaire |
| `TestPage.PAGE.doc-test.CODE.Configuration.WebHome` | Objet de configuration créé lors du premier enregistrement |
| `TestPage.PAGE.doc-test.PROPOSITIONS` | Une page par élément proposé, avec son objet et ses pièces jointes |
| `TestPage.PAGE.doc-test.CORBEILLE` | Propositions refusées avec leur motif et leur date de refus |

Les pages proposées ne sont pas publiées dans l'arborescence documentaire avant validation. Leur objet mémorise la destination, le document source d'une modification ou d'un déplacement, et les liens entre les éléments d'un import.

## Installation

Les changements GitHub doivent être copiés dans XWiki pour mettre l'instance à jour.

1. Sauvegarder les pages actuelles. Installer les sources complètes de `WebHome.xwiki`, `COMMANDE.xwiki` et `CODE/DocumentContent.xwiki` en syntaxe **XWiki 2.1**, aux destinations du tableau ci-dessus.
2. Installer `CODE/Propositions.js` et `CODE/Propositions.css` dans les objets JavaScript Extension et StyleSheet Extension de `TestPage.PAGE.doc-test.CODE.Propositions`. Mettre à jour ensemble les extensions JavaScript `CODE.LienPerso`, `CODE.Popup`, `CODE.Post` et `CODE.SidebarPreview`, ainsi que les extensions CSS `CODE.FileExplorer`, `CODE.Popup`, `CODE.SidebarPreview` et `CODE.Breadcrumb`, depuis les fichiers correspondants. Les sources vont dans les objets d'extension, sans balise `<script>` ou `<style>` ajoutée ; configurer les extensions à la demande et sans analyse Velocity (`parse=false`).
3. Créer les classes ci-dessous et les conteneurs `TestPage.PAGE.doc-test.PROPOSITIONS.WebHome` et `TestPage.PAGE.doc-test.CORBEILLE.WebHome`.
4. Protéger les espaces privés et les pages techniques avec les droits indiqués plus bas. Enregistrer les pages de traitement et d'affichage avec un **administrateur du wiki disposant du droit Script** et des droits natifs nécessaires sur leurs données. Ce compte doit pouvoir modifier les autorisations des propositions. **Programming n'est pas nécessaire.**
5. Avec un administrateur du wiki, ouvrir **Paramètres**, attribuer les opérations aux groupes voulus, puis enregistrer. Recharger sans cache avec **Ctrl + F5**.

Si le module est déjà installé et affiche « Vous devez être connecté avec un compte autorisé » pour un administrateur, remplacer les sources complètes de **`TestPage.PAGE.doc-test.WebHome`** et **`TestPage.PAGE.doc-test.COMMANDE`**, puis recharger avec **Ctrl + F5**. Le calcul des droits s'exécute maintenant directement dans ces deux pages, comme dans le glossaire. L'ancienne page `CODE.Permissions` n'est plus utilisée. Les blocs de calcul des autorisations doivent rester identiques dans les deux sources ; les tests du dépôt vérifient cette correspondance.

Cette version remplace la première implémentation de la PR. Les pages `CODE.WorkflowAPI`, les extensions `CODE.Workflow` et le stockage `TestPage.DocumentationWorkflow` de cette première version ne sont plus utilisés. Si cette version avait été installée sur l'instance, sauvegarder ses éventuelles données avant de retirer ces anciennes pages. Il n'y a pas de migration automatique de ce stockage abandonné.

## Autorisations par groupe

**Paramètres** est visible seulement par les administrateurs du wiki ; le serveur vérifie aussi ce droit à l'enregistrement. La vérification utilise les droits natifs XWiki, y compris ceux hérités d'un groupe comme `IVQ_Gestionnaires`. Les opérations sont indépendantes et les appartenances aux groupes sont vérifiées côté serveur, avec les sous-groupes et les groupes qualifiés d'un autre wiki.

| Autorisation | Opération directe permise |
| --- | --- |
| Créer | Créer un dossier ou un document |
| Déplacer | Déplacer un document ou un dossier |
| Modifier | Modifier les informations d'un document |
| Importer | Importer des fichiers et une arborescence |
| Modifier le contenu | Modifier le texte documentaire |
| Proposer | Soumettre une opération à validation |
| Valider | Examiner toutes les propositions, accepter, refuser et restaurer depuis la corbeille |
| Supprimer | Supprimer un élément publié |

Sans configuration enregistrée, les comptes connectés peuvent proposer ; les opérations directes suivent les droits natifs d'édition et de suppression sur la racine. Les administrateurs conservent toutes les opérations. Après enregistrement, une liste vide ne donne aucun droit par cette opération. Une configuration inaccessible ou de version inconnue n'active pas les anciens droits par défaut.

Ces autorisations contrôlent les boutons et les traitements du module. Les ACL natives restent applicables pour la lecture et protègent aussi les accès par URL, les pièces jointes, REST et l'éditeur XWiki. Un utilisateur possédant déjà l'édition native peut utiliser l'éditeur indépendamment des boutons ; pour imposer la validation, limiter aussi ses droits natifs sur les documents publiés.

Les déplacements et suppressions utilisent le refactoring natif XWiki, qui conserve l'historique et met à jour les liens lors d'un déplacement. Ils nécessitent donc aussi le droit natif **Delete** sur la source et, pour déplacer, **Edit** sur la destination et les droits nécessaires sur les sous-pages. Cette condition s'applique également au validateur qui accepte un déplacement proposé. Les autres écritures du module utilisent l'auteur de confiance après vérification des droits applicatifs.

## Classes à créer

Conserver la classe documentaire existante `TestPage.PAGE.Doc.CODE.docClass.WebHome`, avec ses propriétés `nom`, `type`, `id`, `tag`, `description` et `createur`.

Créer `TestPage.PAGE.doc-test.CODE.docConfigurationClass.WebHome` :

| Propriété | Type |
| --- | --- |
| `schemaVersion` | String |
| `createGroups` | TextArea |
| `moveGroups` | TextArea |
| `modifyGroups` | TextArea |
| `importGroups` | TextArea |
| `contentGroups` | TextArea |
| `proposeGroups` | TextArea |
| `reviewGroups` | TextArea |
| `deleteGroups` | TextArea |

Les listes contiennent une référence de groupe par ligne. L'objet sur `CODE.Configuration.WebHome` est créé automatiquement ; ne pas le placer sur la page de définition de la classe. La version enregistrée vaut `1`.

Créer `TestPage.PAGE.doc-test.CODE.docPropositionClass.WebHome` :

| Propriété | Type | Usage |
| --- | --- | --- |
| `operation` | String | Opération proposée |
| `type` | String | `folder` ou `document` |
| `title` | String | Titre demandé |
| `parentRef` | String | Destination publiée |
| `parentProposalRef` | String | Dossier proposé dont dépend cet élément |
| `sourceRef` | String | Document concerné par une modification ou un déplacement |
| `baseVersion` | String | Version examinée du document source |
| `content` | TextArea | Source documentaire proposée |
| `description` | TextArea | Description |
| `tags` | TextArea | Mots-clés |
| `author` | String | Proposant, fixé par le serveur |
| `submittedAt` | Date | Date de proposition |
| `status` | String | État de la proposition |
| `reviewer` | String | Auteur de la décision |
| `reviewComment` | TextArea | Motif ou commentaire |
| `reviewedAt` | Date | Date de décision |
| `deletedAt` | Date | Début des sept jours de corbeille |
| `publishedRef` | String | Résultat publié |
| `batchId` | String | Identifiant commun aux éléments d'un import |
| `filename` | String | Nom de pièce jointe |
| `kind` | String | Nature du contenu importé |
| `sourceProposalId` | String | Identifiant initial conservé lors du passage en corbeille |

Créer `TestPage.PAGE.doc-test.CODE.docContentClass.WebHome`, avec `source` de type **TextArea**, configuré en texte brut, sans interprétation Wiki.

Les noms de classes et de propriétés sont sensibles à la casse. Installer les propriétés avant le premier essai.

## Examiner les propositions

**Propositions** ouvre l'arborescence existante avec les ajouts proposés surlignés et identifiés par leur opération. **Architecture** permet toujours de consulter l'arbre documentaire. Un import affiche un regroupement et ses dossiers ou documents ; ce regroupement ne publie pas tous les éléments en une seule décision.

Chaque proposition donne accès à ses détails et à un aperçu, avec ouverture dans un nouvel onglet avant publication. Le proposant retrouve ses demandes ; un validateur peut examiner toutes les demandes. Un dossier proposé doit être accepté avant la publication de ses enfants. Une modification ou un déplacement est refusé si la version du document source a changé depuis la proposition.

Refuser un dossier laisse ses enfants en attente : ils restent visibles, mais leur validation est bloquée tant que le dossier n'a pas été restauré puis accepté. Ils ne sont pas publiés automatiquement à un autre emplacement.

**Refuser** demande un motif et place l'élément dans `CORBEILLE`. Un validateur peut le restaurer pendant sept jours : il revient en attente dans `PROPOSITIONS` et doit être validé pour être publié. Les éléments expirés ne sont plus restaurables. Le nettoyage est demandé lors d'une visite de la documentation ; leur suppression effective a lieu à une visite suivante, sans tâche planifiée. La corbeille native XWiki peut ensuite conserver les pages supprimées selon la politique de l'instance.

## Contenu et protection des espaces

Le texte proposé reste une donnée dans un objet. Une page publiée contient une inclusion fixe de `CODE.DocumentContent` ; le rendu de sa source utilise l'API XWiki `getRenderedContentRestricted`, qui désactive les macros de script. Cela conserve la mise en forme documentaire sans exécuter du code fourni par un contributeur avec les droits de l'auteur du traitement.

À la première modification des informations d'un ancien document, son corps Wiki est conservé dans `docContentClass.source` et remplacé par cette inclusion. La modification du contenu adopte également ce stockage. Les macros de script de ces anciennes pages sont donc désactivées après cette conversion ; vérifier les éventuels documents qui en dépendaient avant de les modifier avec le module. Les pages techniques de proposition ou de configuration dont le corps a été personnalisé sont refusées par les traitements.

L'import Word utilise le service **Office Importer** de l'instance pour convertir le fichier en texte XWiki éditable, avec ses images jointes. Le service Office doit être configuré. Les PDF utilisent la macro **pdf** déjà employée par l'explorateur ; cette extension doit être installée. Les fichiers originaux restent joints aux pages concernées.

Réserver **Edit, Delete, Script et Admin** sur les pages d'affichage et de traitement, `CODE`, les classes, extensions et configuration aux comptes de confiance. Réserver aussi **View** sur les conteneurs `PROPOSITIONS` et `CORBEILLE` et leurs préférences aux comptes de confiance. Le serveur attribue à chaque fiche privée un accès natif de lecture à son proposant et aux groupes de validation, pour permettre les aperçus et l'ouverture des fichiers. La modification et la suppression de ces fiches restent réservées au compte de maintenance. La liste affichée dans l'explorateur est filtrée selon les droits et le proposant.

L'enregistrement des paramètres met à jour les accès des propositions existantes. Si une erreur interrompt cette mise à jour, les changements déjà effectués ne sont pas annulés automatiquement : corriger la cause avec un administrateur puis enregistrer à nouveau.

L'auteur des traitements doit pouvoir lire et modifier la configuration, lire/créer/modifier/supprimer les documents publiés et les propositions, ainsi que leurs pièces jointes. L'auteur de l'affichage doit pouvoir lire les propositions privées. Ne pas accorder aux contributeurs la modification des scripts pour débloquer une opération.

## Vérification sur l'instance

1. Vérifier les boutons avec un administrateur, un proposant, un validateur et un compte sans autorisation. Enregistrer les paramètres, recharger, puis contrôler les appartenances à plusieurs groupes et aux sous-groupes.
2. Proposer un document et un dossier : aucun élément publié avant validation, surlignage au bon endroit dans l'arbre existant.
3. Importer plusieurs dossiers et fichiers. Accepter le parent puis un enfant ; refuser un autre enfant avec un motif. Vérifier l'aperçu et l'ouverture avant publication.
4. Vérifier la corbeille, sa restauration en attente et la disparition des refus de plus de sept jours après une visite.
5. Modifier le document source après avoir proposé une modification ou un déplacement : la validation doit signaler le conflit.
6. Vérifier avec un tiers qu'une URL native de proposition ou de pièce jointe privée ne donne pas accès au contenu. Tester la création, le déplacement, les métadonnées, le contenu et la suppression des documents déjà publiés.

## Tests du dépôt

- `node tests/DocumentationPropositions.browser.test.js` : 13 parcours Chromium avec les véritables extensions et une page COMMANDE simulée ; nécessite Playwright et Chromium (`CHROMIUM_EXECUTABLE_PATH` facultatif).
- `java -cp '/chemin/jars/*' tests/DocumentationVelocityTest.java` : 28 scénarios exécutant les sources Velocity avec des API XWiki simulées, dont le démarrage complet de `WebHome` et `COMMANDE` sans préchargement des autorisations. JAR : Velocity 2.3, commons-lang3 et slf4j-api.
- `java -cp '/chemin/jars/*' tests/DocumentationXWikiParsingTest.java` : vérification des trois pages avec les parseurs XWiki 2.1 et Velocity ; ajouter xwiki-rendering-wikimodel 16.10.17 aux JAR précédents.

La recette sur l'instance reste nécessaire pour les ACL natives, les pièces jointes, le refactoring XWiki et l'importeur Office.
