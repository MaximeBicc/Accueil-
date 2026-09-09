# Page Contacts XWiki

## Objectif

Cette page fournit un espace personnel de contacts avec deux onglets :

1. **Mes contacts** : affichage des contacts enregistrés.
2. **Gérer mes contacts** : ajout / suppression avec quatre listes dynamiques avant validation.

Aucune modification n'est enregistrée tant que l'utilisateur n'a pas cliqué sur **Valider**.

---

## Fichiers

### Page XWiki

- `xwiki/Contacts/WebHome.xwiki`

### StyleSheet Extensions

Créer / attacher à la page les extensions suivantes :

- **Contacts - Base** → `xwiki/extensions/stylesheet/Contacts-Base.css`
- **Contacts - Cards** → `xwiki/extensions/stylesheet/Contacts-Cards.css`
- **Contacts - Manager** → `xwiki/extensions/stylesheet/Contacts-Manager.css`

### JavaScript Extensions

- **Contacts - View** → `xwiki/extensions/javascript/Contacts-View.js`
- **Contacts - Manager** → `xwiki/extensions/javascript/Contacts-Manager.js`

Le JavaScript et le CSS sont volontairement séparés du contenu de la page.

---

## Fonctionnement

### Récupération des membres

La page interroge les documents possédant un objet `XWiki.XWikiUsers`.

L'utilisateur actuellement connecté et `XWiki.XWikiGuest` sont exclus de la liste des membres pouvant être ajoutés.

### Photos de profil

Les avatars utilisent la macro XWiki `#resizedUserAvatar` afin d'afficher directement la photo du profil XWiki et le fallback standard lorsque l'utilisateur n'a pas d'avatar.

### Groupes

La page récupère les groupes de chaque utilisateur avec le service `services.user.group`.

La configuration se trouve au début de `WebHome.xwiki` :

```velocity
#set ($groupDisplayBlacklist = ['INVITE', 'XWikiAllGroup'])
```

Règle :

- si l'utilisateur appartient à un groupe métier + `INVITE`, `INVITE` n'est pas affiché ;
- si son seul groupe est `INVITE`, `INVITE` reste affiché ;
- le même principe s'applique aux autres groupes ajoutés à la blacklist.

---

## Deux dispositions des contacts

### Vue horizontale

- une personne par ligne ;
- avatar à gauche ;
- nom et groupes au centre ;
- quatre actions à droite : Informations, Formation, Rôle, Suivis.

### Vue verticale

- plusieurs personnes sur une même ligne ;
- avatar centré en haut ;
- nom et groupes au centre ;
- quatre boutons sous les informations.

Le choix est mémorisé côté navigateur via `localStorage`.

---

## Gestion des contacts

Le deuxième onglet contient quatre zones :

### 1. Liste des membres

Contient tous les membres qui ne sont pas actuellement des contacts.

Action : **Ajouter** → déplace immédiatement la carte dans « Contacts que vous allez ajouter ».

### 2. Liste de vos contacts

Contient les contacts actuellement enregistrés.

Action : **Retirer** → déplace immédiatement la carte dans « Contacts que vous allez supprimer ».

### 3. Contacts que vous allez ajouter

Contient les ajouts en attente.

Action : **Annuler** → replace la carte dans « Liste des membres ».

### 4. Contacts que vous allez supprimer

Contient les suppressions en attente.

Action : **Restaurer** → replace la carte dans « Liste de vos contacts ».

### Annuler

Le bouton global **Annuler** remet toutes les cartes dans leur état enregistré initial.

### Valider

Le bouton **Valider** reconstruit la liste finale et l'envoie en POST.

Le serveur :

1. vérifie le token CSRF ;
2. rejette les références qui ne correspondent pas à un utilisateur connu ;
3. supprime les doublons ;
4. enregistre seulement l'état final validé.

---

## Stockage

La page utilise un stockage simple sans XClass supplémentaire.

Pour chaque utilisateur, une page de données est créée sous :

```text
Contacts.Data.<utilisateur_normalise>
```

Exemple :

```text
XWiki.Maxime
→ Contacts.Data.XWiki_Maxime
```

Cette page est marquée comme cachée et contient une référence utilisateur par ligne :

```text
XWiki.Alice
XWiki.Bob
XWiki.Charlie
```

Cette solution évite de modifier `XWiki.XWikiUsers` et évite d'ajouter une XClass globale uniquement pour une liste personnelle.

### Droits nécessaires

Les utilisateurs authentifiés doivent pouvoir créer / modifier **leur page de données** dans `Contacts.Data`.

Ne donnez pas de droit d'édition aux utilisateurs sur les pages de code ou les extensions elles-mêmes.

Si votre politique de droits XWiki ne permet pas de donner facilement un droit « uniquement sur sa propre page », remplacez ensuite cette couche de stockage par une XClass dédiée ou un composant serveur. L'interface et les modules JavaScript n'ont pas besoin d'être réécrits.

---

## Pages ouvertes par les 4 boutons

Les références sont configurables au début de `WebHome.xwiki` :

```velocity
#set ($formationPageRef = 'Formation.WebHome')
#set ($rolePageRef = 'Roles.WebHome')
#set ($followupPageRef = 'Suivis.WebHome')
```

- **Informations** ouvre directement le profil XWiki du contact.
- **Formation** ouvre `Formation.WebHome?contact=XWiki.Utilisateur`.
- **Rôle** ouvre `Roles.WebHome?contact=XWiki.Utilisateur`.
- **Suivis** ouvre `Suivis.WebHome?contact=XWiki.Utilisateur`.

Ces trois références peuvent être remplacées lorsque les pages métier définitives existent.

---

## Point de sécurité important

Les mouvements de cartes dans le navigateur ne sont jamais considérés comme fiables.

Au moment de la validation, `WebHome.xwiki` reconstruit la liste côté serveur uniquement à partir des références qui existent réellement dans la liste des utilisateurs du wiki. Le formulaire utilise également le service CSRF de XWiki.
