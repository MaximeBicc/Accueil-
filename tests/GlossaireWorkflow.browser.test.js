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
      window.reply = { ok: true, text: 'GLOSSAIRE_PROPOSED|TestPage.PAGE.Glossaire.PROPOSITIONS.nouvelle' };
      window.fetch = async (url, options) => {
        requests.push({ url, values: Object.fromEntries(options.body) });
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
    check(await reader.locator('.js-edit-row,.js-delete-row,#btnImportExcelGlossary,#btnBulkDeleteModeGlossary,#btnReviewGlossaryProposals').count(), 0, 'hors groupe : aucune commande de gestion');
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
      await executeExcelImport([], false, false);
      await executeBulkGlossaryDelete();
      if (requests.length !== count) throw new Error('Une commande de gestion a été envoyée hors groupe');
    });
    check(await reader.locator('#glossaryCreateForm [type="submit"]').isDisabled(), false, 'bouton réactivé après erreur');
    await reader.screenshot({ path: path.join(fixtureDirectory, 'glossaire-contributeur.png'), fullPage: true });

    const reviewer = await openFixture('reviewer');
    check(await reviewer.locator('#glossaryProposalCount').innerText(), '2', 'compteur des propositions en attente');
    const badgePosition = await reviewer.evaluate(() => {
      const badge = getComputedStyle(document.querySelector('#glossaryProposalCount'));
      const button = getComputedStyle(document.querySelector('#btnReviewGlossaryProposals'));
      return [badge.position, button.position, parseFloat(badge.top) < 0, parseFloat(badge.right) < 0];
    });
    check(badgePosition, ['absolute', 'relative', true, true], 'badge placé en haut à droite du bouton');
    check(await reviewer.locator('.glossary-proposal-card').count(), 2, 'liste contenant les deux demandes');
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
        return { ok: true, text: async () => 'GLOSSAIRE_REJECTED' };
      };
      const card = document.querySelector('.glossary-proposal-card');
      card.querySelector('[name="comment"]').value = 'Terme déjà couvert par la définition existante.';
      await reviewGlossaryProposal(card, 'reject');
    });
    check(await reviewer.locator('.main-term-row').count(), countBeforeReject, 'aucune publication lors du refus');
    check(await reviewer.locator('#glossaryProposalCount').innerText(), '0', 'compteur mis à zéro');
    check(await reviewer.locator('#glossaryProposalsEmpty').isVisible(), false, 'modale fermée par défaut');
    check(await reviewer.locator('#glossaryProposalsEmpty').getAttribute('class').then(value => value.includes('is-hidden')), false, 'état vide prêt à être affiché');
    const rowsBeforeCreate = await reviewer.locator('.main-term-row').count();
    const creationEventHandled = await reviewer.evaluate(async () => {
      window.fetch = async (url, options) => {
        requests.push({ url, values: Object.fromEntries(options.body) });
        return { ok: true, text: async () => 'GLOSSAIRE_OK|' + encodeURIComponent('TestPage.PAGE.Glossaire.DATA.DIRECT\\.API') + '|' + encodeURIComponent('DIRECT.API') };
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
    check(await reviewer.locator('.main-term-row[data-doc-name="DIRECT.API"]').getAttribute('data-full-ref'), 'TestPage.PAGE.Glossaire.DATA.DIRECT\\.API', 'référence canonique de création conservée');
    check(await reviewer.locator('#popupCheckTable .term-row').evaluateAll(rows => rows.filter(row => row.getAttribute('data-full-ref') === 'TestPage.PAGE.Glossaire.DATA.DIRECT\\.API').length), 1, 'ajout direct synchronisé dans les deux tableaux');
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
    check(errors, [], 'aucune erreur JavaScript dans les trois profils');
    console.log(checks + ' vérifications du circuit de validation réussies dans Chromium.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
