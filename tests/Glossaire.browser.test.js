const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

// Le HTML est produit par GlossaireVelocityTest : on teste ainsi le véritable template.
const htmlFile = process.argv[2];
if (!htmlFile) throw new Error('Indiquer le HTML généré par GlossaireVelocityTest.');
const root = path.join(__dirname, '..');
const glossary = path.join(root, 'xwiki/TestPage/PAGE/Glossaire/CODE');
let checks = 0;
function check(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(fs.readFileSync(htmlFile, 'utf8'));
    await page.addStyleTag({ path: path.join(root, 'xwiki/extensions/stylesheet/Accueil-Base.css') });
    await page.addStyleTag({ path: path.join(root, 'xwiki/extensions/stylesheet/Contacts-Base.css') });
    await page.addStyleTag({ path: path.join(glossary, 'GlossaireExtension.css') });
    await page.evaluate(() => {
      window.jQuery = () => ({ modal() {} });
      document.querySelector('#mainGlossaryTable').setAttribute('data-endpoint-url', '/data');
      document.body.insertAdjacentHTML('beforeend', '<div class="naval-home"><header class="nh-header"><h1 class="nh-title">Glossaire</h1><p class="nh-subtitle">Retrouvez ici les acronymes, libellés et définitions du wiki.</p></header></div>');
    });
    await page.addScriptTag({ path: path.join(glossary, 'GlossaireExtension.js') });
    await page.addScriptTag({ path: path.join(glossary, 'GlossairePageExtension.js') });
    await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
    const styles = await page.evaluate(() => {
      const read = selector => {
        const header = document.querySelector(selector);
        const accent = getComputedStyle(header, '::before');
        return ['content', 'width', 'top', 'bottom', 'borderRadius', 'backgroundImage'].map(key => accent[key]);
      };
      return [read('.glossary-page .nh-header'), read('.naval-home .nh-header')];
    });
    check(styles[0], styles[1], 'barre identique à celle de l’accueil');
    await page.screenshot({ path: path.join(path.dirname(htmlFile), 'glossaire-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.evaluate(() => getComputedStyle(document.querySelector('.glossary-page .nh-header'), '::before').width), '3px', 'barre mobile');
    await page.screenshot({ path: path.join(path.dirname(htmlFile), 'glossaire-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.evaluate(() => {
      document.querySelectorAll('.main-term-row, .term-row').forEach(row => row.remove());
      appendImportedGlossaryRow({ acronym: 'API', label: 'Interface', definition: 'Ancien texte' }, 'TestPage.PAGE.Glossaire.DATA.API', 'API');
      window.requests = [];
      window.nextReply = { ok: true, text: 'GLOSSAIRE_OK' };
      window.fetch = async (url, options) => {
        requests.push(Object.fromEntries(options.body));
        const reply = nextReply;
        return { ok: reply.ok, text: async () => reply.text };
      };
    });
    const renamedRef = 'TestPage.PAGE.Glossaire.DATA.A\\.B|" +%';
    await page.evaluate(ref => {
      const row = document.querySelector('.main-term-row');
      toggleEditMode(row.querySelector('.js-edit-row'), true);
      row.querySelector('.edit-acronym').value = 'A.B|" +%';
      row.querySelector('.edit-label').value = 'Nouveau libellé';
      row.querySelector('.edit-definition').value = 'Nouveau texte';
      nextReply.text = 'GLOSSAIRE_OK|' + encodeURIComponent(ref) + '|' + encodeURIComponent('A.B|" +%');
      return saveRowEdition(row.querySelector('.js-save-row'));
    }, renamedRef);
    check(await page.locator('.main-term-row').getAttribute('data-full-ref'), renamedRef, 'nouvelle référence après renommage');
    check(await page.locator('#popupCheckTable .term-row').getAttribute('data-full-ref'), renamedRef, 'référence de la modale synchronisée');
    await page.evaluate(async () => {
      nextReply.text = 'GLOSSAIRE_OK';
      openDeleteModal(document.querySelector('.js-delete-row'));
      await executeRowDelete();
    });
    check(await page.locator('.main-term-row, .term-row').count(), 0, 'suppression des deux tableaux');
    check(await page.evaluate(() => requests.at(-1).targetRef), renamedRef, 'suppression envoyée à la nouvelle référence');

    await page.evaluate(async () => {
      appendImportedGlossaryRow({ acronym: 'API', label: 'Interface', definition: 'Ancien texte' }, 'TestPage.PAGE.Glossaire.DATA.API', 'API');
      const row = document.querySelector('.main-term-row');
      document.querySelector('#filterDefinition').value = 'nouveau';
      filterMainTableColumns();
      toggleEditMode(row.querySelector('.js-edit-row'), true);
      row.querySelector('.edit-definition').value = 'Nouveau texte';
      nextReply.text = 'GLOSSAIRE_OK|' + encodeURIComponent(row.dataset.fullRef) + '|API';
      await saveRowEdition(row.querySelector('.js-save-row'));
    });
    check(await page.locator('.main-term-row').isVisible(), true, 'filtre recalculé après modification');
    await page.evaluate(() => {
      document.querySelector('#filterDefinition').value = 'ancien';
      filterMainTableColumns();
    });
    check(await page.locator('.main-term-row').isVisible(), false, 'le filtre ignore les anciennes valeurs des champs masqués');

    for (const reply of [{ ok: false, text: 'GLOSSAIRE_OK' }, { ok: true, text: 'GLOSSAIRE_ERROR|échec GLOSSAIRE_OK' }]) {
      await page.evaluate(async reply => {
        document.querySelector('#filterDefinition').value = '';
        filterMainTableColumns();
        nextReply = reply;
        openDeleteModal(document.querySelector('.js-delete-row'));
        await executeRowDelete();
      }, reply);
      check(await page.locator('.main-term-row').count(), 1, 'échec de suppression : ligne conservée');
    }
    await page.evaluate(async () => {
      const row = document.querySelector('.main-term-row');
      toggleEditMode(row.querySelector('.js-edit-row'), true);
      row.querySelector('.edit-acronym').value = 'CHANGED';
      nextReply = { ok: true, text: 'GLOSSAIRE_OK' };
      await saveRowEdition(row.querySelector('.js-save-row'));
    });
    check(await page.locator('.main-term-row').getAttribute('data-acronym'), 'API', 'réponse sans nouvelle référence refusée');
    const concurrency = await page.evaluate(async () => {
      const row = document.querySelector('.main-term-row');
      let release;
      const count = requests.length;
      window.fetch = async (url, options) => {
        requests.push(Object.fromEntries(options.body));
        await new Promise(resolve => { release = resolve; });
        return { ok: true, text: async () => 'GLOSSAIRE_OK|' + encodeURIComponent(row.dataset.fullRef) + '|API' };
      };
      const first = saveRowEdition(row.querySelector('.js-save-row'));
      const second = saveRowEdition(row.querySelector('.js-save-row'));
      const disabled = Array.from(row.querySelectorAll('.edit-buttons button')).every(button => button.disabled);
      release(); await Promise.all([first, second]);
      return [requests.length - count, disabled, row.querySelector('.js-save-row').disabled];
    });
    check(concurrency, [1, true, false], 'double enregistrement bloqué et boutons réactivés');
    await page.evaluate(async () => {
      window.fetch = async (url, options) => {
        requests.push(Object.fromEntries(options.body));
        return { ok: true, text: async () => 'ROW_OK|0|TestPage.PAGE.Glossaire.DATA.X%5C.Y%7C%22|X.Y%7C%22\nGLOSSAIRE_IMPORT_OK|1|0|1' };
      };
      await executeExcelImport([{ acronym: 'X.Y|"', label: 'Importé', definition: 'Texte' }], false, false);
    });
    check(await page.locator('.main-term-row[data-doc-name="X.Y|\\""]').count(), 1, 'import : ligne créée avec caractères spéciaux');
    const bulk = await page.evaluate(async () => {
      const rows = Array.from(document.querySelectorAll('.main-term-row'));
      rows.forEach(row => row.querySelector('.glossary-row-select').checked = true);
      window.confirm = () => true;
      window.fetch = async (url, options) => ({
        ok: true,
        text: async () => options.body.get('targetRef').includes('X\\.Y') ? 'GLOSSAIRE_ERROR|échec' : 'GLOSSAIRE_OK'
      });
      await executeBulkGlossaryDelete();
      return [document.querySelectorAll('.main-term-row').length, document.querySelectorAll('.term-row').length, document.querySelector('.main-term-row').dataset.docName];
    });
    check(bulk, [1, 1, 'X.Y|"'], 'suppression multiple : seules les suppressions réussies retirent les lignes');
    const duplicates = await page.evaluate(() => fixedAnalyzeExcelRows([
      ['constructor', 'toString', 'Définition'], ['__proto__', 'valueOf', 'Définition'], ['constructor', 'Autre', 'Définition']
    ], { detected: false, map: { acronym: 0, label: 1, definition: 2 } }).map(row => [row.duplicateAcronym, row.duplicateLabel]));
    check(duplicates, [[false, false], [false, false], [true, false]], 'doublons Excel sans faux positifs issus des propriétés JavaScript');
    await page.evaluate(() => {
      document.querySelectorAll('.main-term-row, .term-row').forEach(row => row.remove());
      for (let i = 0; i < 11; i++) appendImportedGlossaryRow({ acronym: 'T' + i, label: 'Terme', definition: '' }, 'TestPage.PAGE.Glossaire.DATA.T' + i, 'T' + i);
      document.querySelector('#pageSizeSelect').value = '10';
      currentPage = 2; applyPagination();
      document.querySelectorAll('.main-term-row')[10].remove();
      applyPagination();
    });
    check(await page.locator('#pageIndicator').innerText(), 'Page 1 / 1', 'pagination ajustée après suppression de la dernière ligne');
    check(errors, [], 'aucune erreur JavaScript dans le navigateur');
    console.log(checks + ' vérifications navigateur réussies.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
