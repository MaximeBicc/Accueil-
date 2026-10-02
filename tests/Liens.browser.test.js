const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

// HTML produit par LiensVelocityTest et bibliothèques réelles dans assetsDir.
const html = fs.readFileSync(process.argv[2] || '/tmp/liens-rendered.html', 'utf8');
const assetsDir = process.argv[3] || '/tmp';
const root = path.resolve('xwiki/TestPage/PAGE/Lien-test/extensions');
const scripts = fs.readdirSync(root).filter(name => name.endsWith('.js')).sort();
const css = fs.readFileSync(path.join(root, '05-hide-type-column.css'), 'utf8');
const readAsset = name => fs.readFileSync(path.join(assetsDir, `liens-${name}`), 'utf8');
let checks = 0;
function check(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
function fields(request) {
  const values = {};
  const body = request.postData() || '';
  const re = /name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n--/g;
  for (const match of body.matchAll(re)) values[match[1]] = match[2];
  return values;
}
const encode = value => encodeURIComponent(value);
const row = values => 'LIEN_ROW|' + values.map(encode).join('|');
const list = row(['TestPage.PAGE.Liens.DATA.LIENDATA.Test.A00', 'A00', 'Groupe pair', 'Définition 0', 'personnel', 'Test']) +
  row(['TestPage.PAGE.Liens.DATA.LIENDATA.Test.C00', 'C00', 'Libellé C00', 'Définition', 'commun', 'Test']) +
  row(['TestPage.PAGE.Liens.DATA.LIENDATA.Autre.Secret', 'Secret', 'Masqué', '', 'personnel', 'Autre']) + 'LIEN_LIST_OK|Test|true';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    async function setup(late = false, manager = true) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      const alerts = [];
      let mode = '';
      const requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.accept(); });
      await page.route('https://wiki.test/**', async route => {
        const request = route.request();
        if (request.method() === 'POST') {
          const data = fields(request);
          requests.push(data);
          if (mode === 'http') return route.fulfill({ status: 500, body: 'Erreur' });
          if (mode === 'network') return route.abort();
          if (mode === 'delay') await new Promise(resolve => setTimeout(resolve, 100));
          let body;
          if (data.action === 'listVisible') body = manager ? list : list.replace('LIEN_LIST_OK|Test|true', 'LIEN_LIST_OK|Test|false');
          else if (mode === 'refuse') body = 'ERREUR_SUPPRESSION';
          else if (data.action === 'save') body = 'GLOSSAIRE_OK|' + encode('TestPage.PAGE.Liens.DATA.LIENDATA.Test.' + data.acronym) + '|' + encode(data.acronym);
          else body = 'GLOSSAIRE_OK';
          return route.fulfill({ contentType: 'text/plain', body });
        }
        if (request.url().endsWith('/liens')) {
          let body = html;
          if (!manager) body = body.replace(/<option value="commun" name="type">Commun<\/option>/g, '<option value="commun" disabled>Commun</option>');
          const prefix = '<!doctype html><html><head><meta charset="utf-8"><style>' + readAsset('bootstrap.css') + css + '</style>' +
            '<script>' + readAsset('jquery.js') + '</script><script>' + readAsset('bootstrap.js') + '</script>';
          const source = scripts.map(name => '<script>' + fs.readFileSync(path.join(root, name), 'utf8') + '</script>').join('');
          return route.fulfill({ contentType: 'text/html', body: prefix + (late ? '' : source) + '</head><body>' + body + '</body></html>' });
        }
        return route.fulfill({ status: 404, body: '' });
      });
      await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({ contentType: 'application/javascript', body: readAsset('sheetjs.js') }));
      await page.goto('https://wiki.test/liens');
      if (late) for (const name of scripts) await page.addScriptTag({ content: fs.readFileSync(path.join(root, name), 'utf8') });
      await page.waitForSelector('#btnExcelExampleLiens');
      await page.waitForFunction(() => document.querySelectorAll('#popupCheckTable .term-row').length === 2);
      return { page, errors, alerts, requests, setMode: value => { mode = value; } };
    }
    const state = await setup();
    const { page } = state;
    const visible = id => page.locator(`#${id} tbody > tr`).evaluateAll(rows => rows.filter(row => row.style.display !== 'none').length);
    check(await visible('mainGlossaryTable'), 10, 'pagination initiale personnelle');
    check(await visible('secondaryGlossaryTable'), 10, 'pagination initiale commune');
    await page.click('#btnNextPage1');
    check(await page.locator('#pageIndicator1').textContent(), 'Page 2 / 3', 'page suivante');
    await page.click('#btnPrevPage1');
    check(await page.locator('#pageIndicator1').textContent(), 'Page 1 / 3', 'page précédente');
    await page.fill('#filterLabel', 'Groupe pair');
    check(await page.locator('#pageIndicator1').textContent(), 'Page 1 / 2', 'filtre et compteur');
    await page.fill('#filterDefinition', 'Définition 2');
    check(await visible('mainGlossaryTable'), 5, 'filtres croisés par ET');
    await page.selectOption('#pageSizeSelect1', 'all');
    check(await visible('mainGlossaryTable'), 5, 'tout afficher respecte les filtres');
    await page.fill('#filterAcronym', 'inexistant');
    check(await visible('mainGlossaryTable'), 0, 'tout afficher masque les non-correspondances');
    await page.selectOption('#pageSizeSelect1', '5');
    check(await page.locator('#btnNextPage1').isDisabled(), true, 'aucun résultat désactive suivant');
    await page.fill('#filterAcronym', '');
    await page.fill('#filterDefinition', '');
    await page.fill('#filterLabel', '');
    await page.selectOption('#pageSizeSelect1', '10');
    await page.fill('#filterDefinition', '0Définition 0');
    check(await visible('mainGlossaryTable'), 0, 'texte des textarea cachés ignoré');
    await page.fill('#filterDefinition', '');
    await page.click('.tablinks:nth-of-type(2)');
    await page.fill('#filterProprietaire2', 'Test');
    await page.fill('#filterAcronym2', 'C1');
    check(await visible('secondaryGlossaryTable'), 7, 'filtre commun par créateur et acronyme');
    await page.selectOption('#pageSizeSelect2', '5');
    await page.click('#btnNextPage2');
    check(await visible('secondaryGlossaryTable'), 2, 'dernière page commune');
    await page.selectOption('#pageSizeSelect2', 'all');
    await page.fill('#filterAcronym2', 'C00');
    check(await visible('secondaryGlossaryTable'), 1, 'tout afficher commun');
    await page.fill('#filterAcronym2', '');
    await page.evaluate(() => {
      const row = document.querySelector('#secondaryGlossaryTable .secondary-term-row');
      const select = row.querySelector('.secondary-proprietaire-value');
      select.add(new Option('Autre auteur', 'Autre'));
      const button = row.querySelector('.view-buttons button');
      toggleEditMode2(button, true); select.value = 'Autre'; toggleEditMode2(button, false);
    });
    check(await page.locator('#secondaryGlossaryTable .secondary-proprietaire-value').first().inputValue(), 'Test', 'annulation restaure le créateur');
    await page.click('.tablinks:nth-of-type(1)');
    await page.fill('#filterAcronym', 'A0');
    await page.click('#mainGlossaryTable .liens-sort-btn[data-column="acronym"]');
    check(await page.locator('#mainGlossaryTable .main-term-row:visible .main-acronym .view-mode').first().textContent(), 'A09', 'tri conserve le filtre et la pagination');
    const bar = await page.locator('.li-header-accent').evaluate(el => {
      const rect = el.getBoundingClientRect(); const style = getComputedStyle(el);
      return { width: rect.width, height: rect.height, background: style.backgroundImage };
    });
    check(bar.width, 3, 'barre de 3px');
    check(bar.height > 70 && bar.background.includes('rgb(23, 63, 152)') && bar.background.includes('rgb(239, 35, 60)'), true, 'barre bleu et rouge couvrant titre et sous-titre');
    await page.screenshot({ path: '/tmp/liens-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.locator('.li-header-accent').isVisible(), true, 'barre visible sur mobile');
    check(await page.locator('#filterAcronym').evaluate(el => el.getBoundingClientRect().width > 60), true, 'filtre utilisable sur mobile');
    await page.screenshot({ path: '/tmp/liens-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Enregistrement d'un texte qui sort du filtre courant et contient du HTML.
    await page.fill('#filterAcronym', 'A09');
    const personal = page.locator('#mainGlossaryTable .main-term-row:visible').first();
    await personal.locator('.view-buttons button').first().click();
    await personal.locator('.edit-acronym').fill('<img src=x onerror=alert(1)>|"');
    state.setMode('delay');
    await personal.locator('.edit-buttons button').first().evaluate(button => Promise.all([saveRowEdition(button), saveRowEdition(button)]));
    check(state.requests.filter(req => req.action === 'save').length, 1, 'double enregistrement bloqué');
    check(await visible('mainGlossaryTable'), 0, 'filtre recalculé après modification');
    check(await page.locator('#mainGlossaryTable .main-acronym img').count(), 0, 'acronyme traité comme texte');
    await page.fill('#filterAcronym', '<img');
    const changed = page.locator('#mainGlossaryTable .main-term-row:visible').first();
    state.setMode('refuse');
    await changed.locator('.view-buttons button').nth(1).click();
    await page.click('#btnConfirmDelete');
    check(await changed.count(), 1, 'suppression refusée conserve la ligne');
    state.setMode('');
    await changed.locator('.view-buttons button').nth(1).click();
    await page.click('#btnConfirmDelete');
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('#mainGlossaryTable .main-acronym .view-mode')).some(el => el.textContent.includes('<img')));
    check(await visible('mainGlossaryTable'), 0, 'suppression avec référence spéciale');
    await page.fill('#filterAcronym', '');
    // Une réponse HTTP en erreur ne valide pas un enregistrement.
    await page.fill('#filterAcronym', 'A00');
    const failedRow = page.locator('#mainGlossaryTable .main-term-row:visible').first();
    await failedRow.locator('.view-buttons button').first().click();
    await failedRow.locator('.edit-label').fill('Ne pas enregistrer');
    state.setMode('http');
    await failedRow.locator('.edit-buttons button').first().evaluate(button => saveRowEdition(button));
    check(await failedRow.locator('.main-label .view-mode').textContent(), 'Groupe pair', 'erreur HTTP conserve les valeurs');
    check(await failedRow.locator('.edit-buttons button').first().isEnabled(), true, 'erreur HTTP réactive Enregistrer');
    await failedRow.locator('.edit-buttons button').nth(1).click();
    state.setMode('');
    await page.fill('#filterAcronym', '');
    // Plusieurs éditions : le type reste visible tant qu'une autre ligne est éditée.
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('#mainGlossaryTable .view-buttons button:first-child');
      toggleEditMode(buttons[0], true); toggleEditMode(buttons[1], true); toggleEditMode(buttons[0], false);
    });
    check(await page.locator('#mainGlossaryTable').evaluate(el => el.classList.contains('hide-type-column')), false, 'type visible pour les éditions restantes');
    await page.evaluate(() => document.querySelectorAll('#mainGlossaryTable .view-buttons button:first-child').forEach(button => toggleEditMode(button, false)));
    // Bootstrap réel : contenu des modales au-dessus du fond et filtre OU.
    await page.click('button[data-target="#glossaryModal"]');
    await page.waitForSelector('#glossaryModal.in');
    await page.fill('#liensNomInputField', 'A00');
    check(await page.locator('#popupCheckTable .term-row:visible').count(), 1, 'filtre de la popup');
    await page.fill('#liensInputField', 'Libellé C00');
    check(await page.locator('#popupCheckTable .term-row:visible').count(), 2, 'filtre OU de la popup');
    check(await page.locator('#glossaryModal').evaluate(el => Number(getComputedStyle(el).zIndex) > Number(getComputedStyle(document.querySelector('.modal-backdrop')).zIndex)), true, 'modale au-dessus du backdrop');
    await page.click('#glossaryModal button[data-dismiss="modal"]');
    await page.waitForSelector('#glossaryModal.in', { state: 'hidden' });
    // Lecture et import d'un vrai fichier XLSX.
    await page.addScriptTag({ content: readAsset('sheetjs.js') });
    const bytes = await page.evaluate(() => {
      const sheet = XLSX.utils.aoa_to_sheet([['Acronyme', 'Libellé', 'Définition', 'Type', 'Auteur'], ['constructor', 'toString', 'Test', 'personnel', 'Test'], ['A00', 'Groupe pair', 'Test', 'commun', 'Test']]);
      const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Liens');
      return Array.from(new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' })));
    });
    await page.locator('#excelLiensFileInput').setInputFiles({ name: 'liens.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(bytes) });
    await page.waitForSelector('#excelLiensModal.in');
    check(await page.locator('#excelLiensPreviewBody tr').count(), 2, 'lecture XLSX réelle');
    check(await page.locator('#excelLiensDuplicatesBody tr').count(), 1, 'constructor et toString ne sont pas des faux doublons');
    state.setMode('refuse');
    await page.locator('#btnConfirmExcelLiensImport').evaluate(button => { button.click(); button.click(); });
    await page.waitForSelector('#excelLiensModal.in', { state: 'hidden' });
    check(state.requests.filter(req => req.action === 'create').length, 1, 'import ignore le doublon et bloque le double clic');
    check(state.requests.find(req => req.action === 'create').acronym, 'constructor', 'import transmet le bon acronyme');
    state.setMode('');
    await page.locator('#excelLiensFileInput').setInputFiles({ name: 'liens.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(bytes) });
    await page.waitForSelector('#excelLiensModal.in');
    await Promise.all([page.waitForNavigation(), page.click('#btnConfirmExcelLiensImport')]);
    await page.waitForSelector('#btnBulkDeleteModeLiens');
    check(state.requests.filter(req => req.action === 'create').length, 2, 'import réussi recharge les tableaux');
    // Réseau en échec pendant suppression multiple : garder les lignes et rétablir l'UI.
    await page.fill('#filterAcronym', 'A00');
    await page.click('#btnBulkDeleteModeLiens');
    await page.locator('#mainGlossaryTable .liens-select-all-visible').check();
    state.setMode('network');
    const before = await page.locator('#mainGlossaryTable .main-term-row').count();
    await page.click('#btnBulkDeleteLiens');
    await page.waitForFunction(() => document.querySelector('#btnBulkDeleteLiens').classList.contains('is-hidden'));
    check(await page.locator('#mainGlossaryTable .main-term-row').count(), before, 'échec réseau en suppression multiple conserve les lignes');
    check(state.errors, [], 'aucune exception navigateur');
    await page.close();
    const late = await setup(true);
    check(await late.page.locator('#mainGlossaryTable .main-term-row:visible').count(), 10, 'extensions chargées après DOMContentLoaded');
    await late.page.fill('#filterAcronym', 'A00');
    check(await late.page.locator('#mainGlossaryTable .main-term-row:visible').count(), 1, 'filtre après chargement tardif');
    check(late.errors, [], 'aucune exception chargement tardif');
    await late.page.close();
    const nonManager = await setup(false, false);
    await nonManager.page.click('.tablinks:nth-of-type(2)');
    check(await nonManager.page.locator('#btnBulkDeleteModeLiens').isVisible(), false, 'suppression commune masquée pour non-manager');
    check(await nonManager.page.locator('#secondaryGlossaryTable .view-buttons button:visible').count(), 0, 'actions communes masquées pour non-manager');
    check(nonManager.errors, [], 'aucune exception non-manager');
    await nonManager.page.close();
    console.log(`${checks} vérifications Chromium réussies.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
