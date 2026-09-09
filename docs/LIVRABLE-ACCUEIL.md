# Livrable — Page d'accueil XWiki

## État

Version actuelle : **blanc moderne luxueux**, avec accents bleu profond et rouge discret.

Le logo n'est pas affiché. Le centre de l'orbite utilise une signature abstraite bleu / rouge.

Le livrable visuel est désormais une **prévisualisation web interactive**, et non une image.

---

## Arborescence du livrable

```text
xwiki/
├── Accueil/
│   └── WebHome.xwiki
└── extensions/
    ├── stylesheet/
    │   ├── Accueil-Base.css
    │   ├── Accueil-Modules.css
    │   └── Accueil-Panneaux-Contact.css
    └── javascript/
        ├── Accueil-Modules.js
        └── Accueil-Contact.js

preview/
├── index.html
├── Preview.css
└── Preview.js

docs/
├── CUSTOMISATION.md
└── LIVRABLE-ACCUEIL.md
```

---

## Fichiers à intégrer dans XWiki

### Page XWiki

```text
xwiki/Accueil/WebHome.xwiki
```

À utiliser comme contenu de la page `Accueil.WebHome`.

### StyleSheet Extensions

```text
Accueil - Base
→ xwiki/extensions/stylesheet/Accueil-Base.css

Accueil - Modules
→ xwiki/extensions/stylesheet/Accueil-Modules.css

Accueil - Panneaux & Contact
→ xwiki/extensions/stylesheet/Accueil-Panneaux-Contact.css
```

### JavaScript Extensions

```text
Accueil - Modules
→ xwiki/extensions/javascript/Accueil-Modules.js

Accueil - Contact
→ xwiki/extensions/javascript/Accueil-Contact.js
```

---

## Compteur Documentation — logique exacte

La racine est définie dans `WebHome.xwiki` :

```velocity
#set ($documentationRootSpace = 'Documentation')
```

Le compteur parcourt récursivement tous les descendants de cette racine.

Ensuite, pour chaque page, il inspecte ses **XWiki Objects** et leur propriété String :

```text
type
```

Règle :

```text
type = document   → compté
type = folder     → non compté
autre valeur      → non compté
aucun type         → non compté
```

La page racine est toujours exclue.

Exemple :

```text
Documentation/                       racine : non comptée
├── Procédure-A                      type=document   ✓
├── Technique                       type=folder     ✗
│   ├── Guide-A                     type=document   ✓
│   └── Sécurité                    type=folder     ✗
│       └── Guide-B                 type=document   ✓
└── Archives                        type=folder     ✗
    └── Ancienne-procédure          type=document   ✓
```

Résultat : **4 documentations**.

La requête utilise un `count(distinct doc.fullName)` afin d'éviter de compter deux fois une page qui aurait plusieurs objets correspondants.

> Cette version ne filtre pas encore par nom de classe XWiki Object. Elle cherche toute propriété `type=document` portée par un objet de la page. Si tu me donnes le nom exact de la classe utilisée, on pourra verrouiller encore davantage la requête.

---

## Compteur Formation

La logique Formation n'a pas été modifiée.

Configuration :

```velocity
#set ($formationRootSpace = 'Formation')
```

Elle continue à compter les pages descendantes du dossier Formation, récursivement, avec exclusion du `WebHome` racine.

---

## Prévisualisation web interactive

Le visuel du livrable est maintenant :

```text
preview/index.html
```

Cette page charge les **mêmes CSS et JavaScript** que le futur XWiki.

Elle simule réellement :

- les cercles dynamiques ;
- la sélection d'un module ;
- le changement du panneau de droite ;
- les animations ;
- le responsive ;
- la popup de contact ;
- un faux envoi du formulaire.

Pour l'utiliser :

1. cloner ou télécharger le dépôt ;
2. ouvrir `preview/index.html` dans un navigateur ;
3. cliquer sur les différents cercles et sur `Envoyer un message`.

Les compteurs affichés dans cette prévisualisation sont des valeurs d'exemple. Seul XWiki peut exécuter la vraie requête sur les objets et les pages du wiki.

---

## Modules circulaires

Chaque bloc `data-home-module` dans `WebHome.xwiki` crée un cercle.

Le JavaScript :

- détecte automatiquement le nombre de modules ;
- répartit les cercles autour du centre ;
- utilise plusieurs anneaux si nécessaire ;
- met à jour le panneau de droite au clic ;
- conserve le fonctionnement responsive.

Le style alterne entre cercles blancs bordés de bleu et cercles bleus pleins.

---

## Bas de page

Le livrable contient :

- 3 panneaux d'information ;
- compteur Documentation ;
- compteur Formation ;
- bouton `Contacter l’administrateur` ;
- popup de contact ;
- retour utilisateur par toast.

---

## Règle projet

À conserver pour les prochaines pages :

```text
WebHome / page XWiki = contenu + Velocity nécessaire
StyleSheet Extension = CSS
JavaScript Extension = JavaScript
Preview              = site web interactif de simulation
```

Ne plus générer d'image de maquette comme livrable visuel : fournir une prévisualisation HTML/CSS/JS utilisable dans un navigateur.
