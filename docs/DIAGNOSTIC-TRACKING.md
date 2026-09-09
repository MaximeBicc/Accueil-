# Diagnostic du tracking InfoWiki

Ce guide sert lorsque **Plus vus · 30 jours** et **Vos 10 derniers documents ouverts** restent vides.

## 1. Vérifier la JavaScript Extension

La JavaScript Extension suivante doit exister :

```text
Accueil - Tracking
```

Elle doit être **active sur tout le sous-wiki**, et pas uniquement sur la page d'accueil.

Contenu à utiliser :

```text
xwiki/extensions/javascript/Accueil-Tracking.js
```

## 2. Ouvrir une vraie documentation

Ouvrir une page située sous :

```text
Documentation
```

et dont un XWiki Object contient exactement :

```text
type = document
```

Le tracking ne considère pas `type=folder` comme un document.

## 3. Revenir sur l'accueil et lire le badge

Le badge sous `Accès rapides` devient un outil de diagnostic.

### Suivi des documents actif

```text
Suivi des documents actif
```

Le JavaScript et `InfoWiki.CODE.TrackView` ont fonctionné.

### Pas de droit Edit

```text
Historique local actif · compteur sans droit Edit
```

L'historique personnel peut fonctionner, mais le serveur ne peut pas écrire dans :

```text
InfoWiki.DATA.ViewStats
```

Il faut corriger les droits Edit sur cet espace.

### CSRF

```text
Suivi à vérifier · csrf
```

Le token CSRF n'a pas été accepté. Vérifier que `TrackView.xwiki` et `Accueil-Tracking.js` sont à jour.

### Network error

```text
Suivi à vérifier · network-error
```

La page `InfoWiki.CODE.TrackView` n'est probablement pas joignable à l'URL construite par le JavaScript, ou une requête est bloquée.

### Ignored

```text
Suivi à vérifier · ignored
```

La page ouverte n'a pas été reconnue comme une documentation valide. Vérifier :

```text
racine = Documentation
objet contient type=document
```

### Le badge reste "Historique personnel navigateur"

Cela indique généralement que la nouvelle version de `Accueil - Tracking` ne s'exécute pas sur l'accueil. Vérifier le périmètre global de la JavaScript Extension.

## 4. Vérifier les données partagées

Après une consultation réussie, une page quotidienne doit apparaître sous :

```text
InfoWiki.DATA.ViewStats
```

Par exemple :

```text
InfoWiki.DATA.ViewStats.D20260909
```

Cette page doit contenir au moins un objet :

```text
InfoWiki.CODE.viewClass
```

avec :

```text
document = Documentation....
day      = date du jour
views    = 1 ou plus
```

Si cette page existe, le système `Plus vus · 30 jours` a des données à agréger.

## 5. Important : aucune donnée historique avant le tracking

Le module manuel ne peut pas reconstruire les consultations qui ont eu lieu avant son installation.

Le classement `Plus vus · 30 jours` commence donc à se remplir uniquement à partir des vues enregistrées après l'activation du tracking.

## 6. Anti-refresh

Une vue n'est comptée qu'une fois toutes les 30 minutes pour un même document et un même navigateur.

La version actuelle utilise une nouvelle clé `v2`, afin que les anciens essais échoués ne bloquent pas les nouveaux tests après correction.
