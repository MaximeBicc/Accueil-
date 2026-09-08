# Accueil XWiki

Première version de la page d'accueil du wiki, pensée pour XWiki Syntax 2.1.

## Contenu

- `xwiki/Accueil/WebHome.xwiki` : page d'accueil complète (Velocity + HTML + CSS + JavaScript).
- `docs/CUSTOMISATION.md` : où modifier les modules, les textes et les espaces utilisés par les compteurs.

## Installation rapide dans XWiki

1. Créer ou ouvrir la page `Accueil.WebHome`.
2. Passer l'éditeur en mode **Wiki** et utiliser la syntaxe **XWiki 2.1**.
3. Copier le contenu de `xwiki/Accueil/WebHome.xwiki` dans la page.
4. Enregistrer la page avec un utilisateur disposant des droits nécessaires à l'exécution du script.
5. Configurer l'adresse administrateur (`admin_email`) et la configuration SMTP de XWiki pour rendre l'envoi du formulaire de contact opérationnel.

## Fonctionnalités

- Modules sous forme de cercles organisés automatiquement autour d'un noyau central.
- Un ou plusieurs anneaux sont créés automatiquement quand le nombre de modules augmente.
- Animation et état actif au clic.
- Panneau de détail synchronisé avec le module sélectionné.
- Mise en page responsive mobile/tablette.
- Trois cartes d'information personnalisables.
- Compteurs dynamiques pour les espaces `Documentation` et `Formation`.
- Formulaire modal permettant de contacter l'administrateur via l'API Mail Sender de XWiki.
- Protection CSRF du formulaire.
- Prise en charge de `prefers-reduced-motion`.

Aucun framework front-end externe n'est requis.
