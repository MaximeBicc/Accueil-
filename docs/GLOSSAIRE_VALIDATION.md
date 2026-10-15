# Rôles et propositions du glossaire

Le bouton **Paramètres**, réservé aux administrateurs du wiki, attribue un niveau aux groupes XWiki. Les niveaux sont cumulatifs ; une personne appartenant à plusieurs groupes bénéficie du niveau le plus élevé.

| Niveau | Voir | Proposer / importer des propositions | Ajouter / importer directement, modifier et supprimer les acronymes | Valider et gérer la corbeille |
| --- | --- | --- | --- | --- |
| Lecture | Oui | | | |
| Proposition | Oui | Oui | | |
| Ajout direct | Oui | Oui | Oui | |
| Validation | Oui | Oui | Oui | Oui |

Un import au niveau Proposition crée **une demande par ligne acceptée**, sans publication immédiate. À partir du niveau Ajout direct, chaque ligne acceptée devient une fiche publiée. Le serveur utilise les groupes actuels et ignore tout rôle transmis par le navigateur.

## Propositions et corbeille

- **Valider** permet de corriger les champs, publie l'acronyme dans DATA puis retire la proposition de PROPOSITIONS.
- **Refuser** exige un motif et déplace la proposition dans CORBEILLE.
- **Supprimer une proposition** la déplace également dans CORBEILLE.
- **Revalider** depuis la corbeille publie les champs corrigés puis retire la proposition de CORBEILLE.

Le proposant consulte uniquement ses propres demandes et les motifs de refus. Le niveau Validation permet de traiter toutes les demandes et d'ouvrir la corbeille.

Les propositions restent récupérables **sept jours après leur mise à la corbeille**. Passé ce délai, le serveur refuse leur revalidation. À l'ouverture du glossaire, le navigateur demande un nettoyage serveur : les propositions expirées disparaissent lors d'une visite suivante, sans tâche planifiée. Cette suppression utilise la corbeille native XWiki, dont la rétention administrative reste définie par l'instance.

La corbeille du glossaire concerne les **propositions**. Supprimer un acronyme déjà publié utilise la suppression native XWiki.

## Installation

Les fichiers GitHub doivent être installés dans XWiki ; ils ne mettent pas automatiquement l'instance à jour. Les API de groupes nécessitent XWiki 10.8 ou ultérieur.

1. Installer ensemble les deux pages et trois extensions de [GLOSSAIRE_PAGE.md](GLOSSAIRE_PAGE.md), en copiant les sources complètes dans l'éditeur Wiki, syntaxe XWiki 2.1.
2. Compléter les classes ci-dessous et l'objet de configuration existant.
3. Créer les conteneurs `TestPage.PAGE.Glossaire.PROPOSITIONS.WebHome` et `TestPage.PAGE.Glossaire.CORBEILLE.WebHome`, puis appliquer les droits indiqués ci-dessous.
4. Enregistrer l'affichage et DATA avec des comptes de confiance. L'auteur de DATA doit avoir **View, Edit et Delete** sur DATA, PROPOSITIONS et CORBEILLE. L'auteur de l'affichage doit pouvoir lire les propositions privées.
5. Recharger sans cache. Avec un administrateur du wiki, ouvrir **Paramètres**, attribuer les niveaux puis enregistrer.

Tous les traitements restent dans **DATA.WebHome** : aucune page COMMANDE ni GlossaireWorkflow n'est nécessaire. Supprimer les anciennes pages techniques de ces noms après vérification si elles avaient été installées.

## Configuration des groupes

Créer ou compléter `TestPage.PAGE.Glossaire.CODE.glossaireConfigurationClass.WebHome` :

| Propriété | Type | Usage |
| --- | --- | --- |
| `reviewGroup` | String, taille 255 | Ancien groupe, conservé pour compatibilité |
| `schemaVersion` | String | `2` après enregistrement des paramètres |
| `viewGroups` | TextArea | Groupes au niveau Lecture, une référence par ligne |
| `proposeGroups` | TextArea | Groupes au niveau Proposition, une référence par ligne |
| `directAddGroups` | TextArea | Groupes au niveau Ajout direct, une référence par ligne |
| `reviewGroups` | TextArea | Groupes au niveau Validation, une référence par ligne |

L'objet reste sur `TestPage.PAGE.Glossaire.CODE.Configuration.WebHome`. Chaque groupe figure dans son niveau le plus élevé. Les sous-groupes sont pris en compte ; les références qualifiées d'un autre wiki sont acceptées si le groupe est accessible. Les noms de classes sont sensibles à la casse.

L'entrée spéciale des visiteurs non connectés est limitée à Lecture. « Aucun accès » ne donne aucun droit par ce groupe ; un autre groupe peut toutefois accorder un niveau supérieur.

Avant le premier enregistrement, le comportement existant est conservé : visiteurs en lecture, comptes connectés proposant, groupe `reviewGroup` validant. Sans ancien réglage, ce groupe est `XWiki.GlossaireValidateurs`. Après enregistrement, une liste volontairement vide ne réactive pas de valeur par défaut.

Pour ajouter une personne à un groupe : **Administration du wiki → Utilisateurs et groupes → Groupes**, ouvrir le groupe, ajouter le compte et enregistrer. Recharger le glossaire. L'administration du wiki permet de régler les paramètres sans attribuer automatiquement un niveau fonctionnel.

## Classe des propositions

Créer ou compléter `TestPage.PAGE.Glossaire.CODE.glossairePropositionClass.WebHome` :

| Propriété | Type | Usage |
| --- | --- | --- |
| `acronyme` | String, taille 255 | Acronyme |
| `libelle` | String, taille 255 | Libellé |
| `definition` | TextArea | Définition |
| `author` | TextArea | Référence du proposant, fixée par le serveur |
| `submittedAt` | Date | Date de proposition |
| `status` | Static List, sélection unique | `pending`, `approved`, `rejected`, `trashed` |
| `reviewComment` | TextArea | Commentaire ou motif du refus |
| `reviewer` | TextArea | Auteur de la décision |
| `reviewedAt` | Date | Date de décision |
| `publishedRef` | TextArea | Référence publiée |
| `deletedAt` | Date | Début du délai de récupération |
| `sourceProposalId` | String, taille 255 | Identifiant technique initial, conservé en corbeille et dans l'audit de publication |

Les fiches publiées conservent `TestPage.PAGE.Glossaire.CODE.glossaireClass.WebHome` et ses champs `acronyme`, `libelle`, `definition`.

## Droits XWiki

Les écritures utilisent l'auteur de confiance du script, après contrôle serveur du niveau, de POST, de CSRF, du périmètre des références et de la version de la proposition. Il n'est pas nécessaire d'autoriser les contributeurs à modifier les scripts.

L'enregistrement des paramètres synchronise les ACL natives **View** sur la page du glossaire, DATA et ses fiches, ainsi que les ACL enfants de **DATA.WebPreferences**. Cela protège aussi les accès aux fiches par URL, rendu brut et REST. L'édition native des documents reste réservée aux comptes de confiance : les niveaux Ajout direct et Validation modifient et suppriment les acronymes avec les boutons du glossaire. Les autres niveaux natifs sont conservés. Les administrateurs natifs gardent leurs droits.

La même synchronisation réserve l'accès natif à PROPOSITIONS et CORBEILLE aux comptes de confiance, y compris sur leurs préférences et leurs fiches existantes. Elle conserve les auteurs effectifs de l'affichage et de DATA pour permettre les lectures et écritures filtrées. Une erreur interrompt l'enregistrement des paramètres ; les ACL déjà synchronisées ne sont pas annulées automatiquement. Corriger l'erreur avec un administrateur puis enregistrer de nouveau.

Configurer également les zones privées et techniques :

| Zone | Droits réservés aux comptes de confiance / administrateurs |
| --- | --- |
| Affichage et DATA.WebHome | Edit, Delete, Script, Admin |
| CODE, classes, extensions et configuration | Edit, Delete, Script, Admin |
| PROPOSITIONS et CORBEILLE, pages et enfants | View, Edit, Delete, Admin |

La page d'affichage fournit une liste filtrée : les validateurs n'ont pas besoin d'un accès natif direct aux espaces privés. L'auteur de DATA doit pouvoir y lire, créer, modifier et supprimer les documents. Ces API ne nécessitent pas Programming.

Protéger ces zones avant d'ouvrir la fonctionnalité. Utiliser des listes d'autorisation ; un refus global sur XWikiAllGroup touche aussi les personnes autorisées. Vérifier les exceptions de droits historiques après installation. Les paramètres refusent les écritures provenant d'un compte sans administration du wiki.

## Références fixes et anciennes fiches

Les nouvelles fiches reçoivent une référence technique indépendante de l'acronyme. Une modification change les champs et le titre sans renommer le document.

Dans **Paramètres**, la conversion manuelle des anciennes adresses attribue des identifiants techniques aux fiches existantes. Elle met à jour les liens internes sans conserver de page de redirection. Les anciennes URL externes doivent être remplacées. Aucune migration n'est déclenchée par une simple visite ; les fiches non converties restent utilisables et conservent leur adresse lors d'une modification.

Une fiche dont le corps contient du contenu personnalisé, au lieu d'être vide ou de contenir uniquement les marqueurs techniques connus, est laissée intacte et signalée parmi les échecs de conversion. Sa modification par le formulaire est également refusée jusqu'à vérification par un administrateur. Cette règle conserve le contenu existant et évite de lui attribuer implicitement les droits de l'auteur du script.

Une destination déterministe par proposition permet de reprendre une publication réussie suivie d'un échec du retrait, sans doublon ni écrasement des champs déjà publiés. Les versions périmées sont refusées. Ce mécanisme n'est pas un verrou transactionnel entre deux décisions exactement simultanées.

## Vérification après installation

1. Tester les quatre niveaux, plusieurs appartenances et les sous-groupes ; vérifier les boutons et le mode d'import.
2. Enregistrer les paramètres, retirer l'accès à un groupe puis vérifier aussi une URL de fiche DATA et un accès brut. Garder une session administrateur pour régler les droits.
3. Proposer manuellement et par import : une demande par ligne acceptée, aucune fiche publiée avant validation.
4. Corriger et valider : une seule fiche publiée, plus de proposition dans PROPOSITIONS.
5. Refuser avec motif, supprimer une autre proposition puis revalider dans la corbeille ; vérifier les auteurs, champs et compteurs après rechargement.
6. Avec des données de test de plus de sept jours, ouvrir le glossaire et vérifier le nettoyage et le refus de revalidation.
7. Modifier plusieurs fois un acronyme et vérifier son URL fixe. Essayer aussi la conversion d'une ancienne fiche, les filtres, doublons et suppressions multiples.

## Tests et erreur EOF

Les tests exécutent les vrais templates avec une API XWiki simulée, les parseurs XWiki et Velocity, puis les extensions dans Chromium. Les commandes et dépendances sont dans [GLOSSAIRE_PAGE.md](GLOSSAIRE_PAGE.md). Un essai sur l'instance reste nécessaire pour ses ACL et extensions installées.

Pour une erreur **encountered EOF**, remplacer les sources complètes dans l'éditeur Wiki/source, en syntaxe XWiki 2.1. L'affichage commence par `{{velocity}}` puis `{{html clean="false"}}` et se termine par `{{/html}}` puis `{{/velocity}}`. DATA commence par `{{velocity output="false"}}` et se termine par `{{/velocity}}`. Conserver les directives `#end`. L'erreur précédemment signalée n'a pas été reproduite avec la source complète du dépôt.
