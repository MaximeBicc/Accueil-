const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const generated = process.argv[2] || '/tmp/liens-rendered.html';
const assets = process.argv[3] || '/tmp';
const extensionDir = path.resolve('xwiki/TestPage/PAGE/Lien-test/extensions');
const scripts = fs.readdirSync(extensionDir).filter(name => name.endsWith('.js')).sort().map(name => fs.readFileSync(path.join(extensionDir, name), 'utf8'));
const css = fs.readFileSync(path.join(extensionDir, '05-hide-type-column.css'), 'utf8');
const asset = name => fs.readFileSync(path.join(assets, 'liens-' + name), 'utf8');
let checks = 0;
function check(value, expected, message) { assert.deepEqual(value, expected, message); checks++; }

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    async function open(suffix, late = false) {
      const page = await browser.newPage();
      const errors = [];
      const posts = [];
      const transports = [];
      let settingsStatus = 200;
      let settingsType = 'text/plain';
      let settingsResult = 'LIENS_ERROR|' + encodeURIComponent('Erreur de configuration test');
      const html = fs.readFileSync(generated + suffix, 'utf8');
      const flags = ['read-personal', 'write-personal', 'read-common', 'write-common'].map(key => html.includes(`data-can-${key}="true"`));
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://wiki.test/**', async route => {
        if (route.request().method() === 'POST') {
          // XWiki rejette les URL invalides avant d'exécuter le template DATA.
          if (new URL(route.request().url()).pathname !== '/bin/view/TestPage/PAGE/Liens/DATA/') {
            return route.fulfill({ status: 400, contentType: 'text/html', body: '<p class="errormessage">Requête invalide</p>' });
          }
          const contentType = route.request().headers()['content-type'] || '';
          const bodyText = route.request().postData() || '';
          const values = contentType.startsWith('application/x-www-form-urlencoded')
            ? Object.fromEntries(new URLSearchParams(bodyText))
            : Object.fromEntries(Array.from(bodyText.matchAll(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n--/g), match => [match[1], match[2]]));
          transports.push(contentType);
          posts.push(values);
          const body = values.action === 'settings' ? settingsResult : 'LIEN_LIST_OK|Test|' + flags[3] + '|' + flags.join('|');
          return route.fulfill({ status: values.action === 'settings' ? settingsStatus : 200, contentType: values.action === 'settings' ? settingsType : 'text/plain', body });
        }
        const before = '<!doctype html><html><head><meta charset="utf-8"><style>' + asset('bootstrap.css') + css + '</style><script>' + asset('jquery.js') + '</script><script>' + asset('bootstrap.js') + '</script>';
        const scriptTags = scripts.map(script => '<script>' + script + '</script>').join('');
        return route.fulfill({ contentType: 'text/html', body: before + (late ? '' : scriptTags) + '</head><body><div style="isolation:isolate">' + html + '</div></body></html>' });
      });
      await page.goto('https://wiki.test/liens');
      if (late) for (const content of scripts) await page.addScriptTag({ content });
      await page.waitForFunction(() => document.querySelector('.liens-page').dataset.adaptationReady === 'true');
      return { page, errors, flags, posts, transports, setResult: (result, status = 200, type = 'text/plain') => { settingsResult = result; settingsStatus = status; settingsType = type; } };
    }
    for (let personal = 0; personal <= 2; personal++) for (let common = 0; common <= 2; common++) {
      const state = await open(`.p${personal}c${common}.html`);
      const { page } = state;
      const readPersonal = personal > 0 || common === 2;
      const writePersonal = personal === 2 || common === 2;
      const readCommon = common > 0;
      check(await page.locator('.tablinks').count(), Number(readPersonal) + Number(readCommon), 'onglets autorisés ' + personal + '/' + common);
      check(await page.locator('#mainGlossaryTable').count(), Number(readPersonal), 'table Personnel ' + personal + '/' + common);
      check(await page.locator('#secondaryGlossaryTable').count(), Number(readCommon), 'table Commun ' + personal + '/' + common);
      check(await page.locator('#btnImportExcelLiens').count(), Number(writePersonal), 'import réservé à écriture ' + personal + '/' + common);
      check(await page.locator('#btnLiensSettings').count(), 0, 'pas de paramètres non-admin');
      for (const [tab, readable, writable] of [['Tab1', readPersonal, writePersonal], ['Tab2', readCommon, common === 2]]) {
        if (!readable) continue;
        await page.locator(`[data-liens-tab="${tab}"]`).click();
        check(await page.locator('#' + tab).isVisible(), true, 'onglet cliquable ' + tab);
        if (writePersonal) {
          await page.waitForFunction(({ tab, writable }) => {
            const tabElement = document.getElementById(tab);
            const button = document.getElementById('btnBulkDeleteModeLiens');
            return tabElement.style.display === 'block' && (getComputedStyle(button).display !== 'none') === writable;
          }, { tab, writable });
          check(await page.locator('#btnBulkDeleteModeLiens').isVisible(), writable, 'suppression multiple selon onglet ' + tab);
        }
        const table = tab === 'Tab1' ? 'mainGlossaryTable' : 'secondaryGlossaryTable';
        check(await page.locator('#' + table + ' .view-buttons button').count(), writable ? 2 : 0, 'actions selon écriture ' + tab);
        await page.locator('#' + table + ' .filter-row input').first().fill('introuvable');
        check(await page.locator('#' + table + ' tbody tr:visible').count(), 0, 'filtre en lecture seule ou écriture ' + tab);
      }
      if (!readPersonal && readCommon) {
        await page.reload();
        check(await page.locator('#Tab2').isVisible(), true, 'Commun seul ouvert automatiquement');
      }
      check(state.errors, [], 'aucune exception pour ' + personal + '/' + common);
      await page.close();
    }
    const late = await open('.p0c1.html', true);
    check(await late.page.locator('#Tab2').isVisible(), true, 'Commun seul après chargement tardif');
    check(late.errors, [], 'aucune exception chargement tardif');
    await late.page.close();
    const adminWriter = await open('.admin-writer.html');
    check(await adminWriter.page.locator('#liensToolbarRight #btnLiensSettings').count(), 1, 'Paramètres conservé lors de la création des boutons Excel');
    check(await adminWriter.page.locator('#liensToolbarRight #btnImportExcelLiens').count(), 1, 'import à droite avec Paramètres');
    check(await adminWriter.page.locator('#liensToolbarRight').evaluate(el => el.lastElementChild.id), 'btnLiensSettings', 'Paramètres dernier bouton à droite');
    for (const width of [1440, 390]) {
      await adminWriter.page.setViewportSize({ width, height: 1000 });
      check(await adminWriter.page.locator('#btnLiensSettings').isVisible(), true, 'Paramètres visible à ' + width + 'px');
    }
    check(adminWriter.errors, [], 'aucune exception avec paramètres et import');
    await adminWriter.page.close();
    const admin = await open('.admin.html');
    check(await admin.page.locator('.tablinks').count(), 0, 'admin sans droit de lecture');
    check(await admin.page.locator('#liensToolbarRight #btnLiensSettings').count(), 1, 'Paramètres à droite même sans écriture');
    check(await admin.page.locator('#liensToolbarRight').evaluate(el => getComputedStyle(el).justifyContent), 'flex-end', 'alignement à droite comme le Glossaire');
    await admin.page.click('#btnLiensSettings');
    await admin.page.waitForSelector('#liensSettingsModal.in');
    check(await admin.page.locator('#liensSettingsModal').evaluate(el => el.parentNode === document.body), true, 'Paramètres au-dessus du contenu XWiki');
    const allRow = admin.page.locator('.liens-permission-row').filter({ has: admin.page.locator('input[value="XWiki.XWikiAllGroup"]') });
    await allRow.locator('[data-kind="common"]').selectOption('2');
    check(await allRow.locator('[data-kind="personal"]').inputValue(), '2', 'Commun écriture entraîne Personnel écriture');
    check(await allRow.locator('[data-kind="personal"] option[value="0"]').isDisabled(), true, 'impossible de retirer Personnel avec Commun écriture');
    const brokenTarget = await admin.page.evaluate(async () => {
      const form = document.getElementById('liensSettingsForm');
      // Reproduction du bug : le contrôle name="action" masque form.action.
      const response = await fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)) });
      return { value: String(form.action), status: response.status, url: response.url };
    });
    check(brokenTarget.value, '[object HTMLInputElement]', 'le champ action masque la propriété DOM du formulaire');
    check(brokenTarget.status, 400, 'ancienne adresse reproduit Requête invalide');
    check(decodeURI(brokenTarget.url).endsWith('/[object HTMLInputElement]'), true, 'ancienne requête envoyée hors DATA');
    const [settingsResponse] = await Promise.all([
      admin.page.waitForResponse(response => response.request().method() === 'POST'),
      admin.page.locator('#liensSettingsForm button[type="submit"]').click()
    ]);
    check(new URL(settingsResponse.url()).pathname, '/bin/view/TestPage/PAGE/Liens/DATA/', 'Enregistrer appelle exactement la page DATA');
    await admin.page.waitForFunction(() => document.querySelector('.liens-settings-feedback').textContent.includes('Erreur de configuration test'));
    check(await admin.page.locator('#liensSettingsForm button[type="submit"]').isEnabled(), true, 'erreur conserve le formulaire utilisable');
    check(admin.posts[0].personal_1, '2', 'POST envoie le droit Personnel cumulé');
    check(admin.transports[0].startsWith('application/x-www-form-urlencoded'), true, 'paramètres envoyés comme un formulaire classique');
    check(admin.posts[0].form_token, 'test-token', 'CSRF conservé dans le corps');
    check(admin.posts[0].expectedVersion !== '', true, 'version conservée dans le corps');
    check(admin.posts[0].ajax, 'true', 'réponse AJAX demandée');
    const diagnostics = [
      [400, 'LIENS_ERROR|' + encodeURIComponent('Le champ commonWriteGroups est absent.'), 'text/plain', 'commonWriteGroups'],
      [400, '<html><body><p class="errormessage">Trop de parties multipart.</p><script>throw new Error("NE_PAS_EXECUTER")</script></body></html>', 'text/html', 'Trop de parties multipart.'],
      [400, '', 'text/plain', 'Le serveur a rejeté'],
      [403, JSON.stringify({ message: 'Jeton invalide côté serveur' }), 'application/json', 'Jeton invalide côté serveur'],
      [200, 'ERREUR_CSRF', 'text/plain', 'Rechargez la page'],
      [200, 'ERREUR_ACTION_INCONNUE', 'text/plain', 'sources de la page et des extensions']
    ];
    for (const [status, body, type, expected] of diagnostics) {
      admin.setResult(body, status, type);
      await admin.page.locator('#liensSettingsForm button[type="submit"]').click();
      await admin.page.waitForFunction(expected => document.querySelector('.liens-settings-feedback').textContent.includes(expected), expected);
      const message = await admin.page.locator('.liens-settings-feedback').textContent();
      check(message.includes(expected), true, 'diagnostic affiché ' + expected);
      if (status !== 200) check(message.includes('HTTP ' + status), true, 'statut HTTP conservé');
      check(await allRow.locator('[data-kind="common"]').inputValue(), '2', 'choix conservés après erreur');
      check(await admin.page.locator('#liensSettingsForm button[type="submit"]').isEnabled(), true, 'réessai possible après erreur');
      check(message.includes('NE_PAS_EXECUTER'), false, 'scripts HTML ignorés');
    }
    // Conserver l'envoi de tous les groupes et des caractères spéciaux.
    await admin.page.evaluate(() => {
      const form = document.getElementById('liensSettingsForm');
      const body = form.querySelector('tbody');
      for (let i = 2; i < 42; i++) {
        const row = body.lastElementChild.cloneNode(true);
        const group = row.querySelector('input[name^="group_"]');
        group.name = 'group_' + i; group.value = 'XWiki.Équipe & Support ' + i;
        row.querySelectorAll('select').forEach(select => { select.name = select.dataset.kind + '_' + i; });
        body.appendChild(row);
      }
      form.querySelector('[name="groupCount"]').value = String(body.children.length);
    });
    admin.setResult('LIENS_SETTINGS_SAVED');
    await Promise.all([admin.page.waitForNavigation(), admin.page.locator('#liensSettingsForm button[type="submit"]').click()]);
    check(admin.posts.filter(post => post.action === 'settings').length, 8, 'succès recharge la page');
    check(Object.keys(admin.posts.at(-1)).length > 50, true, 'enregistrement de plus de 50 champs');
    check(admin.posts.at(-1).group_41, 'XWiki.Équipe & Support 41', 'accents et caractères spéciaux conservés');
    check(admin.posts.at(-1).groupCount, '42', 'tous les groupes sont envoyés');
    check(admin.errors, [], 'aucune exception paramètres');
    await admin.page.close();
    console.log(`${checks} vérifications des droits dans Chromium réussies.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
