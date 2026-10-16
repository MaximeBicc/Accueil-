const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

// HTML produit par LiensVelocityTest et bibliothèques réelles dans assetsDir.
const html = fs.readFileSync(process.argv[2] || '/tmp/liens-rendered.html', 'utf8');
const authorResponse = fs.readFileSync((process.argv[2] || '/tmp/liens-rendered.html') + '.authors.txt', 'utf8');
const qualifiedAuthors = authorResponse.split('\n').map(line => {
  if (!line.startsWith('LIEN_AUTHOR|Login42|')) return line;
  const parts = line.split('|'); parts[1] = encodeURIComponent('xwiki:XWiki.Login42'); parts[4] = parts[1]; return parts.join('|');
}).join('\n');
const assetsDir = process.argv[3] || '/tmp';
const root = path.resolve('xwiki/TestPage/PAGE/Lien-test/extensions');
const scripts = fs.readdirSync(root).filter(name => name.endsWith('.js')).sort();
const css = fs.readFileSync(path.join(root, '05-hide-type-column.css'), 'utf8');
const readAsset = name => fs.readFileSync(path.join(assetsDir, `liens-${name}`), 'utf8');
let checks = 0;
function check(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
function fields(request) {
  if ((request.headers()['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(request.postData() || ''));
  const values = {};
  const body = request.postData() || '';
  const re = /name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n--/g;
  for (const match of body.matchAll(re)) values[match[1]] = match[2];
  return values;
}
function modalAboveBackdrop(id) {
  const content = document.querySelector('#' + id + ' .modal-content');
  if (!content) return false;
  const rect = content.getBoundingClientRect();
  return content.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + 20));
}
const encode = value => encodeURIComponent(value);
const row = values => 'LIEN_ROW|' + values.map(encode).join('|');
const list = row(['TestPage.PAGE.Liens.DATA.LIENDATA.Test.A00', 'A00', 'Groupe pair', 'Définition 0', 'personnel', 'Test']) +
  row(['TestPage.PAGE.Liens.DATA.LIENDATA.Test.C00', 'C00', 'Libellé C00', 'Définition', 'commun', 'Test']) +
  row(['TestPage.PAGE.Liens.DATA.LIENDATA.Autre.Secret', 'Secret', 'Masqué', '', 'personnel', 'Autre']) + 'LIEN_LIST_OK|Test|true|true|true|true|true';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    async function setup(late = false, manager = true) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      const alerts = [];
      let mode = '';
      let currentAuthors = authorResponse;
      let pageCounter = 0;
      const requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.accept(); });
      await page.route('https://wiki.test/**', async route => {
        const request = route.request();
        if (request.method() === 'POST') {
          const data = fields(request);
          requests.push(data);
          if (data.action === 'listAuthors') return route.fulfill({ status: mode === 'authorsUnavailable' ? 503 : 200, contentType: 'text/plain', body: mode === 'authorsUnavailable' ? 'Service indisponible' : currentAuthors });
          if (mode === 'http') return route.fulfill({ status: 500, body: 'Erreur' });
          if (mode === 'network') return route.abort();
          if (mode === 'delay') await new Promise(resolve => setTimeout(resolve, 100));
          let body;
          if (data.action === 'listVisible') body = manager ? list : list.replace('LIEN_LIST_OK|Test|true|true|true|true|true', 'LIEN_LIST_OK|Test|false|true|true|true|false');
          else if (mode === 'refuse') body = 'ERREUR_SUPPRESSION';
          else if (data.action === 'save') {
            const oldName = data.targetRef.split('.').at(-1);
            const technicalName = /^[A-Za-z0-9]{16}$/.test(oldName) ? oldName : 'Fiche' + String(++pageCounter).padStart(11, '0');
            body = 'GLOSSAIRE_OK|' + encode('TestPage.PAGE.Liens.DATA.LIENDATA.' + data.proprietaire + '.' + technicalName) + '|' + technicalName;
          }
          else body = 'GLOSSAIRE_OK';
          return route.fulfill({ contentType: 'text/plain', body });
        }
        if (request.url().endsWith('/liens')) {
          let body = html;
          if (!manager) body = body.replace(/<option value="commun" name="type">Commun<\/option>/g, '<option value="commun" disabled>Commun</option>').replace('data-can-write-common="true"', 'data-can-write-common="false"');
          const prefix = '<!doctype html><html><head><meta charset="utf-8"><style>' + readAsset('bootstrap.css') + css + '</style>' +
            '<script>' + readAsset('jquery.js') + '</script><script>' + readAsset('bootstrap.js') + '</script>';
          const source = scripts.map(name => '<script>' + fs.readFileSync(path.join(root, name), 'utf8') + '</script>').join('');
          return route.fulfill({ contentType: 'text/html', body: prefix + (late ? '' : source) + '</head><body><div id="xwikicontent" style="position:relative;isolation:isolate;z-index:0">' + body + '</div></body></html>' });
        }
        return route.fulfill({ status: 404, body: '' });
      });
      await page.route('https://cdn.sheetjs.com/**', route => route.fulfill({ contentType: 'application/javascript', body: readAsset('sheetjs.js') }));
      await page.goto('https://wiki.test/liens');
      if (late) for (const name of scripts) await page.addScriptTag({ content: fs.readFileSync(path.join(root, name), 'utf8') });
      await page.waitForSelector('#btnExcelExampleLiens');
      await page.waitForFunction(() => document.querySelectorAll('#popupCheckTable .term-row').length === 2);
      return { page, errors, alerts, requests, setMode: value => { mode = value; }, setAuthors: value => { currentAuthors = value; } };
    }
    const state = await setup();
    const { page } = state;
    const visible = id => page.locator(`#${id} tbody > tr`).evaluateAll(rows => rows.filter(row => row.style.display !== 'none').length);
    // Conteneur XWiki isolé : vérifier l'ordre réel des couches pour chaque popup.
    for (const id of ['actionFeedbackModal', 'deleteConfirmModal', 'deleteConfirmModal2', 'glossaryModal', 'excelExampleLiensModal', 'excelLiensModal']) {
      await page.evaluate(id => jQuery('#' + id).modal('show'), id);
      await page.waitForFunction(modalAboveBackdrop, id);
      check(await page.locator('#' + id).evaluate(el => el.parentNode === document.body), true, 'popup sous body ' + id);
      check(await page.evaluate(modalAboveBackdrop, id), true, 'popup au-dessus du fond noir ' + id);
      await page.evaluate(id => jQuery('#' + id).modal('hide'), id);
      await page.waitForFunction(id => getComputedStyle(document.getElementById(id)).display === 'none' && !document.querySelector('.modal-backdrop'), id);
    }

    // Vérifier les dimensions avant le premier clic et après inversion du tri.
    for (const [tab, table] of [[1, 'mainGlossaryTable'], [2, 'secondaryGlossaryTable']]) {
      await page.click(`.tablinks:nth-of-type(${tab})`);
      const button = page.locator(`#${table} .liens-sort-btn[data-column="acronym"]`);
      const measure = el => {
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height, fontSize: getComputedStyle(el).fontSize };
      };
      const initial = await button.evaluate(measure);
      const reference = await page.evaluate(tableId => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-default btn-xs sort-column-btn';
        button.innerHTML = '<span class="sort-label">A ' + document.getElementById(tableId).getAttribute('data-icon-right') + ' Z</span>';
        document.querySelector('.liens-page').appendChild(button);
        const rect = button.getBoundingClientRect();
        const result = { width: rect.width, height: rect.height, fontSize: getComputedStyle(button).fontSize };
        button.remove();
        return result;
      }, table);
      check(initial, reference, 'dimensions identiques au bouton Glossaire ' + table);
      check(await button.locator('.sort-label').evaluate((el, tableId) => el.innerHTML === 'A ' + document.getElementById(tableId).getAttribute('data-icon-right') + ' Z', table), true, 'icône XWiki identique au Glossaire ' + table);
      await button.click();
      check(await button.evaluate(measure), initial, 'dimensions stables après clic ' + table);
      check(await button.locator('.sort-label').evaluate((el, tableId) => el.innerHTML === 'Z ' + document.getElementById(tableId).getAttribute('data-icon-right') + ' A', table), true, 'icône XWiki conservée après inversion ' + table);
      await button.click();
    }
    check(await page.locator('.liens-sort-btn[data-column="type"], .col-type .liens-sort-btn').count(), 0, 'aucun tri dans Type');
    await page.click('.tablinks:nth-of-type(1)');
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
    const technicalRef = await changed.getAttribute('data-full-ref');
    check(/\.[A-Za-z0-9]{16}$/.test(technicalRef), true, 'édition personnelle utilise la référence technique retournée par DATA');
    check(await changed.getAttribute('data-doc-name'), technicalRef.split('.').at(-1), 'nom technique séparé de l’acronyme affiché');
    await changed.locator('.view-buttons button').first().click();
    await changed.locator('.edit-definition').fill('Définition sur la même fiche');
    await changed.locator('.edit-buttons button').first().evaluate(button => saveRowEdition(button));
    check(state.requests.filter(req => req.action === 'save').at(-1).targetRef, technicalRef, 'édition suivante adresse la fiche par son identifiant');
    check(await changed.getAttribute('data-full-ref'), technicalRef, 'adresse technique stable après une deuxième édition');
    state.setMode('refuse');
    await changed.locator('.view-buttons button').nth(1).click();
    await page.click('#btnConfirmDelete');
    check(await changed.count(), 1, 'suppression refusée conserve la ligne');
    state.setMode('');
    await changed.locator('.view-buttons button').nth(1).click();
    await page.click('#btnConfirmDelete');
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('#mainGlossaryTable .main-acronym .view-mode')).some(el => el.textContent.includes('<img')));
    check(await visible('mainGlossaryTable'), 0, 'suppression avec référence technique');
    check(state.requests.filter(req => req.action === 'delete').at(-1).targetRef, technicalRef, 'suppression utilise la nouvelle référence de la fiche');
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
    // L'édition recharge les mêmes auteurs autorisés que l'import.
    await page.click('[data-liens-tab="Tab2"]');
    await page.fill('#filterProprietaire2', '');
    const common = page.locator('#secondaryGlossaryTable .secondary-term-row').first();
    state.setAuthors(qualifiedAuthors);
    await common.locator('.secondary-proprietaire-value').evaluate(select => {
      select.add(new Option('Jean Dupont', 'xwiki:XWiki.Login42')); select.value = 'xwiki:XWiki.Login42';
    });
    await common.locator('.view-buttons button').first().click();
    await common.evaluate(row => new Promise(resolve => {
      const poll = () => row.dataset.authorLoading === 'false' && row.querySelector('.secondary-proprietaire-value').dataset.authorValidationReady === 'true' ? resolve() : setTimeout(poll, 10);
      poll();
    }));
    check(await common.locator('.secondary-proprietaire-value option[value="Login42"]').count(), 1, 'édition recharge le membre autorisé depuis DATA');
    check(await common.locator('.secondary-proprietaire-value').inputValue(), 'Login42', 'ancienne sélection qualifiée devient un userid court valide');
    check(await common.locator('.secondary-proprietaire-value option[value="xwiki:XWiki.Login42"]').count(), 0, 'aucune référence complète utilisée comme valeur du sélecteur');
    check(await common.locator('.secondary-proprietaire-value option[value="NonAuteur"]').count(), 0, 'édition exclut le compte hors groupes');
    await common.locator('.secondary-proprietaire-value').selectOption('Login42');
    await common.locator('.edit-buttons button').first().evaluate(button => saveRowEdition2(button));
    check(state.requests.filter(request => request.action === 'save').at(-1).proprietaire, 'Login42', 'édition envoie le membre autorisé choisi');
    check(await common.locator('.secondary-proprietaire .view-mode').textContent(), 'Jean Dupont (Login42)', 'édition affiche le nom du membre choisi');
    const commonRef = await common.getAttribute('data-full-ref');
    check(/^TestPage\.PAGE\.Liens\.DATA\.LIENDATA\.Login42\.[A-Za-z0-9]{16}$/.test(commonRef), true, 'édition commune utilise un identifiant technique sous le userid');
    check(await page.locator('#popupCheckTable .term-row').filter({ hasText: 'C00' }).getAttribute('data-full-ref'), commonRef, 'popup de vérification synchronisée avec la nouvelle référence');
    state.setAuthors(authorResponse.split('\n').filter(line => !line.startsWith('LIEN_AUTHOR|Login42|')).join('\n'));
    await common.locator('.view-buttons button').first().click();
    await page.waitForFunction(() => document.querySelector('#secondaryGlossaryTable .secondary-term-row').dataset.authorLoading === 'false' && document.querySelector('#secondaryGlossaryTable .secondary-proprietaire-value').getAttribute('aria-invalid') === 'true');
    check(await common.locator('.secondary-proprietaire-value option[data-author-invalid="true"]').count(), 1, 'ancien auteur retiré des groupes signalé en édition');
    const savesBefore = state.requests.filter(request => request.action === 'save').length;
    await common.locator('.edit-buttons button').first().evaluate(button => saveRowEdition2(button));
    check(state.requests.filter(request => request.action === 'save').length, savesBefore, 'édition ne soumet pas un auteur devenu non autorisé');
    await common.locator('.secondary-proprietaire-value').selectOption('Test');
    check(await common.locator('.secondary-proprietaire-value').getAttribute('aria-invalid'), 'false', 'nouveau choix autorisé valide l’éditeur');
    await common.locator('.edit-buttons button').nth(1).click();
    state.setAuthors(qualifiedAuthors);
    await page.click('[data-liens-tab="Tab1"]');
    // Plusieurs éditions : le type reste visible tant qu'une autre ligne est éditée.
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('#mainGlossaryTable .view-buttons button:first-child');
      toggleEditMode(buttons[0], true); toggleEditMode(buttons[1], true); toggleEditMode(buttons[0], false);
    });
    check(await page.locator('#mainGlossaryTable').evaluate(el => el.classList.contains('hide-type-column')), false, 'type visible pour les éditions restantes');
    check(await page.locator('.col-type .liens-sort-btn').count(), 0, 'aucun tri dans Type pendant édition');
    await page.evaluate(() => document.querySelectorAll('#mainGlossaryTable .view-buttons button:first-child').forEach(button => toggleEditMode(button, false)));
    // Bootstrap réel : contenu des modales au-dessus du fond et filtre OU.
    await page.click('button[data-target="#glossaryModal"]');
    await page.waitForSelector('#glossaryModal.in');
    await page.fill('#liensNomInputField', 'A00');
    check(await page.locator('#popupCheckTable .term-row:visible').count(), 1, 'filtre de la popup');
    await page.fill('#liensInputField', 'Libellé C00');
    check(await page.locator('#popupCheckTable .term-row:visible').count(), 2, 'filtre OU de la popup');
    check(await page.locator('#glossaryModal').evaluate(el => el.parentNode === document.body), true, 'popup hors du contexte XWiki');
    await page.waitForFunction(modalAboveBackdrop, 'glossaryModal');
    check(await page.evaluate(modalAboveBackdrop, 'glossaryModal'), true, 'popup au-dessus du fond noir par hit-test');
    await page.click('#glossaryModal button[data-dismiss="modal"]');
    await page.waitForSelector('#glossaryModal.in', { state: 'hidden' });
    // Lecture et import d'un vrai fichier XLSX.
    await page.addScriptTag({ content: readAsset('sheetjs.js') });
    const authorBytes = await page.evaluate(() => {
      const authors = ['AdeleMartin', 'AdeleMartni', 'ADÈLE MARTIN', 'Martin Adele', 'XWiki.AdeleMartin', 'xwiki:XWiki.AdeleMartin', 'Zoe Duran', '', 'Personne introuvable', '<img src=x onerror=alert(1)>', 'Dupont Jean', 'Jean Dupont'];
      const data = [['Acronyme', 'Libellé', 'Définition', 'Type', 'Auteur'], ...authors.map((author, i) => ['IMPORT' + i, 'Auteur ' + i, 'Définition', 'commun', author])];
      const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(data), 'Auteurs');
      return Array.from(new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' })));
    });
    await page.locator('#excelLiensFileInput').setInputFiles({ name: 'auteurs.xlsx', buffer: Buffer.from(authorBytes) });
    await page.waitForSelector('#excelLiensModal.in');
    const authors = page.locator('#excelLiensPreviewBody select.excel-author-select');
    check(await authors.count(), 12, 'une liste déroulante par auteur Excel');
    for (let i = 0; i < 6; i++) check(await authors.nth(i).inputValue(), 'AdeleMartin', 'identifiant, faute, accent, nom inversé et référence ' + i);
    check(await authors.nth(6).inputValue(), 'ZoeDurand', 'auteur le plus proche du prénom/nom');
    check(await authors.nth(7).inputValue(), 'Test', 'auteur vide utilise le compte connecté');
    check(await authors.evaluateAll(selects => selects.every(select => Array.from(select.options).some(option => option.value === select.value))), true, 'chaque auteur retenu appartient aux comptes existants');
    check(await authors.first().locator('option').allTextContents(), ['Adèle Martin (AdeleMartin)', 'Autre auteur (Autre)', 'Jean Dupont (Login42)', 'Test (Test)', 'Zoé Durand (ZoeDurand)'], 'même catalogue que pour changer un auteur en édition');
    check(await authors.nth(10).inputValue(), 'Login42', 'nom prénom reconnu avec un identifiant totalement différent');
    check(await authors.nth(11).inputValue(), 'Login42', 'prénom nom reconnu avec un identifiant totalement différent');
    check(await authors.nth(8).inputValue(), 'Personne introuvable', 'un auteur sans correspondance proche conserve sa valeur Excel');
    check(await authors.nth(8).getAttribute('aria-invalid'), 'true', 'auteur inconnu signalé comme invalide');
    check(await authors.nth(8).evaluate(select => getComputedStyle(select).color), 'rgb(169, 68, 66)', 'auteur inconnu affiché en rouge');
    check(await page.locator('#excelLiensPreviewBody .liens-invalid-author').count(), 2, 'deux auteurs inconnus conservés sans affectation arbitraire');
    await page.click('#btnConfirmExcelLiensImport');
    check(await page.locator('#excelLiensModal.in').isVisible(), true, 'auteurs invalides conservent le menu ouvert');
    check(state.requests.filter(req => req.action === 'create').length, 0, 'aucune création avant correction des auteurs rouges');
    await authors.nth(8).selectOption('Test');
    await authors.nth(9).selectOption('Autre');
    check(await page.locator('#excelLiensPreviewBody .liens-invalid-author').count(), 0, 'correction manuelle retire le rouge');
    check((await page.locator('#excelLiensSelectionSummary').textContent()).includes('non reconnu'), false, 'compteur des auteurs mis à jour après correction');
    check(await page.locator('#secondaryGlossaryTable .secondary-proprietaire-value').first().locator('option[value="AdeleMartin"]').count(), 1, 'membre d’un groupe autorisé proposé aussi en édition');
    check(await page.locator('#secondaryGlossaryTable .secondary-proprietaire-value option[value="NonAuteur"]').count(), 0, 'compte sans écriture commune absent de l’éditeur');
    check(await authors.first().locator('option[value="NonAuteur"]').count(), 0, 'compte sans écriture commune absent de l’import');
    check(await page.locator('#excelLiensPreviewBody .excel-author-correction').filter({ hasText: 'AdeleMartni' }).count(), 1, 'correction visible avant import');
    check(await page.locator('#excelLiensPreviewBody img').count(), 0, 'auteur Excel traité comme texte');
    await authors.nth(1).selectOption('Autre');
    check(await page.locator('#excelLiensPreviewBody .excel-author-select').nth(1).inputValue(), 'Autre', 'choix manuel remplace la suggestion');
    await page.locator('#excelLiensPreviewBody tr').first().locator('input').first().fill('IMPORT-MODIFIE');
    await page.locator('#excelLiensPreviewBody tr').first().locator('input').first().dispatchEvent('change');
    check(await page.locator('#excelLiensPreviewBody .excel-author-select').nth(1).inputValue(), 'Autre', 'choix manuel conservé au recalcul du tableau');
    // Widget réel Tom Select derrière la même API jQuery que XWiki.
    await page.addScriptTag({ content: readAsset('tomselect.js') });
    await page.addStyleTag({ content: readAsset('tomselect.css') + '.ts-dropdown { z-index: 10051; }' });
    await page.evaluate(() => {
      jQuery.fn.xwikiSelectize = function(settings) {
        return this.not('.tomselected, .ts-wrapper').each(function() { if (!this.tomselect) new TomSelect(this, { dropdownParent: 'body', ...settings }); });
      };
      jQuery('#excelLiensModal').trigger('shown.bs.modal');
    });
    check(await authors.first().evaluate(select => select.tomselect.settings.create), false, 'sélecteur enrichi interdit les auteurs libres');
    await page.locator('#excelLiensPreviewBody .ts-control input').first().fill('Zoé');
    await page.locator('.ts-dropdown .option[data-value="ZoeDurand"]').click();
    await page.waitForFunction(() => document.querySelector('#excelLiensPreviewBody .excel-author-select').value === 'ZoeDurand' && !!document.querySelector('#excelLiensPreviewBody .excel-author-select').tomselect);
    check(await authors.first().inputValue(), 'ZoeDurand', 'recherche et choix avec le vrai sélecteur enrichi');
    check(await page.locator('.ts-wrapper').count(), 12, 'un seul widget par ligne après changement d’auteur');
    check(await page.locator('.ts-dropdown').count(), 12, 'un seul menu enrichi par ligne');
    await page.locator('#excelLiensPreviewBody tr').first().locator('input.excel-import-input').first().fill('IMPORT-ENRICHI');
    await page.locator('#excelLiensPreviewBody tr').first().locator('input.excel-import-input').first().dispatchEvent('change');
    check(await authors.first().inputValue(), 'ZoeDurand', 'auteur conservé après recalcul avec le sélecteur enrichi');
    check(await page.locator('.ts-dropdown').count(), 12, 'anciens menus enrichis détruits au recalcul');
    await page.locator('#excelLiensFileInput').setInputFiles({ name: 'auteurs.xlsx', buffer: Buffer.from(authorBytes) });
    await page.waitForFunction(() => document.querySelectorAll('#excelLiensPreviewBody select.excel-author-select')[8]?.tomselect?.getValue() === 'Personne introuvable');
    check(await authors.nth(8).inputValue(), 'Personne introuvable', 'valeur inconnue conservée aussi dans le sélecteur enrichi');
    check(await authors.nth(8).evaluate(select => getComputedStyle(select.closest('td').querySelector('.ts-control')).color), 'rgb(169, 68, 66)', 'sélecteur enrichi invalide affiché en rouge');
    await authors.nth(8).evaluate(select => select.tomselect.setValue('Test'));
    check(await authors.nth(8).getAttribute('aria-invalid'), 'false', 'choix enrichi valide retire le signalement');
    await page.click('#excelLiensModal button[data-dismiss="modal"]');
    await page.waitForSelector('#excelLiensModal.in', { state: 'hidden' });
    const bytes = await page.evaluate(() => {
      const sheet = XLSX.utils.aoa_to_sheet([['Acronyme', 'Libellé', 'Définition', 'Type', 'Auteur'], ['constructor', 'toString', 'Test', 'personnel', 'Test'], ['A00', 'Groupe pair', 'Test', 'commun', 'Test']]);
      const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Liens');
      return Array.from(new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' })));
    });
    await page.locator('#excelLiensFileInput').setInputFiles({ name: 'liens.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(bytes) });
    await page.waitForSelector('#excelLiensModal.in');
    check(await page.locator('#excelLiensPreviewBody tr').count(), 2, 'lecture XLSX réelle');
    check(await page.locator('#excelLiensDuplicatesBody tr').count(), 1, 'constructor et toString ne sont pas des faux doublons');
    await page.locator('#excelLiensPreviewBody select.excel-author-select').first().selectOption('Login42', { force: true });
    state.setMode('refuse');
    await page.locator('#btnConfirmExcelLiensImport').evaluate(button => { button.click(); button.click(); });
    await page.waitForSelector('#excelLiensModal.in', { state: 'hidden' });
    check(state.requests.filter(req => req.action === 'create').length, 1, 'import ignore le doublon et bloque le double clic');
    check(state.requests.find(req => req.action === 'create').acronym, 'constructor', 'import transmet le bon acronyme');
    check(state.requests.find(req => req.action === 'create').proprietaire, 'Login42', 'import envoie userid même si le catalogue fournit xwiki:XWiki.userid');
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
    // L'absence du catalogue ne doit jamais empêcher la lecture du fichier et l'aperçu.
    const unavailable = await setup();
    await unavailable.page.addScriptTag({ content: readAsset('sheetjs.js') });
    const catalogMarkup = await unavailable.page.locator('#liensAuthorOptions').evaluate(select => select.outerHTML);
    await unavailable.page.locator('#liensAuthorOptions').evaluate(select => select.remove());
    await unavailable.page.locator('#excelLiensFileInput').setInputFiles({ name: 'auteurs.xlsx', buffer: Buffer.from(authorBytes) });
    await unavailable.page.waitForFunction(() => document.querySelectorAll('#excelLiensPreviewBody select.excel-author-select')[10]?.value === 'Login42');
    check(await unavailable.page.locator('#excelLiensPreviewBody select.excel-author-select').nth(10).getAttribute('aria-invalid'), 'false', 'DATA retrouve les membres autorisés même sans catalogue HTML');
    await unavailable.page.evaluate(markup => document.querySelector('.liens-page').insertAdjacentHTML('beforeend', markup), catalogMarkup);
    unavailable.setMode('authorsUnavailable');
    for (const mode of ['vide', 'absent']) {
      await unavailable.page.evaluate(mode => {
        const catalog = document.getElementById('liensAuthorOptions');
        if (mode === 'vide') catalog.innerHTML = ''; else catalog.remove();
      }, mode);
      await unavailable.page.locator('#excelLiensFileInput').setInputFiles({ name: 'auteurs.xlsx', buffer: Buffer.from(authorBytes) });
      await unavailable.page.waitForSelector('#excelLiensModal.in');
      check(await unavailable.page.locator('#excelLiensPreviewBody tr').count(), 12, 'aperçu ouvert avec catalogue ' + mode);
      check(await unavailable.page.locator('#excelLiensPreviewBody select.excel-author-select').nth(10).inputValue(), 'Dupont Jean', 'nom prénom conservé avec catalogue ' + mode);
      check(await unavailable.page.locator('#excelLiensPreviewBody .liens-invalid-author').count(), 12, 'auteurs non vérifiables en rouge avec catalogue ' + mode);
      check(unavailable.alerts, [], 'aucune erreur bloquante avec catalogue ' + mode);
      check(await unavailable.page.locator('#excelLiensPreviewBody img').count(), 0, 'valeur inconnue échappée avec catalogue ' + mode);
    }
    await unavailable.page.click('#btnConfirmExcelLiensImport');
    check(unavailable.requests.filter(req => req.action === 'create').length, 0, 'catalogue absent ne permet aucune création avec auteur invalide');
    await unavailable.page.evaluate(markup => {
      const source = document.createElement('div'); source.innerHTML = markup;
      const legacy = document.createElement('template'); legacy.id = 'liensAuthorOptions';
      legacy.setAttribute('data-author-source', 'common-write-groups');
      legacy.innerHTML = source.querySelector('select').innerHTML;
      document.querySelector('.liens-page').appendChild(legacy);
    }, catalogMarkup);
    await unavailable.page.locator('#excelLiensFileInput').setInputFiles({ name: 'auteurs.xlsx', buffer: Buffer.from(authorBytes) });
    await unavailable.page.waitForFunction(() => document.querySelectorAll('#excelLiensPreviewBody select.excel-author-select')[10]?.value === 'Login42');
    check(await unavailable.page.locator('#excelLiensPreviewBody select.excel-author-select').nth(10).inputValue(), 'Login42', 'ancien template reconnu aussi pour nom prénom');
    check(unavailable.errors, [], 'aucune exception avec catalogue absent ou ancien format');
    await unavailable.page.close();
    const late = await setup(true);
    check(await late.page.locator('#mainGlossaryTable .main-term-row:visible').count(), 10, 'extensions chargées après DOMContentLoaded');
    await late.page.fill('#filterAcronym', 'A00');
    check(await late.page.locator('#mainGlossaryTable .main-term-row:visible').count(), 1, 'filtre après chargement tardif');
    check(late.errors, [], 'aucune exception chargement tardif');
    await late.page.close();
    const nonManager = await setup(false, false);
    await nonManager.page.click('.tablinks:nth-of-type(2)');
    await nonManager.page.locator('#btnBulkDeleteModeLiens').waitFor({ state: 'hidden' });
    check(await nonManager.page.locator('#btnBulkDeleteModeLiens').isVisible(), false, 'suppression commune masquée pour non-manager');
    check(await nonManager.page.locator('#secondaryGlossaryTable .view-buttons button:visible').count(), 0, 'actions communes masquées pour non-manager');
    await nonManager.page.addScriptTag({ content: readAsset('sheetjs.js') });
    await nonManager.page.locator('#excelLiensFileInput').setInputFiles({ name: 'auteurs.xlsx', buffer: Buffer.from(authorBytes) });
    await nonManager.page.waitForSelector('#excelLiensModal.in');
    check(await nonManager.page.locator('#excelLiensPreviewBody .excel-author-select').evaluateAll(selects => selects.every(select => select.disabled && select.value === 'Test')), true, 'écriture personnelle seule conserve son auteur');
    check(await nonManager.page.locator('#excelLiensPreviewBody select:not(.excel-author-select)').evaluateAll(selects => selects.every(select => select.value === 'personnel')), true, 'écriture personnelle seule force le type Personnel');
    check(nonManager.errors, [], 'aucune exception non-manager');
    check(nonManager.requests.filter(request => request.action === 'listAuthors').length, 0, 'écriture personnelle seule ne charge pas le catalogue des groupes');
    await nonManager.page.close();
    console.log(`${checks} vérifications Chromium réussies.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
