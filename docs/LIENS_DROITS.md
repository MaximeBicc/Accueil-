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

L'administrateur peut ouvrir Paramètres même sans accès aux deux onglets. Le bouton reste à droite de la barre d'actions, après les commandes Excel, comme dans le Glossaire. L'administration n'accorde pas automatiquement de droit fonctionnel ; attribuer aussi les droits à un groupe auquel appartient le compte si nécessaire.

## Auteurs lors de l'import Excel

Avec **Écriture dans Commun**, la liste Auteur de l'import et de l'édition contient les utilisateurs appartenant à **au moins un groupe ayant Écriture dans Commun** dans Paramètres. Les sous-groupes sont inclus et les membres de plusieurs groupes apparaissent une seule fois. Un compte existant qui appartient seulement à un groupe de lecture n'est pas un auteur valide. Les sous-groupes eux-mêmes et les comptes supprimés sont exclus. Si `XWiki.XWikiAllGroup` a l'écriture commune, tous les comptes du wiki sont éligibles, même si leur appartenance à ce groupe est implicite.

La liste est construite depuis `commonWriteGroups` avec `services.user.group.getMembers(DocumentReference, true)` : le groupe est résolu en référence de document avant l'appel. L'import et l'éditeur la rechargent depuis DATA (`action=listAuthors`, POST et CSRF) à chaque ouverture. L'affichage et DATA partagent le même calcul. Les profils sont lus avec les droits de l'auteur du script pour récupérer prénom/nom ; les auteurs des pages d'affichage et DATA doivent pouvoir consulter ces profils. Les noms ne sont transmis qu'aux personnes ayant l'écriture commune. Le nom affiché et l'identifiant distinguent les homonymes ; sans prénom/nom, l'identifiant est affiché. Les comptes d'un autre wiki conservent une référence qualifiée lorsqu'elle est nécessaire pour les identifier.

L'import conserve d'abord un identifiant exact. Il reconnaît aussi les références `XWiki.Identifiant`, `xwiki:XWiki.Identifiant`, le prénom/nom et le nom/prénom, même si l'identifiant est entièrement différent du nom. Sinon, il compare les noms et identifiants par distance de Levenshtein, en ignorant casse, accents, espaces et ponctuation. Une correspondance est retenue si les changements représentent au plus 25 % de la longueur du texte le plus long ; à distance relative égale, l'ordre alphabétique des identifiants départage les comptes. La valeur Excel d'origine reste visible à côté de la sélection lorsqu'elle diffère ; on peut choisir un autre compte avant de confirmer.

Sans correspondance suffisamment proche parmi les membres éligibles, la valeur Excel reste sélectionnée **en rouge**, avec « Auteur non reconnu ». La fenêtre s'ouvre aussi si la liste des comptes est vide ou indisponible : les valeurs d'origine restent consultables et aucune erreur ne bloque la lecture du fichier. Si DATA est indisponible, le navigateur peut utiliser le catalogue rendu dans un select masqué ou un ancien template, uniquement lorsqu'il porte le marqueur `data-author-source="common-write-groups"`. Un ancien annuaire de tous les comptes n'est pas utilisé comme liste d'auteurs autorisés. Les auteurs en rouge doivent être corrigés dans la liste avant de lancer l'import ; aucune ligne n'est enregistrée tant qu'il en reste.

Un auteur vide utilise le compte connecté. Avec l'écriture personnelle seule, toutes les lignes restent personnelles, l'auteur est le compte connecté et sa liste est désactivée. À l'enregistrement, DATA recalcule les membres autorisés et refuse un auteur retiré de ses groupes ou supprimé après l'ouverture de l'aperçu. L'éditeur applique la même règle : un ancien auteur devenu non autorisé reste visible en rouge pour être remplacé, et sa conservation sur un lien commun est refusée. Les erreurs d'import précisent les lignes concernées.

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

Le champ caché `name="action"` masque la propriété DOM `form.action`. L'ancien JavaScript envoyait donc la requête vers `[object HTMLInputElement]` au lieu de la page DATA, ce qui provoquait une requête invalide. Le correctif lit l'attribut avec `form.getAttribute('action')`. Ce défaut a été reproduit dans Chromium, puis le test a vérifié l'adresse exacte du POST corrigé.

Les paramètres restent envoyés avec `application/x-www-form-urlencoded`, comme un formulaire HTML classique.

Pour ce correctif d'adresse, mettre à jour `06-glossaire-adaptation.js` sur `TestPage.PAGE.Liens.CODE.GlossaireExtension`, puis recharger sans cache avec Ctrl + F5. Conserver aussi les versions actuelles de `01-actions-personnelles.js` et `02-actions-communes.js`, qui affichent les diagnostics du serveur. Si le JavaScript est regroupé dans un objet, remplacer son contenu complet dans l'ordre des sept sources indiqué dans LIENS_PAGE.md.

Le navigateur conserve désormais le statut HTTP et le message renvoyé par le serveur, qu'il s'agisse de texte, d'une réponse structurée ou d'une page HTML d'erreur. Les scripts et styles de cette page d'erreur ne sont pas affichés ni exécutés. Les choix restent conservés pour permettre un nouvel essai. Une erreur de jeton CSRF invite à recharger ; aucune vérification de sécurité n'est désactivée.

Dans l'onglet Réseau du navigateur, le POST doit cibler l'URL de `TestPage.PAGE.Liens.DATA.WebHome` et ne jamais contenir `[object HTMLInputElement]`. Si une autre erreur persiste, relever le message complet après le code HTTP. Les contrôles de classe, de session et de droits restent actifs.

## Validation

- 246 contrôles des vrais templates avec une API XWiki simulée, exécutés avec Velocity 1.7 et 2.3 : groupes autorisés, lecture seule exclue, sous-groupes, cycles, doublons, AllGroup implicite, groupes et auteurs d'un autre wiki, refus d'un membre retiré ou supprimé et d'un ancien auteur devenu non autorisé. Le double de GroupScriptService respecte sa signature réelle avec DocumentReference.
- 128 contrôles Chromium de régression : filtres, pagination, édition, suppression, import XLSX, boutons du Glossaire et fenêtres modales. Les auteurs sont vérifiés avec fautes, accents, noms inversés, identifiant distinct du nom et références, puis modifiés en liste native et avec un vrai widget Tom Select. DATA fournit les auteurs même sans catalogue HTML ; le repli en cas de panne conserve les valeurs inconnues en rouge. L'édition recharge aussi les membres et refuse un ancien auteur retiré de la liste.
- 160 contrôles Chromium des droits : neuf combinaisons Personnel/Commun, onglet Commun seul, lecture seule, chargement tardif, administration sans accès fonctionnel et enregistrement des paramètres. Les tests reproduisent le masquage de `form.action` et le rejet de son URL, vérifient que le bouton appelle exactement DATA, l'enregistrement de plus de 50 champs et les diagnostics HTTP, HTML, JSON et CSRF. Ils vérifient également Paramètres à droite avec et sans écriture, ainsi que sa présence sur mobile.

```sh
java -cp '/chemin/vers/jars/*' tests/LiensVelocityTest.java /tmp/liens-rendered.html
node tests/Liens.browser.test.js /tmp/liens-rendered.html /chemin/vers/assets
node tests/Liens.permissions.browser.test.js /tmp/liens-rendered.html /chemin/vers/assets
```

Les prérequis sont dans [LIENS_PAGE.md](LIENS_PAGE.md). Les tests ne déploient rien dans XWiki et n'utilisent pas l'instance réelle. Après installation, vérifier les appartenances réelles aux groupes, les droits natifs et les actions avec les comptes concernés.
