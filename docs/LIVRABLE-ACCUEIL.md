# Livrable — Page d'accueil XWiki

## État

Version actuelle : **blanc moderne luxueux**, avec accents bleu profond et rouge discret.

Le logo n'est pas affiché. Le centre de l'orbite utilise une signature abstraite bleu / rouge.

---

## Fichiers à intégrer

### Page XWiki

```text
xwiki/Accueil/WebHome.xwiki
```

À utiliser comme contenu de la page `Accueil.WebHome`.

### StyleSheet Extensions

Créer trois SSX et copier le contenu des fichiers correspondants :

```text
Accueil - Base
→ xwiki/extensions/stylesheet/Accueil-Base.css

Accueil - Modules
→ xwiki/extensions/stylesheet/Accueil-Modules.css

Accueil - Panneaux & Contact
→ xwiki/extensions/stylesheet/Accueil-Panneaux-Contact.css
```

### JavaScript Extensions

Créer deux JSX :

```text
Accueil - Modules
→ xwiki/extensions/javascript/Accueil-Modules.js

Accueil - Contact
→ xwiki/extensions/javascript/Accueil-Contact.js
```

---

## Ordre d'intégration conseillé

1. Créer ou ouvrir `Accueil.WebHome`.
2. Coller le contenu de `WebHome.xwiki`.
3. Créer les 3 StyleSheet Extensions avec les noms exacts indiqués ci-dessus.
4. Créer les 2 JavaScript Extensions.
5. Configurer les extensions pour qu'elles s'appliquent à la page d'accueil concernée.
6. Configurer les deux dossiers racines des compteurs.
7. Tester les clics sur les cercles.
8. Tester le responsive mobile.
9. Configurer `admin_email` et SMTP avant de tester le formulaire administrateur.

---

## Configuration des compteurs

Dans `WebHome.xwiki` :

```velocity
#set ($documentationRootSpace = 'Documentation')
#set ($formationRootSpace = 'Formation')
```

Le dossier racine lui-même est exclu.

Tous ses descendants sont comptés récursivement, sans limite de profondeur : enfants, sous-enfants, sous-sous-enfants, etc.

Exemple :

```text
Documentation                non compté : dossier racine
├── Procédure A              compté
├── Procédure B              compté
└── Technique                compté
    ├── Guide A              compté
    └── Sécurité             compté
        └── Guide B          compté
```

Pour utiliser une racine imbriquée :

```velocity
#set ($documentationRootSpace = 'Ressources.Documentation')
```

---

## Modules circulaires

Chaque bloc `data-home-module` dans `WebHome.xwiki` crée un cercle.

Le JavaScript :

- détecte automatiquement le nombre de modules ;
- répartit les cercles autour du centre ;
- utilise plusieurs anneaux si nécessaire ;
- met à jour le panneau de droite au clic ;
- conserve le fonctionnement responsive.

Le style alterne automatiquement entre cercles blancs bordés de bleu et cercles bleus pleins.

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
```

Les composants doivent être séparés par responsabilité dès qu'ils deviennent suffisamment importants.
