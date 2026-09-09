# Livrable — Page d'accueil XWiki

## État actuel

- thème blanc moderne / luxueux ;
- cercles de modules mixtes blanc / bleu ;
- logo central sous forme d'image ;
- compteur Documentation filtré par `type=document` ;
- Formation inchangée ;
- `À la une` avec derniers documents créés et plus vus sur 30 jours ;
- `Accès rapides` avec 10 derniers documents ouverts par l'utilisateur ;
- prévisualisation web interactive dans `preview/`.

## Fichiers XWiki

```text
xwiki/Accueil/WebHome.xwiki

xwiki/extensions/stylesheet/
├── Accueil-Base.css
├── Accueil-Modules.css
├── Accueil-Branding.css
├── Accueil-Panneaux-Contact.css
└── Accueil-Flux.css

xwiki/extensions/javascript/
├── Accueil-Modules.js
├── Accueil-Contact.js
└── Accueil-Flux.js
```

## Action manuelle obligatoire pour le logo

Attacher à `Accueil.WebHome` le fichier :

```text
naval-group-logo.png
```

Le `WebHome.xwiki` pointe directement vers cette pièce jointe.

## Documentation

Une page est comptée comme documentation uniquement si :

1. elle se trouve sous la racine `Documentation` ;
2. elle n'est pas le `WebHome` racine ;
3. elle possède un XWiki Object avec la propriété String exacte `type=document`.

`type=folder` n'est jamais compté.

## À la une

### Derniers créés

Affiche les 5 dernières pages `type=document` triées par `creationDate`.

### Plus vus — 30 jours

Utilise le service Statistics de XWiki et filtre les résultats sur les pages réellement reconnues comme `type=document`.

## Accès rapides

Utilise l'historique de consultations XWiki pour afficher jusqu'aux 10 derniers documents `type=document` ouverts par l'utilisateur courant, sans doublons.

## Sous-wiki

La page teste l'état des statistiques pour **le wiki courant**.

Si le serveur autorise Statistics globalement, le sous-wiki peut l'activer dans son propre `XWiki.XWikiPreferences` avec la propriété `statistics=true`.

Si le serveur a `xwiki.stats=0`, l'administrateur du sous-wiki ne peut pas corriger cela sans intervention de l'administrateur de la plateforme / serveur.

Dans les deux cas, la page reste fonctionnelle : les blocs dépendant des statistiques affichent un message explicite quand Statistics n'est pas disponible.

## Compatibilité Velocity

Les appels Java de chaînes qui causaient des erreurs (`.trim()`, `.toLowerCase()`, `.startsWith()`, etc.) ont été retirés du `WebHome.xwiki` pour les nouveaux traitements.

## Preview

```text
preview/index.html
```

La preview reste interactive et utilise les vrais modules CSS / JavaScript. Le logo exact fourni est intégré dans la preview par `Preview.js`.
