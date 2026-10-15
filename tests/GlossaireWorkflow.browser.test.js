const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const fixtureDirectory = process.argv[2];
if (!fixtureDirectory) throw new Error('Indiquer le dossier des fixtures produites par GlossaireVelocityTest.');
const root = path.join(__dirname, '..');
const codeDirectory = path.join(root, 'xwiki/TestPage/PAGE/Glossaire/CODE');
const dataUrl = 'https://wiki.test/bin/view/TestPage/PAGE/Glossaire/DATA/WebHome';
let checks = 0;
function check(value, expected, label) { assert.deepEqual(value, expected, label); checks++; }

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const errors = [];
  async function openFixture(profile) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    const html = fs.readFileSync(path.join(fixtureDirectory, 'glossaire-' + profile + '.html'), 'utf8');
    await page.route('https://wiki.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://wiki.test/glossaire');
    await page.addStyleTag({ content: 'body{font-family:Arial,sans-serif;margin:15px}.modal{display:none}.form-control{display:block;width:100%;box-sizing:border-box}.table{width:100%;border-collapse:collapse}td,th{padding:8px;text-align:left}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}' });
    await page.addStyleTag({ path: path.join(codeDirectory, 'GlossaireExtension.css') });
    await page.evaluate(() => {
      window.jQuery = selector => ({ modal(action) {
        const modal = document.querySelector(selector);
        if (modal) { modal.style.display = action === 'show' ? 'block' : 'none'; }
      } });
      window.requests = [];
      window.maintenanceRequests = [];
      window.reply = { ok: true, text: 'GLOSSAIRE_PROPOSED|TestPage.PAGE.Glossaire.PROPOSITIONS.nouvelle' };
      window.fetch = async (url, options) => {
        const values = Object.fromEntries(options.body);
        if (values.action === 'purge') {
          maintenanceRequests.push({ url, method: options.method, values });
          return { ok: true, text: async () => 'GLOSSAIRE_PURGED|0' };
        }
        requests.push({ url, values });
        const current = reply;
        return { ok: current.ok, text: async () => current.text };
      };
    });
    for (const name of ['GlossaireExtension.js', 'GlossairePageExtension.js']) {
      await page.addScriptTag({ path: path.join(codeDirectory, name) });
    }
    await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
    return page;
  }
  try {
    const reader = await openFixture('reader');
    check(await reader.locator('#mainGlossaryTable').getAttribute('data-endpoint-url'), dataUrl, 'route DATA fournie par le vrai template');
    check(await reader.locator('#mainGlossaryTable').getAttribute('data-workflow-url'), null, 'aucun service Workflow séparé demandé');
    check(await reader.locator('#mainGlossaryTable thead tr').first().locator('th').count(), 3, 'hors groupe : aucune colonne Actions');
    check(await reader.locator('.js-edit-row,.js-delete-row,#btnBulkDeleteModeGlossary,#btnReviewGlossaryProposals').count(), 0, 'hors groupe : aucune commande de gestion');
    check(await reader.locator('#btnImportExcelGlossary').count(), 1, 'hors groupe : import Excel accessible pour proposer');
    check(await reader.locator('#excelImportPublicationHint').innerText().then(text => /proposition|validat/i.test(text)), true, 'import contributeur : attente de validation annoncée');
    check(await reader.locator('#glossaryOwnProposals').innerText().then(text => text.includes('Refusée')), true, 'le proposant voit son refus');
    const initialRows = await reader.locator('.main-term-row').count();
    await reader.evaluate(async () => {
      const form = document.querySelector('#glossaryCreateForm');
      form.querySelector('[name="acronyme"]').value = 'API|+%';
      form.querySelector('[name="libelle"]').value = '<Libellé proposé>';
      form.querySelector('[name="definition"]').value = 'Une définition';
      await submitGlossaryProposal({ preventDefault() {}, currentTarget: form });
    });
    check(await reader.evaluate(() => requests[0].values.action), 'propose', 'envoi par le circuit de proposition');
    check(await reader.evaluate(() => requests[0].values.form_token), 'test-token', 'jeton CSRF envoyé');
    check(await reader.locator('.main-term-row').count(), initialRows, 'proposition absente du glossaire public');
    check(await reader.locator('#glossaryOwnProposals').innerText().then(text => text.includes('API|+% — <Libellé proposé>')), true, 'proposition ajoutée au suivi avec texte littéral');
    check(await reader.locator('#glossaryCreateForm [name="acronyme"]').inputValue(), '', 'formulaire vidé après succès');
    await reader.evaluate(async () => {
      reply = { ok: true, text: 'GLOSSAIRE_ERROR|' + encodeURIComponent('Accès refusé') };
      const form = document.querySelector('#glossaryCreateForm');
      form.querySelector('[name="acronyme"]').value = 'ERR';
      form.querySelector('[name="libelle"]').value = 'Conserver cette saisie';
      await submitGlossaryProposal({ preventDefault() {}, currentTarget: form });
    });
    check(await reader.locator('#glossaryCreateForm .glossary-proposal-feedback').innerText(), 'Accès refusé', 'erreur serveur décodée et affichée');
    check(await reader.locator('#glossaryCreateForm [name="libelle"]').inputValue(), 'Conserver cette saisie', 'saisie conservée après échec');
    await reader.evaluate(async () => {
      const count = requests.length;
      await executeBulkGlossaryDelete();
      if (requests.length !== count) throw new Error('Une commande de gestion a été envoyée hors groupe');
    });
    check(await reader.locator('#glossaryCreateForm [type="submit"]').isDisabled(), false, 'bouton réactivé après erreur');
    const ownCardsBeforeImport = await reader.locator('.glossary-proposal-status-card').count();
    const readImport = await reader.evaluate(async () => {
      window.XLSX = {
        read(buffer, options) {
          if (!(buffer instanceof ArrayBuffer) || options.type !== 'array') throw new Error('Lecture Excel non appelée avec les octets du fichier');
          return { SheetNames: ['Acronymes'], Sheets: { Acronymes: {} } };
        },
        utils: { sheet_to_json() { return [
          ['Acronyme', 'Libellé', 'Définition'], ['IMP|+%', '<Libellé importé>', 'Première définition'], ['DEUX', 'Deuxième', 'Suite']
        ]; } }
      };
      await fixedReadGlossaryExcelFile(new File([new Uint8Array([80, 75])], 'acronymes.xlsx'));
      return excelImportRows.map(row => [row.acronym, row.label, row.definition]);
    });
    check(readImport, [['IMP|+%', '<Libellé importé>', 'Première définition'], ['DEUX', 'Deuxième', 'Suite']], 'contributeur : lecture Excel et détection des trois colonnes');
    check(await reader.locator('#excelImportPreviewBody tr').count(), 2, 'contributeur : les deux lignes Excel sont prévisualisées');
    check(await reader.locator('#btnExcelImportOnlyNew').innerText().then(text => text.startsWith('Proposer')), true, 'contributeur : bouton de proposition avant import');
    await reader.evaluate(async () => {
      reply = { ok: true, text: [
        'ROW_PROPOSED|0|' + encodeURIComponent('TestPage.PAGE.Glossaire.PROPOSITIONS.import1'),
        'ROW_PROPOSED|1|' + encodeURIComponent('TestPage.PAGE.Glossaire.PROPOSITIONS.import2'),
        'GLOSSAIRE_IMPORT_OK|0|0|2|2'
      ].join('\n') };
      await executeExcelImport(excelImportRows, false, false);
    });
    check(await reader.evaluate(() => [requests.at(-1).values.action, requests.at(-1).values.rowCount, requests.at(-1).values.acronym_0,
      requests.at(-1).values.label_0, requests.at(-1).values.form_token, requests.at(-1).values.allowAcronymDuplicates, requests.at(-1).values.allowLabelDuplicates]),
      ['import', '2', 'IMP|+%', '<Libellé importé>', 'test-token', 'false', 'false'], 'contributeur : lignes importées avec jeton CSRF et options de doublons');
    check(await reader.locator('.glossary-proposal-status-card').count(), ownCardsBeforeImport + 2, 'import contributeur : une proposition de suivi par ligne');
    check(await reader.locator('#glossaryOwnProposals').innerText().then(text => text.includes('IMP|+% — <Libellé importé>') && text.includes('DEUX — Deuxième')), true, 'import contributeur : suivi des deux lignes avec texte littéral');
    check(await reader.locator('.main-term-row').count(), initialRows, 'import contributeur : aucune ligne ajoutée au tableau public');
    check(await reader.locator('.js-edit-row,.js-delete-row,#btnBulkDeleteModeGlossary,#btnReviewGlossaryProposals').count(), 0, 'import contributeur : aucune commande de modification ou validation ajoutée');
    check(await reader.locator('#glossaryToast').innerText().then(text => text.includes('2 propositions') && text.includes('validateurs')), true, 'import contributeur : confirmation de l’envoi pour validation');
    check(await reader.locator('#btnExcelImportWithOptions').isDisabled(), false, 'bouton import réactivé après les propositions');
    const pendingDuplicates = await reader.evaluate(() => fixedAnalyzeExcelRows([
      ['IMP|+%', '<Libellé importé>', 'Déjà proposé'], ['DEUX', 'Deuxième', 'Déjà proposé']
    ], { detected: false, map: { acronym: 0, label: 1, definition: 2 } }).map(row => [row.duplicateAcronymGlossary, row.duplicateLabelGlossary]));
    check(pendingDuplicates, [[true, true], [true, true]], 'les propres propositions importées en attente sont détectées comme doublons au prochain fichier');
    await reader.evaluate(async () => {
      reply = { ok: true, text: [
        'ROW_SKIP|0|ACRONYM_DUPLICATE',
        'ROW_PROPOSED|1|' + encodeURIComponent('TestPage.PAGE.Glossaire.PROPOSITIONS.importPartiel'),
        'ROW_ERROR|2|' + encodeURIComponent('Données incomplètes'),
        'GLOSSAIRE_IMPORT_OK|0|2|3|1'
      ].join('\n') };
      await executeExcelImport([
        { acronym: 'IGNORÉ', label: 'Doublon', definition: '' },
        { acronym: 'PARTIEL', label: 'Import partiel', definition: 'Conservé' },
        { acronym: 'INVALIDE', label: '', definition: '' }
      ], false, false);
    });
    check(await reader.locator('.glossary-proposal-status-card').count(), ownCardsBeforeImport + 3, 'import partiel : seule la ligne proposée rejoint le suivi');
    check(await reader.locator('.main-term-row').count(), initialRows, 'import partiel : aucune publication des propositions, erreurs ou doublons');
    check(await reader.locator('#glossaryToast').innerText().then(text => text.includes('1 proposition') && text.includes('2 ligne')), true, 'import partiel : bilan des propositions et lignes ignorées');

    await reader.screenshot({ path: path.join(fixtureDirectory, 'glossaire-contributeur.png'), fullPage: true });

    const reviewer = await openFixture('reviewer');
    check(await reviewer.locator('#glossaryProposalCount').innerText(), '2', 'compteur des propositions en attente');
    check(await reviewer.evaluate(() => maintenanceRequests.map(request => [request.method, request.values.action, request.values.form_token])), [['POST', 'purge', 'test-token']], 'purge automatique : POST unique protégé par CSRF');
    await reviewer.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
    check(await reviewer.evaluate(() => maintenanceRequests.length), 1, 'initialisation répétée : aucune seconde purge automatique');
    const badgePosition = await reviewer.evaluate(() => {
      const badge = getComputedStyle(document.querySelector('#glossaryProposalCount'));
      const button = getComputedStyle(document.querySelector('#btnReviewGlossaryProposals'));
      return [badge.position, button.position, parseFloat(badge.top) < 0, parseFloat(badge.right) < 0];
    });
    check(badgePosition, ['absolute', 'relative', true, true], 'badge placé en haut à droite du bouton');
    check(await reviewer.locator('.glossary-proposal-card').count(), 2, 'liste contenant les deux demandes');
    check(await reviewer.locator('.glossary-trash-card').count(), 2, 'corbeille initiale : un refus et une suppression conservés');
    check(await reviewer.locator('#glossaryTrashCount').innerText(), '2', 'compteur de la corbeille initiale');
    check(await reviewer.locator('.js-edit-row').count(), 1, 'les validateurs conservent la modification directe');
    await reviewer.evaluate(async () => {
      const card = document.querySelector('.glossary-proposal-card');
      await reviewGlossaryProposal(card, 'reject');
    });
    check(await reviewer.evaluate(() => requests.length), 0, 'refus sans motif bloqué avant envoi');
    const stale = await reviewer.evaluate(async () => {
      reply = { ok: true, text: 'GLOSSAIRE_ERROR|' + encodeURIComponent('Cette proposition a changé ; rechargez la liste') };
      await reviewGlossaryProposal(document.querySelector('.glossary-proposal-card'), 'approve');
      return document.querySelector('.glossary-proposal-card .glossary-proposal-feedback').textContent;
    });
    check(stale.includes('rechargez'), true, 'version obsolète signalée');
    check(await reviewer.locator('#glossaryProposalCount').innerText(), '2', 'compteur conservé après échec');
    const duplicateClick = await reviewer.evaluate(async () => {
      const card = document.querySelector('.glossary-proposal-card');
      card.querySelector('[name="acronym"]').value = 'MODIFIÉ';
      card.querySelector('[name="label"]').value = 'Libellé corrigé';
      card.querySelector('[name="definition"]').value = 'Définition corrigée';
      let release;
      const before = requests.length;
      window.fetch = async (url, options) => {
        requests.push({ url, values: Object.fromEntries(options.body) });
        await new Promise(resolve => { release = resolve; });
        const fields = ['TestPage.PAGE.Glossaire.DATA.Proposition_un', 'Proposition_un', 'VALEUR SERVEUR', 'Libellé serveur', 'Définition serveur'];
        return { ok: true, text: async () => 'GLOSSAIRE_APPROVED|' + fields.map(encodeURIComponent).join('|') };
      };
      const first = reviewGlossaryProposal(card, 'approve');
      const second = reviewGlossaryProposal(card, 'approve');
      const disabled = Array.from(card.querySelectorAll('button')).every(button => button.disabled);
      release(); await Promise.all([first, second]);
      return [requests.length - before, disabled, requests.at(-1).values.acronym, requests.at(-1).values.expectedVersion.length > 0];
    });
    check(duplicateClick, [1, true, 'MODIFIÉ', true], 'correction envoyée avec version et double clic bloqué');
    check(await reviewer.locator('#glossaryProposalCount').innerText(), '1', 'compteur décrémenté après validation');
    check(await reviewer.locator('.main-acronym .view-mode').allTextContents().then(texts => texts.includes('VALEUR SERVEUR')), true, 'valeurs canoniques du serveur ajoutées au tableau');
    const countBeforeReject = await reviewer.locator('.main-term-row').count();
    await reviewer.evaluate(async () => {
      window.fetch = async (url, options) => {
        requests.push({ url, values: Object.fromEntries(options.body) });
        return { ok: true, text: async () => 'GLOSSAIRE_REJECTED|' + [
          'TestPage.PAGE.Glossaire.CORBEILLE.trash-refused', '2.1', String(Date.now())
        ].map(encodeURIComponent).join('|') };
      };
      const card = document.querySelector('.glossary-proposal-card');
      card.querySelector('[name="comment"]').value = 'Terme déjà couvert par la définition existante.';
      await reviewGlossaryProposal(card, 'reject');
    });
    check(await reviewer.locator('.main-term-row').count(), countBeforeReject, 'aucune publication lors du refus');
    check(await reviewer.locator('#glossaryProposalCount').innerText(), '0', 'compteur mis à zéro');
    check(await reviewer.locator('#glossaryTrashCount').innerText(), '3', 'refus déplacé dans la corbeille sans publication');
    check(await reviewer.locator('.glossary-trash-card').evaluateAll(cards => cards.some(card => card.getAttribute('data-proposal-ref') === 'TestPage.PAGE.Glossaire.CORBEILLE.trash-refused')), true, 'référence canonique du refus dans la corbeille');
    check(await reviewer.locator('#glossaryProposalsEmpty').isVisible(), false, 'modale fermée par défaut');
    check(await reviewer.locator('#glossaryProposalsEmpty').getAttribute('class').then(value => value.includes('is-hidden')), false, 'état vide prêt à être affiché');
    const rowsBeforeCreate = await reviewer.locator('.main-term-row').count();
    const creationEventHandled = await reviewer.evaluate(async () => {
      window.fetch = async (url, options) => {
        requests.push({ url, values: Object.fromEntries(options.body) });
        return { ok: true, text: async () => 'GLOSSAIRE_OK|' + encodeURIComponent('TestPage.PAGE.Glossaire.DATA.term-direct-opaque') + '|' + encodeURIComponent('term-direct-opaque') };
      };
      const form = document.querySelector('#glossaryCreateForm');
      form.querySelector('[name="acronyme"]').value = 'DIRECT.API';
      form.querySelector('[name="libelle"]').value = 'Ajout direct validateur';
      form.querySelector('[name="definition"]').value = 'Sans passage par les propositions';
      const event = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(event);
      await new Promise(resolve => setTimeout(resolve, 0));
      return event.defaultPrevented;
    });
    check(creationEventHandled, true, 'formulaire validateur lié à l’extension JavaScript de page existante');
    check(await reviewer.evaluate(() => [requests.at(-1).values.action, requests.at(-1).values.acronym, requests.at(-1).values.label, requests.at(-1).values.form_token]),
      ['create', 'DIRECT.API', 'Ajout direct validateur', 'test-token'], 'validateur : création directe par DATA avec les paramètres anglais');
    check(await reviewer.locator('.main-term-row').count(), rowsBeforeCreate + 1, 'ajout direct publié immédiatement dans le tableau');
    check(await reviewer.locator('.main-term-row[data-doc-name="term-direct-opaque"]').getAttribute('data-full-ref'), 'TestPage.PAGE.Glossaire.DATA.term-direct-opaque', 'référence canonique de création conservée');
    check(await reviewer.locator('#popupCheckTable .term-row').evaluateAll(rows => rows.filter(row => row.getAttribute('data-full-ref') === 'TestPage.PAGE.Glossaire.DATA.term-direct-opaque').length), 1, 'ajout direct synchronisé dans les deux tableaux');
    check(await reviewer.locator('#glossaryProposalCount').innerText(), '0', 'ajout direct sans proposition en attente');
    await reviewer.evaluate(async () => {
      window.fetch = async (url, options) => {
        requests.push({ url, values: Object.fromEntries(options.body) });
        return { ok: true, text: async () => 'GLOSSAIRE_OK' };
      };
      const form = document.querySelector('#glossaryCreateForm');
      form.querySelector('[name="acronyme"]').value = 'RÉESSAYER';
      form.querySelector('[name="libelle"]').value = 'Saisie conservée';
      await submitGlossaryProposal({ preventDefault() {}, currentTarget: form });
    });
    check(await reviewer.locator('.main-term-row').count(), rowsBeforeCreate + 1, 'réponse de création incomplète sans ligne supplémentaire');
    check(await reviewer.locator('#glossaryCreateForm [name="libelle"]').inputValue(), 'Saisie conservée', 'échec création : saisie conservée');
    check(await reviewer.locator('#glossaryCreateForm [type="submit"]').isDisabled(), false, 'échec création : bouton réactivé');
    for (const [profile, page] of [['contributeur', reader], ['validateur', reviewer]]) {
      check(await page.evaluate(expected => requests.every(request => {
        const endpoint = new URL(request.url);
        return endpoint.origin + endpoint.pathname === expected && endpoint.searchParams.getAll('xpage').join(',') === 'plain';
      }), dataUrl), true, profile + ' : toutes les requêtes ciblent DATA en rendu brut');
    }
    check(await reviewer.evaluate(() => Array.from(new Set(requests.map(request => request.values.action))).sort()), ['approve', 'create', 'reject'], 'création et décisions partagent le point d’entrée DATA');
    await reviewer.screenshot({ path: path.join(fixtureDirectory, 'glossaire-validateur.png'), fullPage: true });

    const guest = await openFixture('guest');
    check(await guest.locator('#glossaryCreateForm,.js-edit-row,.js-delete-row,#btnImportExcelGlossary,#btnReviewGlossaryProposals').count(), 0, 'visiteur : consultation seule');
    check(await guest.locator('.main-term-row').count(), 1, 'visiteur : tableau public visible');

    const trashAudit = await openFixture('reviewer');
    const trashStartRows = await trashAudit.locator('.main-term-row').count();
    const trashedAt = Date.now();
    await trashAudit.evaluate(async deletedAt => {
      reply = { ok: true, text: 'GLOSSAIRE_TRASHED|' + [
        'TestPage.PAGE.Glossaire.CORBEILLE.trash-test', '4.2', String(deletedAt)
      ].map(encodeURIComponent).join('|') };
      await reviewGlossaryProposal(document.querySelector('.glossary-proposal-card'), 'trash');
    }, trashedAt);
    check(await trashAudit.evaluate(() => requests.at(-1).values.action), 'trash', 'suppression de proposition : demande de déplacement en corbeille');
    check(await trashAudit.locator('.main-term-row').count(), trashStartRows, 'mise en corbeille sans publication');
    check(await trashAudit.locator('#glossaryProposalCount').innerText(), '1', 'mise en corbeille retire la proposition de la file');
    check(await trashAudit.locator('#glossaryTrashCount').innerText(), '3', 'mise en corbeille augmente son compteur');
    check(await trashAudit.locator('.glossary-trash-card').evaluateAll(cards => cards.filter(card => card.getAttribute('data-proposal-ref') === 'TestPage.PAGE.Glossaire.CORBEILLE.trash-test').length), 1, 'nouvelle carte corbeille avec référence canonique unique');
    check(await trashAudit.locator('.glossary-trash-card').evaluateAll(cards => Number(cards.find(card => card.getAttribute('data-proposal-ref') === 'TestPage.PAGE.Glossaire.CORBEILLE.trash-test').getAttribute('data-expires-at'))), trashedAt + 604800000, 'corbeille : échéance calculée exactement sept jours après le déplacement');
    check(await trashAudit.evaluate(deletedAt => {
      const card = Array.from(document.querySelectorAll('.glossary-trash-card')).find(card => card.getAttribute('data-proposal-ref') === 'TestPage.PAGE.Glossaire.CORBEILLE.trash-test');
      const dateText = card.querySelector('.glossary-trash-date').textContent;
      return dateText.includes(new Date(deletedAt).toLocaleString('fr-FR')) && dateText.includes(new Date(deletedAt + 604800000).toLocaleString('fr-FR'));
    }, trashedAt), true, 'corbeille : dates de déplacement et de suppression présentées au validateur');
    for (const invalidReply of ['GLOSSAIRE_APPROVED', 'GLOSSAIRE_ERROR|' + encodeURIComponent('Cette proposition a expiré : délai de sept jours dépassé')]) {
      await trashAudit.evaluate(async text => {
        reply = { ok: true, text };
        const card = Array.from(document.querySelectorAll('.glossary-trash-card')).find(card => card.getAttribute('data-proposal-ref') === 'TestPage.PAGE.Glossaire.CORBEILLE.trash-test');
        await reviewGlossaryProposal(card, 'restore');
      }, invalidReply);
      check(await trashAudit.locator('.main-term-row').count(), trashStartRows, 'réponse incomplète ou refus d’expiration : aucune publication');
      check(await trashAudit.locator('#glossaryTrashCount').innerText(), '3', 'échec de revalidation : carte conservée dans la corbeille');
    }
    const restored = await trashAudit.evaluate(async () => {
      const card = Array.from(document.querySelectorAll('.glossary-trash-card')).find(card => card.getAttribute('data-proposal-ref') === 'TestPage.PAGE.Glossaire.CORBEILLE.trash-test');
      card.querySelector('[name="acronym"]').value = 'À CORRIGER';
      card.querySelector('[name="label"]').value = 'Libellé édité avant revalidation';
      let release;
      const before = requests.length;
      window.fetch = async (url, options) => {
        requests.push({ url, values: Object.fromEntries(options.body) });
        await new Promise(resolve => { release = resolve; });
        return { ok: true, text: async () => 'GLOSSAIRE_APPROVED|' + [
          'TestPage.PAGE.Glossaire.DATA.term-restored-opaque', 'term-restored-opaque',
          'CANONIQUE', '<Libellé du serveur>', 'Définition restaurée'
        ].map(encodeURIComponent).join('|') };
      };
      const first = reviewGlossaryProposal(card, 'restore');
      const second = reviewGlossaryProposal(card, 'restore');
      const disabled = Array.from(card.querySelectorAll('button')).every(button => button.disabled);
      release(); await Promise.all([first, second]);
      return [requests.length - before, disabled, requests.at(-1).values.action,
        requests.at(-1).values.targetRef, requests.at(-1).values.expectedVersion, requests.at(-1).values.acronym];
    });
    check(restored, [1, true, 'restore', 'TestPage.PAGE.Glossaire.CORBEILLE.trash-test', '4.2', 'À CORRIGER'], 'revalidation corrigée : référence/version envoyées et double clic bloqué');
    check(await trashAudit.locator('#glossaryTrashCount').innerText(), '2', 'revalidation retire la carte de la corbeille');
    check(await trashAudit.locator('.main-term-row').count(), trashStartRows + 1, 'revalidation publie exactement une ligne');
    check(await trashAudit.locator('.main-term-row[data-doc-name="term-restored-opaque"] .main-label .view-mode').innerText(), '<Libellé du serveur>', 'revalidation affiche les valeurs canoniques comme du texte');

    const adder = await openFixture('adder');
    const adderRows = await adder.locator('.main-term-row').count();
    await adder.evaluate(async () => {
      reply = { ok: true, text: 'GLOSSAIRE_OK|' + ['TestPage.PAGE.Glossaire.DATA.term-added-level3', 'term-added-level3'].map(encodeURIComponent).join('|') };
      const form = document.querySelector('#glossaryCreateForm');
      form.querySelector('[name="acronyme"]').value = 'NIVEAU3';
      form.querySelector('[name="libelle"]').value = 'Ajout direct sans validation';
      await submitGlossaryProposal({ preventDefault() {}, currentTarget: form });
    });
    check(await adder.evaluate(() => requests.at(-1).values.action), 'create', 'niveau 3 : création directe');
    check(await adder.locator('.main-term-row').count(), adderRows + 1, 'niveau 3 : publication immédiate');
    await adder.evaluate(async () => {
      reply = { ok: true, text: 'ROW_OK|0|TestPage.PAGE.Glossaire.DATA.term-import-level3|term-import-level3\nGLOSSAIRE_IMPORT_OK|1|0|1|0' };
      await executeExcelImport([{ acronym: 'XL3', label: 'Import direct niveau trois', definition: '' }], false, false);
    });
    check(await adder.locator('.main-term-row').count(), adderRows + 2, 'niveau 3 : import direct conserve la publication');
    check(await adder.locator('#btnReviewGlossaryProposals,#btnGlossaryTrash,#btnGlossarySettings').count(), 0, 'niveau 3 : pas de validation, corbeille ou paramètres');

    const admin = await openFixture('admin');
    check(await admin.locator('#mainGlossaryTable,.main-term-row,.glossary-proposal-card,.glossary-trash-card').count(), 0, 'administrateur wiki sans groupe : paramètres seuls et aucune donnée');
    check(await admin.locator('.glossary-permission-row').count() > 1, true, 'paramètres : liste des groupes XWiki natifs');
    const settingsSaved = await admin.evaluate(async () => {
      window.reloads = 0;
      window.reloadGlossaryAfterSettings = () => { reloads++; };
      const form = document.querySelector('#glossarySettingsForm');
      const rows = Array.from(form.querySelectorAll('.glossary-permission-row'));
      rows.forEach(row => { row.querySelector('.glossary-role-select').value = /(^|:)XWiki\.XWikiGuest$/.test(row.getAttribute('data-group-ref')) ? '1' : '4'; });
      const expected = rows.map(row => [row.getAttribute('data-group-ref'), row.querySelector('.glossary-role-select').value]);
      let release;
      const before = requests.length;
      window.fetch = async (url, options) => {
        requests.push({ url, values: Object.fromEntries(options.body) });
        await new Promise(resolve => { release = resolve; });
        return { ok: true, text: async () => 'GLOSSAIRE_SETTINGS_SAVED' };
      };
      const first = saveGlossarySettings({ preventDefault() {}, currentTarget: form });
      const second = saveGlossarySettings({ preventDefault() {}, currentTarget: form });
      const disabled = Array.from(form.querySelectorAll('button,select')).every(control => control.disabled);
      release(); await Promise.all([first, second]);
      const actual = requests.at(-1).values;
      return { delta: requests.length - before, disabled, action: actual.action, csrf: actual.form_token,
        version: actual.expectedVersion, expectedVersion: form.getAttribute('data-expected-version'), reloads,
        count: Number(actual.groupCount), expected,
        groups: expected.map((_, index) => [actual['group_' + index], actual['level_' + index]]) };
    });
    check([settingsSaved.delta, settingsSaved.disabled, settingsSaved.action, settingsSaved.csrf, settingsSaved.reloads], [1, true, 'settings', 'test-token', 1], 'paramètres : un POST protégé, double clic bloqué puis rechargement');
    check(settingsSaved.version, settingsSaved.expectedVersion, 'paramètres : version actuelle envoyée pour contrôler les conflits');
    check(settingsSaved.count, settingsSaved.expected.length, 'paramètres : tous les groupes soumis une fois');
    check(settingsSaved.groups, settingsSaved.expected, 'paramètres : références des groupes natifs et niveaux choisis conservés');
    check(await admin.locator('#mainGlossaryTable').count(), 0, 'enregistrement des paramètres sans accès implicite aux données avant rechargement');
    const guestSettingsRows = await admin.locator('.glossary-permission-row').evaluateAll(rows => rows.filter(row => /(^|:)XWiki\.XWikiGuest$/.test(row.getAttribute('data-group-ref'))).map(row => Array.from(row.querySelectorAll('option')).map(option => option.value)));
    check(guestSettingsRows, [['0', '1']], 'paramètres : une seule ligne visiteurs limitée à aucun accès ou lecture, même avec références qualifiées');
    const settingsError = await admin.evaluate(async () => {
      const form = document.querySelector('#glossarySettingsForm');
      const select = form.querySelector('.glossary-role-select');
      select.value = '0';
      window.fetch = async (url, options) => {
        requests.push({ url, values: Object.fromEntries(options.body) });
        return { ok: true, text: async () => 'GLOSSAIRE_ERROR|' + encodeURIComponent('Les autorisations ont changé, rechargez la page.') };
      };
      await saveGlossarySettings({ preventDefault() {}, currentTarget: form });
      return [form.querySelector('.glossary-settings-feedback').textContent, select.value, select.disabled, reloads];
    });
    check([settingsError[0].includes('rechargez'), ...settingsError.slice(1)], [true, '0', false, 1], 'paramètres : conflit signalé, saisie conservée et contrôles réactivés sans rechargement');
    const invalidSettings = await admin.evaluate(async () => {
      window.fetch = async (url, options) => {
        requests.push({ url, values: Object.fromEntries(options.body) });
        return { ok: true, text: async () => 'GLOSSAIRE_SETTINGS_SAVED|inattendu' };
      };
      await saveGlossarySettings({ preventDefault() {}, currentTarget: document.querySelector('#glossarySettingsForm') });
      return reloads;
    });
    check(invalidSettings, 1, 'paramètres : réponse mal formée ne déclenche pas de rechargement');

    check(await admin.evaluate(() => maintenanceRequests.every(request => request.values.action === 'purge') && requests.every(request => request.values.action !== 'migrate')), true, 'migration des anciennes références jamais automatique');
    const cancelledMigration = await admin.evaluate(async () => {
      const before = requests.length;
      window.confirm = () => false;
      await migrateGlossaryReferences();
      return requests.length === before;
    });
    check(cancelledMigration, true, 'migration annulée : aucune conversion envoyée');
    const migration = await admin.evaluate(async () => {
      window.alerts = [];
      window.confirm = () => true;
      window.alert = message => alerts.push(message);
      window.reloads = 0;
      window.fetch = async (url, options) => {
        requests.push({ url, values: Object.fromEntries(options.body) });
        return { ok: true, text: async () => 'GLOSSAIRE_MIGRATED|2|1' };
      };
      await migrateGlossaryReferences();
      return [requests.at(-1).values.action, requests.at(-1).values.form_token, reloads, alerts.join(' ')];
    });
    check(migration.slice(0, 3), ['migrate', 'test-token', 1], 'migration manuelle : action administrative protégée puis rechargement');
    check(migration[3].includes('2') && migration[3].includes('1'), true, 'migration partielle : nombres de réussites et d’échecs présentés');

    await admin.evaluate(() => jQuery('#glossarySettingsModal').modal('show'));
    await admin.screenshot({ path: path.join(fixtureDirectory, 'glossaire-parametres.png'), fullPage: true });
    await trashAudit.evaluate(() => jQuery('#glossaryTrashModal').modal('show'));
    await trashAudit.screenshot({ path: path.join(fixtureDirectory, 'glossaire-corbeille.png'), fullPage: true });
    for (const forbiddenPage of [reader, reviewer, adder]) {
      const blocked = await forbiddenPage.evaluate(async () => {
        const before = requests.length;
        await saveGlossarySettings({ preventDefault() {}, currentTarget: document.createElement('form') });
        await migrateGlossaryReferences();
        return requests.length === before;
      });
      check(blocked, true, 'paramètres : appel direct du helper bloqué pour un non administrateur');
    }

    for (const [profile, expected] of [
      ['guest', [true, false, false, false, false]],
      ['viewer', [true, false, false, false, false]],
      ['reader', [true, true, false, false, false]],
      ['adder', [true, true, true, false, false]],
      ['reviewer', [true, true, true, true, false]],
      ['noaccess', [false, false, false, false, false]],
      ['admin', [false, false, false, false, true]]
    ]) {
      const rolePage = await openFixture(profile);
      check(await rolePage.evaluate(() => [canViewGlossary(), canProposeGlossary(), canAddGlossary(), canReviewGlossary(), canConfigureGlossary()]), expected, profile + ' : hiérarchie cumulative des capacités');
      check(await rolePage.evaluate(() => canManageGlossary() === canAddGlossary()), true, profile + ' : modification/suppression suivent le niveau ajout direct');
      check(await rolePage.locator('#mainGlossaryTable').count(), expected[0] ? 1 : 0, profile + ' : tableau uniquement avec droit de consultation');
      check(await rolePage.locator('#btnImportExcelGlossary').count(), expected[1] ? 1 : 0, profile + ' : import proposé ou direct selon le niveau');
      check(await rolePage.locator('.js-edit-row').count() > 0, expected[2], profile + ' : modification publiée réservée aux niveaux 3 et 4');
      check(await rolePage.locator('#btnReviewGlossaryProposals').count(), expected[3] ? 1 : 0, profile + ' : validation réservée au niveau 4');
      check(await rolePage.locator('#btnGlossaryTrash').count(), expected[3] ? 1 : 0, profile + ' : corbeille réservée au niveau 4');
      check(await rolePage.locator('#btnGlossarySettings').count(), expected[4] ? 1 : 0, profile + ' : paramètres réservés à l’administration wiki');
      if (!expected[2]) {
        check(await rolePage.evaluate(async () => {
          const before = requests.length;
          await saveRowEdition(document.createElement('button'));
          await executeRowDelete();
          await executeBulkGlossaryDelete();
          await reviewGlossaryProposal(document.createElement('form'), 'approve');
          return requests.length === before;
        }), true, profile + ' : commandes de gestion directes bloquées avant envoi');
      }
      if (!expected[1]) {
        check(await rolePage.evaluate(async () => {
          const before = requests.length;
          await executeExcelImport([{ acronym: 'INTERDIT', label: 'Ne doit pas partir', definition: '' }], false, false);
          return requests.length === before;
        }), true, profile + ' : import direct interdit sans droit de proposition');
      }
      if (!expected[0]) {
        check(await rolePage.locator('.main-term-row,.term-row,.glossary-proposal-card,.glossary-trash-card,.glossary-proposal-status-card').count(), 0, profile + ' : aucune donnée du glossaire dans le DOM sans consultation');
      }
      await rolePage.close();
    }

    check(errors, [], 'aucune erreur JavaScript dans les profils du glossaire');
    console.log(checks + ' vérifications du circuit de validation réussies dans Chromium.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
