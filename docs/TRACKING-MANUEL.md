# Tracking manuel des documents — sous-wiki InfoWiki

Ce module remplace complètement la dépendance au module **Statistics** de XWiki.

Il couvre deux besoins :

- **Plus vus sur 30 jours** : compteur partagé stocké dans XWiki ;
- **10 derniers documents ouverts** : historique personnel stocké dans le navigateur de l'utilisateur.

## 1. XClass déjà créée

Classe :

```text
InfoWiki.CODE.viewClass
```

Créer exactement les propriétés suivantes dans cette classe.

| Nom technique | Type XWiki | Réglage conseillé | Utilisation |
|---|---|---|---|
| `document` | String | taille 255 | nom complet du document consulté |
| `day` | Date | format `yyyy-MM-dd` | jour auquel la vue est comptée |
| `views` | Number | type Integer, valeur par défaut 0 | nombre de consultations |

Ne pas ajouter de propriété `user` pour le moment : l'historique personnel reste côté navigateur et les statistiques serveur sont donc anonymisées.

## 2. Endpoint à créer

Créer la page :

```text
InfoWiki.CODE.TrackView
```

Puis copier le contenu de :

```text
xwiki/InfoWiki/CODE/TrackView.xwiki
```

Cette page :

1. reçoit la référence du document ouvert ;
2. vérifie côté serveur qu'il s'agit bien d'un descendant de `Documentation` ;
3. lit directement l'XObject qui contient la propriété `type` ;
4. ne valide que `type=document` ;
5. ignore donc automatiquement `type=folder` ;
6. incrémente la vue du document pour le jour courant.

Le formulaire utilise le token CSRF XWiki.

**Aucun droit Programming n'est nécessaire pour les requêtes du module.** Les requêtes XWQL ne retournent que des noms de documents et les propriétés des XObjects sont ensuite lues via l'API publique XWiki.

## 3. Espace de données

Créer la page racine :

```text
InfoWiki.DATA.ViewStats.WebHome
```

Les données quotidiennes seront créées automatiquement dessous :

```text
InfoWiki.DATA.ViewStats
├── D20260909
├── D20260910
├── D20260911
└── ...
```

Chaque page quotidienne contient des objets `InfoWiki.CODE.viewClass`.

Exemple :

```text
document = Documentation.Securite.Consignation
day      = 2026-09-09
views    = 17
```

## 4. Droits nécessaires

Le script sauvegarde les statistiques avec les droits de l'utilisateur courant.

Il faut donc autoriser les **utilisateurs authentifiés** à créer / modifier les pages sous :

```text
InfoWiki.DATA.ViewStats
```

Le plus simple est de mettre le droit **Edit** sur cet espace pour le groupe de tes utilisateurs du sous-wiki et de faire hériter les enfants.

Ne donne pas de droit d'édition supplémentaire sur `InfoWiki.CODE`.

Cette solution est volontairement légère. Elle convient à des statistiques internes, mais elle n'est pas conçue comme un compteur infalsifiable : un utilisateur ayant Edit sur l'espace de statistiques pourrait techniquement modifier les données à la main.

## 5. JavaScript Extension globale

Créer une JavaScript Extension :

```text
Accueil - Tracking
```

avec le contenu :

```text
xwiki/extensions/javascript/Accueil-Tracking.js
```

**Important : cette extension doit être chargée sur tout le sous-wiki**, pas seulement sur `Accueil.WebHome`.

Son fonctionnement :

```text
ouverture d'une page
        │
        ▼
la page est sous Documentation ?
        │
        ├── non → rien
        │
        ▼ oui
appel InfoWiki.CODE.TrackView
        │
        ▼
le serveur confirme type=document ?
        │
        ├── non → rien
        │
        ▼ oui
        ├── compteur partagé XWiki
        └── historique personnel navigateur
```

## 6. Anti-refresh

Pour éviter de gonfler artificiellement les statistiques, un même navigateur ne renvoie qu'une vue comptable d'un même document toutes les **30 minutes**.

Réactualiser dix fois une page en quelques secondes ne produit donc pas dix vues.

L'ouverture reste malgré tout enregistrée dans l'ordre des documents récents.

## 7. Historique personnel

Les 10 derniers documents ouverts sont stockés dans `localStorage` avec une clé séparée par utilisateur et par wiki.

Avantages :

- aucune donnée nominative de navigation enregistrée dans la XClass ;
- aucune permission serveur supplémentaire pour l'historique ;
- fonctionnement immédiat pour l'utilisateur connecté.

Limite :

- cet historique est lié au navigateur / appareil. Il ne suit pas encore l'utilisateur lorsqu'il change de PC.

Si un historique multi-appareils devient nécessaire, on pourra ajouter ensuite une seconde classe dédiée aux historiques utilisateurs sans modifier la logique des vues globales.

## 8. Plus vus sur 30 jours

`Accueil.WebHome` ne fait plus de requête HQL avec `SUM`, `BaseObject`, `StringProperty`, `DateProperty` ou `IntegerProperty`, car ce type de requête peut demander le droit **Programming**.

La logique actuelle est :

1. lister les pages de `InfoWiki.DATA.ViewStats` avec une requête XWQL sûre ;
2. ouvrir ces pages avec l'API XWiki ;
3. lire leurs objets `InfoWiki.CODE.viewClass` ;
4. garder uniquement les objets des 30 derniers jours ;
5. garder uniquement les documents déjà validés comme `type=document` ;
6. additionner `views` en Velocity ;
7. conserver les 5 totaux les plus élevés.

Cela permet au système de fonctionner dans un sous-wiki sans droit Programming.

## 9. Erreur « The query requires programming right »

Si cette erreur réapparaît, cela signifie qu'une ancienne version de `Accueil.WebHome` ou `InfoWiki.CODE.TrackView` est encore copiée dans XWiki.

Les versions à utiliser sont celles du dépôt qui ne contiennent plus de requête HQL d'agrégation pour le tracking.
