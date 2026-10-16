# Installer la classe des propositions

Le paquet [doc-propositions-class.xar](doc-propositions-class.xar) installe la définition complète des 22 propriétés de :

`TestPage.PAGE.doc-test.CODE.docPropositionClass.WebHome`

Il permet de corriger les erreurs « champ … absent » ou « type … attendu » communes aux propositions de création, déplacement et import. Le nom saisi dans le formulaire ne crée pas ces propriétés de classe.

## Import dans XWiki

1. Avec un administrateur, exporter la page de classe existante si elle existe. Le paquet remplace cette page technique ; ses éventuels objets, droits locaux et pièces jointes ne seront pas conservés par cet import. L'historique existant est conservé par l'option `preserveVersion`.
2. Télécharger le fichier `.xar`, puis ouvrir **Administration du wiki → Contenu → Importer** dans le wiki qui contient `doc-test`.
3. Charger le paquet et importer la seule page proposée, en la remplaçant si elle existe déjà.
4. Ouvrir la page de classe indiquée ci-dessus dans l'éditeur **Classe** et vérifier les propriétés `title` de type String, ainsi que `submittedAt`, `reviewedAt` et `deletedAt` de type Date.
5. Recharger `doc-test` puis réessayer une proposition.

La référence comprend bien `.WebHome`. Une classe créée sur la page terminale `TestPage.PAGE.doc-test.CODE.docPropositionClass` n'est pas cette même page. Les propositions existantes, situées dans `PROPOSITIONS` et `CORBEILLE`, ne sont pas contenues dans le paquet.

## Sources et vérification

- [docPropositionClass.xml](docPropositionClass.xml) : page XWiki avec la définition de classe et un corps vide.
- [package.xml](package.xml) : manifeste limité à cette page, avec `backupPack=false` et `preserveVersion=true`.
- [build_proposal_class_xar.py](build_proposal_class_xar.py) : reconstruction du paquet à partir des deux sources XML.

Depuis la racine du dépôt :

```sh
python3 xwiki/TestPage/PAGE/doc-test/INSTALL/build_proposal_class_xar.py
python3 tests/DocumentationClassPackage.test.py
```

Le contrôle natif `tests/DocumentationXWikiClassTest.java` régénère et relit cette classe avec les sérialiseurs et lecteurs XAR de XWiki 16.10.17, puis exécute le contrôle de COMMANDE avec les API XWiki et le moteur Velocity sécurisé. Il vérifie aussi les refus avec `title` absent, désactivé ou de mauvais type.

```sh
java -cp '/chemin/jars/*' tests/DocumentationXWikiClassTest.java
```

Il nécessite les JAR oldcore, filter-instance-document, filter-stream-xar, xwiki-commons-velocity et leurs dépendances, ainsi que Velocity 2.3. Avec `--generate`, il réécrit le XML depuis les générateurs natifs ; reconstruire ensuite le XAR avec le script Python ci-dessus.
