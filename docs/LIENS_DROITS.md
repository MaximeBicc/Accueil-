# Paramètres des droits de la page Liens

Le bouton **Paramètres**, réservé aux administrateurs du wiki, attribue aux groupes XWiki un droit dans **Personnel** et un droit dans **Commun**. Chaque colonne propose **Aucun accès**, **Lecture** ou **Écriture**. Il n'y a aucun circuit de proposition ou de validation.

Les appartenances aux groupes, y compris les sous-groupes, se cumulent. L'écriture inclut la lecture du même onglet. **Écriture dans Commun donne toujours Écriture dans Personnel**, y compris si ce droit provient d'un autre groupe.

| Personnel choisi | Commun choisi | Accès effectif |
| --- | --- | --- |
| Aucun accès | Aucun accès | Aucun onglet |
| Lecture | Aucun accès | Personnel en lecture seule |
| Aucun accès | Lecture | Commun en lecture seule |
| Lecture | Lecture | Les deux onglets en lecture seule |
| Écriture | Aucun accès | Personnel en lecture et écriture |
| Écriture | Lecture | Personnel en écriture, Commun en lecture seule |
| N'importe lequel | Écriture | Les deux onglets en lecture et écriture |

Sans lecture, le bouton de l'onglet, son tableau et ses données ne sont pas rendus. Le premier onglet autorisé s'ouvre automatiquement, même s'il s'agit uniquement de Commun. Sans écriture, les actions, la suppression multiple et l'import sont retirés ; les filtres, le tri et la pagination restent utilisables.

**Personnel reste limité aux liens de l'utilisateur connecté.** Le droit d'écrire dans Commun ne permet pas de consulter les personnels des autres utilisateurs. Les auteurs et les types déjà gérés par l'éditeur des liens communs restent disponibles aux personnes autorisées à écrire dans Commun.

L'administrateur peut ouvrir Paramètres même sans accès aux deux onglets. L'administration n'accorde pas automatiquement de droit fonctionnel ; attribuer aussi les droits à un groupe auquel appartient le compte si nécessaire.

## Installation dans XWiki

1. Mettre à jour ensemble les deux pages et les extensions indiquées dans [LIENS_PAGE.md](LIENS_PAGE.md). Le protocole DATA transmet les quatre droits ; les sources serveur et JavaScript doivent correspondre.
2. Créer ou compléter la classe **`TestPage.PAGE.Liens.CODE.liensConfigurationClass.WebHome`** avec les cinq propriétés ci-dessous. Les noms sont sensibles à la casse.
3. Protéger les pages CODE, la classe, la configuration et les scripts contre la modification par les comptes ordinaires. L'auteur de l'affichage doit pouvoir lire la configuration ; l'administrateur qui enregistre les paramètres doit pouvoir la créer et la modifier.
4. Ouvrir la page Liens avec un administrateur du wiki, cliquer **Paramètres**, choisir les droits des groupes puis **Enregistrer les autorisations**. L'objet et sa page sont créés automatiquement au premier enregistrement ; aucun objet n'est à ajouter manuellement.
5. Recharger sans cache et vérifier les onglets avec un compte de chaque groupe.

| Propriété | Type XWiki | Contenu |
| --- | --- | --- |
| `schemaVersion` | String | `1` après enregistrement |
| `personalReadGroups` | TextArea | Groupes pouvant lire Personnel, une référence par ligne |
| `personalWriteGroups` | TextArea | Groupes pouvant écrire dans Personnel |
| `commonReadGroups` | TextArea | Groupes pouvant lire Commun |
| `commonWriteGroups` | TextArea | Groupes pouvant écrire dans Commun |

L'objet est enregistré sur **`TestPage.PAGE.Liens.CODE.Configuration.WebHome`**, et non sur la définition de la classe. Les paramètres enregistrent également les lectures impliquées par les écritures, et l'écriture personnelle impliquée par l'écriture commune.

Le tableau liste les groupes du wiki et les groupes déjà configurés. `XWiki.XWikiAllGroup` désigne les comptes connectés. Les références qualifiées d'un autre wiki sont conservées et leurs appartenances sont évaluées dans ce wiki. Un ancien groupe supprimé apparaît comme introuvable avec Aucun accès, afin de permettre son retrait.

Les visiteurs non connectés peuvent recevoir uniquement Lecture dans Commun. Ils n'ont pas de Personnel et ne peuvent pas écrire.

## Avant et après le premier enregistrement

Avant le premier enregistrement, les accès historiques sont conservés pour les comptes connectés : écriture personnelle, lecture commune et écriture commune pour les groupes `XWiki.IVQ_Gestionnaires` / `XWiki.IVQ_Gestionnaire`.

Après enregistrement, seules les listes de la configuration s'appliquent. Des listes volontairement vides n'activent aucun droit par défaut, même pour un ancien gestionnaire. Une configuration illisible ou d'une version inconnue ne réactive pas les anciens accès.

Les groupes doivent exister pour recevoir un droit. Ajouter un compte dans un groupe se fait dans **Administration du wiki → Utilisateurs et groupes → Groupes**. Recharger ensuite la page Liens.

## Contrôles serveur et droits natifs

Les deux templates calculent les mêmes droits depuis les groupes actuels ; un rôle envoyé par le navigateur est ignoré. DATA filtre sa liste selon les lectures et refuse une création, modification ou suppression sans l'écriture correspondante. Un changement de type exige l'écriture sur l'onglet source et l'onglet destination. La création manuelle et l'import suivent ces mêmes contrôles. Personnel reste filtré sur le propriétaire connecté.

Les réglages de ce module s'ajoutent aux droits natifs XWiki : ils ne modifient pas les ACL des pages et ne donnent pas de droit natif supplémentaire. Les opérations existantes nécessitent toujours les droits View, Edit ou Delete correspondants, notamment lors d'un renommage. Les accès directs aux fiches, pièces jointes, rendu brut et REST restent gouvernés par les ACL XWiki ; configurer ces droits natifs pour les accès hors du module.

Les paramètres exigent l'administration du wiki, POST, CSRF et la version courante de configuration. Une classe incomplète indique le champ à compléter. Une sauvegarde non conservée est signalée. Une modification concurrente invite à recharger les paramètres. Le formulaire fonctionne aussi sans l'extension JavaScript ; avec JavaScript, une erreur conserve les sélections et affiche son message dans la fenêtre.

## HTTP 400 à l'enregistrement

Les paramètres sont envoyés avec `application/x-www-form-urlencoded`, comme un formulaire HTML classique. L'ancien envoi multipart créait une partie par champ : avec beaucoup de groupes, un conteneur servlet limitant le nombre de parties pouvait rejeter la requête avec HTTP 400 avant l'exécution de DATA.

Mettre à jour ensemble les JavaScript `01-actions-personnelles.js`, `02-actions-communes.js` et `06-glossaire-adaptation.js`, puis recharger sans cache avec Ctrl + F5. Si le JavaScript est regroupé dans un objet, remplacer son contenu complet dans l'ordre des sept sources indiqué dans LIENS_PAGE.md.

Le navigateur conserve désormais le statut HTTP et le message renvoyé par le serveur, qu'il s'agisse de texte, d'une réponse structurée ou d'une page HTML d'erreur. Les scripts et styles de cette page d'erreur ne sont pas affichés ni exécutés. Les choix restent conservés pour permettre un nouvel essai. Une erreur de jeton CSRF invite à recharger ; aucune vérification de sécurité n'est désactivée.

Un HTTP 400 seul ne permet pas d'identifier sa cause sur l'instance. Si l'erreur persiste, relever l'action effectuée et le message complet visible après le code HTTP. Une classe incomplète, une session expirée et un refus du serveur nécessitent des corrections différentes.

## Validation

- 222 contrôles des vrais templates avec une API XWiki simulée, exécutés avec Velocity 1.7 et 2.3.
- 66 contrôles Chromium de régression : filtres, pagination, édition, suppression, import XLSX, boutons du Glossaire et fenêtres modales.
- 149 contrôles Chromium des droits : neuf combinaisons Personnel/Commun, onglet Commun seul, lecture seule, chargement tardif, administration sans accès fonctionnel et enregistrement des paramètres. Les tests reproduisent aussi un refus HTTP 400 multipart, vérifient l'enregistrement de plus de 50 champs en formulaire classique et la restitution des diagnostics HTTP, HTML, JSON et CSRF.

```sh
java -cp '/chemin/vers/jars/*' tests/LiensVelocityTest.java /tmp/liens-rendered.html
node tests/Liens.browser.test.js /tmp/liens-rendered.html /chemin/vers/assets
node tests/Liens.permissions.browser.test.js /tmp/liens-rendered.html /chemin/vers/assets
```

Les prérequis sont dans [LIENS_PAGE.md](LIENS_PAGE.md). Les tests ne déploient rien dans XWiki et n'utilisent pas l'instance réelle. Après installation, vérifier les appartenances réelles aux groupes, les droits natifs et les actions avec les comptes concernés.
