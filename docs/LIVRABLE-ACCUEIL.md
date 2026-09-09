# Livrable — Page d'accueil XWiki

## État actuel

- thème blanc moderne / luxueux ;
- cercles de modules mixtes blanc / bleu ;
- logo central sous forme d'image attachée à `Accueil.WebHome` ;
- compteur Documentation filtré par `type=document` ;
- Formation inchangée ;
- `À la une` avec derniers documents créés et plus vus sur 30 jours ;
- `Accès rapides` avec les 10 derniers documents ouverts par l'utilisateur ;
- suivi des vues **manuel**, indépendant du module Statistics de XWiki ;
- prévisualisation web interactive dans `preview/`.

## Fichiers XWiki

```text
xwiki/Accueil/WebHome.xwiki

xwiki/InfoWiki/CODE/
└── TrackView.xwiki

xwiki/extensions/stylesheet/
├── Accueil-Base.css
├── Accueil-Modules.css
├── Accueil-Branding.css
├── Accueil-Panneaux-Contact.css
└── Accueil-Flux.css

xwiki/extensions/javascript/
├── Accueil-Modules.js
├── Accueil-Contact.js
├── Accueil-Flux.js
└── Accueil-Tracking.js
```

## Logo

La pièce jointe suivante doit rester attachée à `Accueil.WebHome` :

```text
naval-group-logo.png
```

Le code récupère maintenant directement l'URL de la pièce jointe depuis `$doc`.

## Documentation

Une page est comptée comme documentation uniquement si :

1. elle se trouve sous la racine `Documentation` ;
2. elle n'est pas le `WebHome` racine ;
3. elle possède un XWiki Object avec la propriété String exacte `type=document`.

`type=folder` n'est jamais compté.

## À la une — derniers créés

Affiche les 5 dernières pages `type=document` triées par `creationDate`.

## À la une — plus vus sur 30 jours

Le module Statistics de XWiki n'est plus utilisé.

Le classement provient de la classe :

```text
InfoWiki.CODE.viewClass
```

Le détail complet de sa configuration est dans :

```text
docs/TRACKING-MANUEL.md
```

## Accès rapides

Les 10 derniers documents sont conservés côté navigateur avec `localStorage`, séparés par utilisateur et par sous-wiki.

Cela évite d'enregistrer un historique nominatif de navigation dans les objets XWiki.

Cette liste est donc propre au navigateur / appareil utilisé.

## JavaScript Extension globale

`Accueil - Tracking` doit être chargée **sur l'ensemble du sous-wiki**.

Elle utilise l'API JavaScript XWiki `xwiki-meta` pour connaître le document courant et le token CSRF, puis appelle :

```text
InfoWiki.CODE.TrackView
```

Le serveur vérifie de nouveau `type=document` avant d'enregistrer quoi que ce soit.

Une même page ne compte qu'une nouvelle vue toutes les 30 minutes pour un même navigateur, afin de limiter les refresh artificiels et le nombre d'écritures XWiki.

## Compatibilité Velocity

Les traitements ajoutés n'utilisent pas `.trim()`, `.toLowerCase()`, `.startsWith()` ou `.replaceAll()` dans le Velocity.

## Preview

```text
preview/index.html
```

La preview reste interactive. Les statistiques affichées y sont simulées : le vrai tracking nécessite l'environnement XWiki, sa XClass et ses droits.
