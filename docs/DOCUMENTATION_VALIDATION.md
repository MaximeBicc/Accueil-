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
3. Installer la classe des propositions avec le [paquet XWiki fourni](../xwiki/TestPage/PAGE/doc-test/INSTALL/README.md), puis créer les classes de configuration et de contenu ci-dessous et les conteneurs `TestPage.PAGE.doc-test.PROPOSITIONS.WebHome` et `TestPage.PAGE.doc-test.CORBEILLE.WebHome`. La création manuelle des 22 propriétés des propositions reste possible avec le tableau ci-dessous.
4. Protéger les espaces privés et les pages techniques avec les droits indiqués plus bas. Enregistrer les pages de traitement et d'affichage avec un **administrateur du wiki disposant du droit Script** et des droits natifs nécessaires sur leurs données. Ce compte doit pouvoir modifier les autorisations des propositions. **Programming n'est pas nécessaire.**
5. Avec un administrateur du wiki, ouvrir **Paramètres**, attribuer les opérations aux groupes voulus, puis enregistrer. Recharger sans cache avec **Ctrl + F5**.

Au premier accès, les actions documentaires sont bloquées tant qu'aucun droit n'a été attribué. L'administrateur peut ouvrir **Paramètres** et enregistrer les autorisations. Pour autoriser son propre groupe, par exemple `XWiki.IVQ_Gestionnaires`, il doit aussi cocher explicitement les opérations voulues pour ce groupe.

Pour mettre à jour une installation existante, remplacer ensemble les sources complètes de **`TestPage.PAGE.doc-test.WebHome`** et **`TestPage.PAGE.doc-test.COMMANDE`**, les extensions JavaScript **`CODE.Propositions`**, **`CODE.LienPerso`**, **`CODE.Popup`** et **`CODE.SidebarPreview`**, ainsi que l'extension CSS **`CODE.Propositions`**, puis recharger avec **Ctrl + F5**. Le calcul des droits s'exécute directement dans les deux pages, comme dans le glossaire, pour éviter le faux refus de connexion lorsque la page auxiliaire n'est pas chargée. L'ancienne page `CODE.Permissions` n'est plus utilisée. Les blocs de calcul des autorisations doivent rester identiques dans les deux sources ; les tests du dépôt vérifient cette correspondance.

Cette version remplace la première implémentation de la PR. Les pages `CODE.WorkflowAPI`, les extensions `CODE.Workflow` et le stockage `TestPage.DocumentationWorkflow` de cette première version ne sont plus utilisés. Si cette version avait été installée sur l'instance, sauvegarder ses éventuelles données avant de retirer ces anciennes pages. Il n'y a pas de migration automatique de ce stockage abandonné.

## Autorisations par groupe

**Paramètres** est visible seulement par les administrateurs du wiki ; le serveur vérifie aussi ce droit à l'enregistrement. La vérification utilise les droits natifs XWiki, y compris ceux hérités d'un groupe comme `IVQ_Gestionnaires`. Les opérations sont indépendantes et les appartenances aux groupes sont vérifiées côté serveur, avec les sous-groupes et les groupes qualifiés d'un autre wiki.

| Autorisation | Opération directe permise |
| --- | --- |
| Créer | Créer un dossier ou un document |
| Déplacer | Déplacer un document ou un dossier |
| Modifier | Modifier les informations d'un document |
| Importer | Proposer des fichiers et arborescences, ou les importer directement avec Créer |
| Modifier le contenu | Modifier le texte documentaire |
| Proposer | Soumettre une opération à validation |
| Valider | Examiner toutes les propositions, accepter, refuser et restaurer depuis la corbeille |
| Supprimer | Supprimer un élément publié |

Le traitement est automatique pour chaque opération :

- La création de dossiers ou documents vides est directe avec **Créer**, ou soumise à validation avec **Proposer** sans Créer.
- Les imports exigent **Importer**. Avec **Créer**, ils sont directs ; sans Créer, ils sont proposés, même si le droit Proposer n'est pas coché.
- Les déplacements, les informations et le contenu sont modifiés directement avec leur droit propre ; sans ce droit, **Proposer** permet de soumettre une modification à validation.
- Sans la combinaison requise, l'action est bloquée. La suppression exige toujours **Supprimer** et les droits natifs nécessaires ; elle ne peut pas être proposée.

| Importer | Créer | Proposer | Résultat pour un import |
| --- | --- | --- | --- |
| Oui | Oui | Oui ou non | Import direct |
| Oui | Non | Oui | Proposition d'import, en attente de validation |
| Oui | Non | Non | Proposition d'import, en attente de validation |
| Non | Oui ou non | Oui ou non | Import bloqué |

Le choix « Contribution : Directe / Proposition » est supprimé. Les fenêtres et leurs boutons indiquent **Créer**, **Importer**, **Enregistrer** ou **Proposer** selon l'opération autorisée. **Importer sans Créer**, avec ou sans Proposer, affiche des boutons de proposition : aucun élément importé n'est publié avant acceptation par un validateur. Un lot conserve ce même traitement pour tous ses dossiers et fichiers. Les validateurs peuvent accepter un import avec le droit **Valider**, sans avoir besoin eux-mêmes de Créer ou Importer. Le serveur refait ces vérifications à chaque requête.

Après l'enregistrement des paramètres, les boutons d'ajout apparaissent immédiatement avec Créer, Proposer ou Importer, même si aucun de ces droits n'existait à l'ouverture de la page. Les sélecteurs de fichiers exigent Importer. Avec Importer seul, les fenêtres permettent de proposer des fichiers ou une arborescence, sans proposer de page vide. Le retrait des droits actualise aussi les contrôles sans recharger la page.

Les refus s'affichent sous forme de messages courts, sans réponse HTML ni trace technique. Un refus de création laisse le formulaire ouvert ; un refus de suppression conserve les éléments et la sélection. L'interface confirme un succès seulement lorsque le traitement renvoie son résultat explicite.

Sans configuration enregistrée ou avec des listes vides, aucune action documentaire n'est autorisée. Cela s'applique aussi aux administrateurs du wiki et aux comptes qui possèdent déjà les droits natifs d'édition ou de suppression. Le statut administrateur donne accès à **Paramètres** ; les droits Créer, Importer, Déplacer, Modifier, Proposer, Valider et Supprimer proviennent uniquement des groupes explicitement autorisés. Une configuration absente, inaccessible, sans objet, sans version ou de version inconnue n'active aucun droit d'action. La lecture reste soumise aux droits natifs de consultation.

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

Le traitement vérifie les 22 propriétés de `docPropositionClass`, y compris les propriétés initialement vides comme `reviewedAt` et `deletedAt`. Elles doivent être activées et avoir exactement les types du tableau. Les dates sont contrôlées par leur instant, sans comparer leur représentation textuelle.

Si toutes les propositions sont refusées avec « Configuration des propositions : champ … », utiliser le [paquet de classe complet](../xwiki/TestPage/PAGE/doc-test/INSTALL/README.md) pour installer les 22 propriétés à la référence attendue. Exporter d'abord la page de classe existante : l'import la remplace et ne fusionne pas ses propriétés ou objets locaux. Le paquet ne contient aucune page de proposition.

Pour une correction manuelle, ouvrir **Classes** sur `TestPage.PAGE.doc-test.CODE.docPropositionClass.WebHome` et corriger la propriété nommée : l'ajouter si elle manque, l'activer si elle est désactivée ou lui donner le type indiqué. Vérifier la référence exacte, avec `.WebHome` ; la page terminale sans ce suffixe est une autre page. Le titre saisi dans le formulaire ou le titre de la page ne remplace pas la propriété technique `title` de type **String**. `submittedAt`, `reviewedAt` et `deletedAt` sont de type **Date**. Le traitement ne sauvegarde pas de proposition si sa structure est incorrecte.

## Examiner les propositions

**Propositions** ouvre l'arborescence existante avec les ajouts proposés surlignés et identifiés par leur opération. **Architecture** permet toujours de consulter l'arbre documentaire. Un import affiche un regroupement et ses dossiers ou documents ; ce regroupement ne publie pas tous les éléments en une seule décision.

Chaque proposition donne accès à ses détails et à un aperçu, avec ouverture dans un nouvel onglet avant publication. Le proposant retrouve ses demandes ; un validateur peut examiner toutes les demandes. Un dossier proposé doit être accepté avant la publication de ses enfants. Une modification ou un déplacement est refusé si la version du document source a changé depuis la proposition.

Refuser un dossier laisse ses enfants en attente : ils restent visibles, mais leur validation est bloquée tant que le dossier n'a pas été restauré puis accepté. Ils ne sont pas publiés automatiquement à un autre emplacement.

**Refuser** demande un motif et place l'élément dans `CORBEILLE`. Un validateur peut le restaurer pendant sept jours. Son auteur peut aussi restaurer sa propre proposition avec le droit Proposer, ou sa proposition d'import avec le droit Importer seul : elle revient en attente dans `PROPOSITIONS` et doit être validée pour être publiée. Les éléments expirés ne sont plus restaurables. Le nettoyage est demandé lors d'une visite de la documentation ; leur suppression effective a lieu à une visite suivante, sans tâche planifiée. La corbeille native XWiki peut ensuite conserver les pages supprimées selon la politique de l'instance.

## Contenu et protection des espaces

Le texte proposé reste une donnée dans un objet. Une page publiée contient une inclusion fixe de `CODE.DocumentContent` ; le rendu de sa source utilise l'API XWiki `getRenderedContentRestricted`, qui désactive les macros de script. Cela conserve la mise en forme documentaire sans exécuter du code fourni par un contributeur avec les droits de l'auteur du traitement.

À la première modification des informations d'un ancien document, son corps Wiki est conservé dans `docContentClass.source` et remplacé par cette inclusion. La modification du contenu adopte également ce stockage. Les macros de script de ces anciennes pages sont donc désactivées après cette conversion ; vérifier les éventuels documents qui en dépendaient avant de les modifier avec le module. Les pages techniques de proposition ou de configuration dont le corps a été personnalisé sont refusées par les traitements.

L'import Word utilise le service **Office Importer** de l'instance pour convertir le fichier en texte XWiki éditable, avec ses images jointes. Le service Office doit être configuré. Les PDF utilisent la macro **pdf** déjà employée par l'explorateur ; cette extension doit être installée. Les fichiers originaux restent joints aux pages concernées.

Réserver **Edit, Delete, Script et Admin** sur les pages d'affichage et de traitement, `CODE`, les classes, extensions et configuration aux comptes de confiance. Réserver aussi **View** sur les conteneurs `PROPOSITIONS` et `CORBEILLE` et leurs préférences aux comptes de confiance. Le serveur attribue à chaque fiche privée un accès natif de lecture à son proposant et aux groupes de validation, pour permettre les aperçus et l'ouverture des fichiers. La modification et la suppression de ces fiches restent réservées au compte de maintenance. La liste affichée dans l'explorateur est filtrée selon les droits et le proposant.

L'enregistrement des paramètres met à jour les accès des propositions existantes. Si une erreur interrompt cette mise à jour, les changements déjà effectués ne sont pas annulés automatiquement : corriger la cause avec un administrateur puis enregistrer à nouveau.

L'auteur des traitements doit pouvoir lire et modifier la configuration, lire/créer/modifier/supprimer les documents publiés et les propositions, ainsi que leurs pièces jointes. L'auteur de l'affichage doit pouvoir lire les propositions privées. Ne pas accorder aux contributeurs la modification des scripts pour débloquer une opération.

## Vérification sur l'instance

1. Avant toute attribution, vérifier qu'un administrateur voit **Paramètres** mais ne peut ni créer, importer, déplacer, modifier, proposer, valider ou supprimer. Enregistrer des listes vides et refaire ce contrôle. Attribuer Créer ou Proposer : les boutons d'ajout doivent apparaître sans recharger la page. Tester Importer avec chacun de ces droits, puis Importer seul : seul Créer doit permettre l'import direct ; les autres imports attendent une validation. Retirer les droits doit de nouveau masquer les boutons.
2. Vérifier les boutons avec un créateur sans droit Proposer, un proposant sans droit Créer, un validateur et un compte sans autorisation. Contrôler que le créateur publie directement et que le proposant attend une validation, sans sélecteur de mode. Enregistrer les paramètres, recharger, puis contrôler les appartenances à plusieurs groupes et aux sous-groupes.
3. Proposer un document et un dossier : aucun élément publié avant validation, surlignage au bon endroit dans l'arbre existant.
4. Importer plusieurs dossiers et fichiers. Accepter le parent puis un enfant ; refuser un autre enfant avec un motif. Vérifier l'aperçu et l'ouverture avant publication.
5. Vérifier la corbeille, sa restauration en attente et la disparition des refus de plus de sept jours après une visite.
6. Modifier le document source après avoir proposé une modification ou un déplacement : la validation doit signaler le conflit.
7. Vérifier avec un tiers qu'une URL native de proposition ou de pièce jointe privée ne donne pas accès au contenu. Tester la création, le déplacement, les métadonnées, le contenu et la suppression des documents déjà publiés.
8. Retirer le droit Supprimer et essayer depuis l'explorateur et Architecture, sur un document puis un dossier avec enfants. Aucun élément ne doit disparaître. Retirer un droit après l'ouverture de la page pour contrôler aussi le refus du serveur et son message propre. Refaire un ajout interdit : le formulaire doit conserver sa saisie et afficher un message court.

## Tests du dépôt

- `node tests/DocumentationPropositions.browser.test.js` : 31 parcours Chromium avec les véritables extensions et une page COMMANDE simulée ; couvre notamment les fichiers et arborescences proposés avec Importer seul, les imports directs avec Créer, les droits actualisés et la restauration réservée aux auteurs autorisés. Nécessite Playwright et Chromium (`CHROMIUM_EXECUTABLE_PATH` facultatif).
- `java -cp '/chemin/jars/*' tests/DocumentationVelocityTest.java` : 116 scénarios exécutant les sources Velocity avec des API XWiki simulées, dont les 22 propriétés XClass, les dates normalisées, les combinaisons de droits d'import et la restauration par un importateur seul. JAR : Velocity 2.3, commons-lang3 et slf4j-api. L'option `-Ddocumentation.nativeProperties=true` ajoute un contrôle avec la véritable classe `DateProperty` de XWiki 16.10.17, soit 117 scénarios ; ajouter le JAR oldcore et ses dépendances au classpath.
- `java -cp '/chemin/jars/*' tests/DocumentationXWikiParsingTest.java` : vérification des trois pages avec les parseurs XWiki 2.1 et Velocity ; ajouter xwiki-rendering-wikimodel 16.10.17 aux JAR précédents.
- `python3 tests/DocumentationClassPackage.test.py` : 7 contrôles du paquet distribué, de sa référence unique et des 22 propriétés, avec contrôles négatifs sur `title` absent ou mal typé.
- `java -cp '/chemin/jars/*' tests/DocumentationXWikiClassTest.java` : 8 groupes de contrôles avec les véritables sérialiseurs, lecteurs XAR et classes XWiki 16.10.17, puis le contrôle de COMMANDE exécuté avec le moteur Velocity sécurisé. Nécessite oldcore, les modules filter-instance-document et filter-stream-xar, xwiki-commons-velocity et leurs dépendances. L'option `--generate` régénère le XML de la classe ; reconstruire ensuite le XAR avec le script Python du dossier `INSTALL`.

La recette sur l'instance reste nécessaire pour les ACL natives, les pièces jointes, le refactoring XWiki et l'importeur Office.
