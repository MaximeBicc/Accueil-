'use strict';
// node --test tests/Liens.test.js ; pas de dépendance npm ni de serveur XWiki.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = require('../xwiki/TestPage/PAGE/Liens/CODE/LiensExtension.js');
const row = extra => Object.assign({ acronym: 'API', label: 'Interface', definition: 'Description', type: 'personnel', author: 'Alice', ref: 'R', version: '1.1' }, extra);

test('Excel : une seule en-tête reconnue suffit, ordre déduit', () => {
 const h = app.detectHeader(['Autre intitulé', 'acronyme', 'Documentation', 'Visibilité', 'Auteur']);
 assert.equal(h.detected, true); assert.deepEqual(h.map, { acronym: 1, type: 3, author: 4, label: 0, definition: 2 });
 assert.deepEqual(h.inferred, ['label', 'definition']);
});
test('Excel : entêtes permutées avec accents et alias', () => {
 const h = app.detectHeader(['Propriétaire', 'DEF', 'Libellé complet', 'SIGLE', 'TYPE']);
 assert.deepEqual(h.map, { author: 0, definition: 1, label: 2, acronym: 3, type: 4 });
});
test('Excel : 3 colonnes sans en-tête restent compatibles', () => {
 const raw = [['API','Interface','Échanges logiciels'], ['HTTP','Web','Échanges']];
 const h = app.detectHeader(raw[0]); assert.equal(h.detected, false);
 const out = app.readRows(raw, h, { type: 'personnel', author: 'Alice' });
 assert.equal(out.length, 2); assert.equal(out[0].acronym, 'API'); assert.equal(out[1].author, 'Alice'); assert.equal(out[0].type, 'personnel');
});
test('Excel : auteur vide = importateur, type vide = défaut, lignes blanches ignorées', () => {
 const raw = [['Acronyme','Libellé','Définition','Type','Auteur'], [' A ', ' B ', ' C ', ' COMMUN ', 'Bob'], [], ['D','E','F','','']];
 const out = app.readRows(raw, app.detectHeader(raw[0]), { type: 'personnel', author: 'Alice' }, 2);
 assert.equal(out.length, 2); assert.equal(out[0].type, 'commun'); assert.equal(out[0].author, 'Bob'); assert.equal(out[0].sourceLine, 4);
 assert.equal(out[1].type, 'personnel'); assert.equal(out[1].author, 'Alice');
});
test('Confidentialité : seuls les liens communs et personnels propres sont visibles', () => {
 assert.equal(app.visible(row(), 'Alice'), true); assert.equal(app.visible(row({ author: 'Bob' }), 'Alice'), false);
 assert.equal(app.visible(row({ author: 'Bob', type: 'commun' }), 'Alice'), true); assert.equal(app.visible(row({ type: '???' }), 'Alice'), false);
});
test('Rôle : droit générique non transmis ; commun modifiable uniquement par manager', () => {
 assert.equal(app.editable(row({ type: 'commun', canEdit: true }), 'Alice', false), false);
 assert.equal(app.editable(row({ type: 'commun', author: 'Bob' }), 'Alice', true), true);
 assert.equal(app.editable(row({ author: 'Bob' }), 'Alice', true), false);
 assert.equal(app.editable(row(), 'Alice', false), true);
});
test('Non-manager : commun et auteur tiers interdits dans import et nouvelles valeurs', () => {
 assert.ok(app.errors(row({ type: 'commun' }), 'Alice', false).includes('Commun réservé aux managers'));
 assert.ok(app.errors(row({ author: 'Bob' }), 'Alice', false).some(x => x.includes('autre auteur')));
 assert.deepEqual(app.errors(row({ type: 'commun', author: 'Bob' }), 'Alice', true), []);
});
test('Noms dangereux refusés mais points dans acronymes autorisés', () => {
 for (const acronym of ['${candidateName}', 'A/B', 'A\\B', 'A\nB\nC', 'A|B', 'A:B', 'WebHome', '..']) assert.ok(app.errors(row({ acronym }), 'Alice', true).length, acronym);
 assert.deepEqual(app.errors(row({ acronym: 'API.v2' }), 'Alice', true), []);
});
test('Auteurs : identifiants uniquement et valeurs réservées refusées', () => {
 for (const author of ['Bob Martin', 'xwiki:XWiki.Bob', '../Bob', 'XWikiGuest', '']) assert.ok(app.errors(row({ author }), 'Alice', true).length);
 assert.deepEqual(app.errors(row({ author: 'Élise.Durand' }), 'Alice', true), []);
});
test('Doublons : périmètres personnel/commun et auteurs séparés', () => {
 const imported = [row(), row({type: 'commun'}), row({author: 'Bob'})];
 const p = app.importPlan(imported, [row({type: 'commun'})], 'Alice', true, false, false);
 assert.deepEqual(p.map(x=>x.eligible), [true,false,true]);
});
test('Doublons : aucun oracle sur les liens personnels d’un tiers', () => {
 const p = app.importPlan([row()], [row({author:'Bob'})], 'Alice', false, false, false);
 assert.equal(p[0].eligible, true); assert.deepEqual(p[0].reasons, []);
});
test('Doublons : motif distinct fichier/existant et options indépendantes', () => {
 const existing = [row()];
 const p = app.importPlan([row({label:'Nouveau'}), row({acronym:'Autre'})], existing, 'Alice', true, false, false);
 assert.equal(p[0].duplicateAcronym, true); assert.equal(p[0].duplicateLabel, false);
 assert.equal(app.importPlan([row({label:'Nouveau'})], existing, 'Alice', true, true, false)[0].eligible, true);
 assert.equal(app.importPlan([row()], existing, 'Alice', true, true, false)[0].eligible, false);
 assert.equal(app.importPlan([row()], existing, 'Alice', true, true, true)[0].eligible, true);
});
test('Ligne invalide ou refusée ne masque pas une ligne valide suivante', () => {
 const p=app.importPlan([row({definition:''}),row(),row()], [], 'Alice', false, false,false);
 assert.deepEqual(p.map(x=>x.eligible), [false,true,false]);
 assert.ok(p[2].reasons.includes('Acronyme : fichier Excel')); assert.ok(p[2].reasons.includes('Libellé : fichier Excel'));
});
test('Une ligne déjà confirmée ne peut pas être réimportée', () => {
 assert.equal(app.importPlan([row({done:true})], [], 'Alice', true,true,true)[0].eligible,false);
});
for (const field of ['acronym','label','definition','type','author']) test('Tri ascendant/descendant sur '+field, () => {
 const list = [row({[field]:'Zèbre',ref:'1'}),row({[field]:'école',ref:'2'}),row({[field]:'Alpha',ref:'3'})];
 assert.deepEqual(app.sorted(list,field,1).map(x=>x.ref),['3','2','1']);
 assert.deepEqual(app.sorted(list,field,-1).map(x=>x.ref),['1','2','3']);
 assert.equal(list[0][field],'Zèbre');
});
test('Tri numérique naturel et filtres conjoints sans casse ni accent',()=>{
 assert.deepEqual(app.sorted([row({acronym:'A10'}),row({acronym:'A2'})],'acronym',1).map(x=>x.acronym),['A2','A10']);
 const out=app.filtered([row({label:'École'}),row({label:'École',author:'Bob'}),row({label:'Bureau'})],{label:'ecol',author:'alice'});
 assert.equal(out.length,1);
});
test('Tout afficher respecte encore les filtres ; pagination bornée après suppression',()=>{
 const list=Array.from({length:23},(_,i)=>row({acronym:'A'+i,author:i%2?'Bob':'Alice'}));
 const matches=app.filtered(list,{author:'Alice'});
 assert.equal(app.pageRows(matches,9,'all').rows.length,12); assert.equal(app.pageRows(matches,9,'5').page,3);
 assert.deepEqual(app.pageRows([],9,'10'),{rows:[],page:1,pages:1});
});
test('Lot : toutes les réponses positives comptées, refus conservés, ordre séquentiel',async()=>{
 const calls=[], progress=[];
 const report=await app.sequential([1,2,3,4],async i=>{calls.push(i);return i===2?{ok:false}:i===3?{ok:true,skipped:true}:{ok:true};},(_,__,r)=>progress.push(r.saved));
 assert.deepEqual(calls,[1,2,3,4]); assert.deepEqual(report,{saved:2,failed:1,skipped:1,uncertain:false}); assert.deepEqual(progress,[1,1,1,2]);
});
test('Perte réseau : arrêt sans relance ni faux succès',async()=>{
 const calls=[];
 const report=await app.sequential([1,2,3],async i=>{calls.push(i);if(i===2)throw Error('réseau');return{ok:true};},()=>{});
 assert.deepEqual(calls,[1,2]);assert.equal(report.saved,1);assert.equal(report.uncertain,true);
});
test('Résultat serveur incertain : aucune opération suivante',async()=>{
 const calls=[];
 const report=await app.sequential([1,2],async i=>{calls.push(i);return{ok:false,code:'UNCERTAIN'};},()=>{});
 assert.deepEqual(calls,[1]);assert.equal(report.uncertain,true);
});
test('Contrat serveur statique : garde-fous présents (ne remplace PAS un test XWiki)',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../xwiki/TestPage/PAGE/Liens/DATA/WebHome.xwiki'),'utf8');
 for(const fragment of ["$request.getMethod() != 'POST'","$services.csrf.isTokenValid($csrf)","XWiki.IVQ_Gestionnaires","#liensScope($sourceRef)","#liensEditable($before)","$payload.version != $sourceDoc.getVersion()","$services.model.createDocumentReference($wikiId, $authorSpaces, $candidateName)","setInteractive(true)","setOverwrite(false)","setDeep(false)","$jsontool.serialize($body)"]) assert.ok(s.includes(fragment),fragment);
 assert.ok(!s.includes('setCheckRights(false)'));assert.ok(!s.includes('setInteractive(false)'));
 const uncommented=s.replace(/##[^\n]*/g,'');
 assert.ok(!/\.trim\s*\(|\.toLowerCase\s*\(|\.keySet\s*\(/.test(uncommented));
 assert.ok(!uncommented.includes('${candidateName}'));assert.ok(!uncommented.includes("getParameter('className')"));
});
