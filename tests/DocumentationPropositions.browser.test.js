/* Real documentation JavaScript in Chromium, with simulated COMMANDE responses.
 * This checks browser behavior; it does not replace an installed XWiki check.
 * Run: node tests/DocumentationPropositions.browser.test.js
 * Dependencies: playwright and Chromium (or CHROMIUM_EXECUTABLE_PATH).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const codeDir = path.join(__dirname, '..', 'xwiki/TestPage/PAGE/doc-test/CODE');
const root = 'TestPage.PAGE.doc-test.WebHome';
const folder = 'TestPage.PAGE.doc-test.RH.WebHome';
const existing = 'TestPage.PAGE.doc-test.RH.Guide.WebHome';
const space = 'TestPage.PAGE.doc-test.PROPOSITIONS.';
let passed = 0;

function proposal(name, options = {}) {
  return {
    ref: space + name, type: 'document', title: name, operation: 'create',
    'parent-ref': folder, status: 'pending', author: 'XWiki.Alice',
    'submitted-at': '16/10/2026 09:00', version: '1.1',
    url: '/xwiki/bin/view/proposal/' + name,
    'url-preview': '/xwiki/bin/view/proposal/' + name + '?xpage=print', ...options
  };
}

async function setup(browser, options = {}) {
  const page = await browser.newPage();
  await page.route('https://wiki.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Preview</title>' }));
  await page.goto('https://wiki.test/documentation');
  await page.setContent('<!doctype html><html><body><div id="box"></div><div id="notification"></div></body></html>');
  if (fs.existsSync(path.join(codeDir, 'FileExplorer.css'))) {
    await page.addStyleTag({ path: path.join(codeDir, 'FileExplorer.css') });
  }
  if (fs.existsSync(path.join(codeDir, 'Propositions.css'))) {
    await page.addStyleTag({ path: path.join(codeDir, 'Propositions.css') });
  }
  const architecture = [
    { ref: root, type: 'root', title: 'Documentation', 'parent-ref': '' },
    { ref: folder, type: 'folder', title: 'RH', 'parent-ref': root },
    { ref: existing, type: 'document', title: 'Guide existant', 'parent-ref': folder }
  ];
  await page.evaluate(({ architecture, proposals, reviewer }) => {
    window.initialPageRef = architecture[0].ref;
    window.urlCommande = '/xwiki/bin/view/TestPage/PAGE/doc-test/COMMANDE';
    window.testState = { architecture, proposals, reviewer, decisions: [], requests: [], alerts: [], refreshes: 0 };
    window.alert = value => testState.alerts.push(String(value));
    window.prompt = () => 'Document incomplet';
    const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const html = (className, values) => '<div class="' + className + '" ' + Object.entries(values)
      .map(([key, value]) => 'data-' + key + '="' + esc(value) + '"').join(' ') + '></div>';
    window.fetch = async url => {
      const action = new URL(url, location.href).searchParams.get('action');
      testState.requests.push(action);
      if (action !== 'architecture') throw new Error('Unexpected request: ' + action);
      return { ok: true, text: async () => testState.architecture.map(item => html('architecture-node-data', item)).join('') };
    };
    window.DocPropositions = {
      ready: Promise.resolve(),
      can: right => right === 'review' ? testState.reviewer : ['move', 'delete'].includes(right),
      modeFor: right => ['move', 'delete'].includes(right) ? 'direct' : '',
      request: async mode => {
        testState.requests.push(mode);
        return new DOMParser().parseFromString(testState.proposals
          .filter(item => item.status === (mode === 'corbeille' ? 'rejected' : 'pending'))
          .map(item => html('doc-proposal-data', item)).join(''), 'text/html');
      },
      proposalAction: async (ref, decision, reason, version) => {
        testState.decisions.push({ ref, decision, reason, version });
        const item = testState.proposals.find(value => value.ref === ref);
        if (!item) throw new Error('Missing proposal');
        if (decision === 'accept') {
          item.status = 'accepted';
          testState.architecture.push({ ref: ref + '.Published', type: item.type, title: item.title, 'parent-ref': item['parent-ref'] });
        } else if (decision === 'reject') {
          item.status = 'rejected';
          item['review-comment'] = reason;
          item['deleted-at'] = '16/10/2026 09:30';
          item['expires-at'] = '23/10/2026 09:30';
        } else if (decision === 'restore') {
          item.status = 'pending';
        }
      }
    };
  }, { architecture, proposals: options.proposals || [proposal('Contrat'), proposal('Notes')], reviewer: options.reviewer !== false });
  await page.addScriptTag({ path: path.join(codeDir, 'LienPerso.js') });
  await page.evaluate(() => { window.LienPerso = () => { testState.refreshes++; }; });
  return page;
}

async function check(name, callback) {
  await callback();
  passed++;
  console.log('PASS: ' + name);
}
async function open(page, mode = 'propositions') {
  await page.evaluate(async mode => {
    if (mode) await openArchitectureEditor(document.getElementById('box'), mode);
    else await openArchitectureEditor(document.getElementById('box'));
  }, mode);
}

async function workflowPage(browser, permissions = {}, options = {}) {
  const page = await browser.newPage();
  await page.route('https://wiki.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }));
  await page.goto('https://wiki.test/documentation');
  await page.setContent(`<!doctype html><html><body><input name="form_token" value="test-csrf">
    <div id="notification"></div><div id="box"></div>
    <button id="doc-settings" hidden>Paramètres</button><button id="doc-add-folder">Ajouter un dossier</button>
    <button id="doc-add-document">Ajouter un document</button>
  </body></html>`);
  await page.evaluate(({ granted, groupGrants }) => {
    window.urlCommande = '/xwiki/bin/view/COMMANDE';
    window.testWorkflow = { granted, groupGrants, settingsVersion: '4.2', requests: [], fail: '', responses: {}, alerts: [], confirmations: [], refreshes: 0 };
    window.alert = message => testWorkflow.alerts.push(String(message));
    window.confirm = message => { testWorkflow.confirmations.push(String(message)); return true; };
    window.fetch = async (url, options = {}) => {
      const parsedURL = new URL(url, location.href);
      const values = Object.fromEntries(options.body || parsedURL.searchParams);
      const action = values.action;
      testWorkflow.requests.push({ action, method: options.method || 'GET', values,
        credentials: options.credentials });
      let body = '', status = 200;
      if (testWorkflow.responses[action]) {
        body = testWorkflow.responses[action].body;
        status = testWorkflow.responses[action].status || 200;
      } else if (testWorkflow.fail === action) body = '<div id="documentation-error" data-message="Action refusée">ERREUR_DROITS</div>';
      else if (action === 'workflow') {
        body = '<div id="documentation-permissions" data-settings-version="' + testWorkflow.settingsVersion + '" ' +
          Object.entries(granted).map(([right, value]) => 'data-can-' + right + '="' + value + '"').join(' ') + '></div>' +
          '<div class="doc-group-data" data-ref="XWiki.Contributors" data-title="Contributeurs"></div>' +
          Object.entries(testWorkflow.groupGrants).flatMap(([right, groups]) => groups.map(group =>
            '<div class="doc-grant-data" data-right="' + right + '" data-group="' + group + '"></div>')).join('');
      } else if (action === 'enregistrer parametres') {
        for (const right of ['create', 'move', 'modify', 'import', 'content', 'propose', 'review', 'delete']) {
          const groups = (values[right + '_groups'] || '').split('\n').filter(Boolean);
          testWorkflow.groupGrants[right] = groups;
          granted[right] = groups.includes('XWiki.Contributors');
        }
        const version = testWorkflow.settingsVersion.split('.');
        testWorkflow.settingsVersion = version[0] + '.' + (Number(version[1]) + 1);
        body = 'PARAMETRES_OK';
      } else if (action === 'contenu document') body = '<div id="documentation-content" data-version="3.7"></div><textarea id="documentation-source">' + (testWorkflow.source || 'Contenu initial') + '</textarea>';
      else if (action === 'modifier metadonnees document') body = values.mode === 'proposal' ? 'PROPOSITION_OK' :
        '<div id="creation-result" data-code="METADONNEES_OK"></div><div id="metadata-result" data-modified="16/10/2026 12:00"></div>METADONNEES_OK';
      else body = ({
        'enregistrer parametres': 'PARAMETRES_OK', 'purger corbeille': 'CORBEILLE_PURGEE_OK',
        'modifier contenu document': values.mode === 'direct' ? 'CONTENU_OK' : 'PROPOSITION_OK',
        'modifier informations': values.mode === 'direct' ? 'METADONNEES_OK' : 'PROPOSITION_OK',
        'valider proposition': 'PROPOSITION_VALIDEE_OK', 'refuser proposition': 'PROPOSITION_REFUSEE_OK',
        'restaurer proposition': 'PROPOSITION_RESTAUREE_OK', 'supprimer element': 'SUPPRESSION_OK'
      })[action] || 'PROPOSITION_OK';
      return { ok: status >= 200 && status < 300, status, text: async () => body };
    };
  }, { granted: { view: true, ...permissions }, groupGrants: options.groupGrants || { propose: ['XWiki.Contributors'] } });
  await page.addScriptTag({ path: path.join(codeDir, 'Propositions.js') });
  await page.evaluate(() => DocPropositions.ready);
  return page;
}

async function addCreationUI(page) {
  await page.evaluate(parent => {
    const host = document.createElement('div');
    host.innerHTML = '<div id="pageData" parent-page="' + parent + '"></div>' +
      '<div id="popup" style="display:none"><form id="formulairePopup"><input name="form_token" value="test-csrf">' +
      '<div id="popupContent"></div><button id="btn-popup-valide" type="button" onclick="popupValider()">Valider</button></form></div>';
    document.body.appendChild(host);
    window.LienPerso = () => { testWorkflow.refreshes++; };
    window.openDocumentationProposals = () => {};
    window.testWorkflow.responses['ajouter un fichier'] = {
      body: '<div id="creation-result" data-code="LIEN_AJOUTE_OK" data-page-ref="' + parent + '.Nouveau.WebHome"></div>LIEN_AJOUTE_OK'
    };
  }, root);
  await page.addScriptTag({ path: path.join(codeDir, 'Popup.js') });
}

async function addExplorerUI(page) {
  await page.evaluate(({ root, folder, existing }) => {
    window.initialPageRef = root;
    const esc = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const nodes = [
      { ref: root, type: 'root', title: 'Documentation', 'parent-ref': '' },
      { ref: folder, type: 'folder', title: 'RH', 'parent-ref': root },
      { ref: existing, type: 'document', title: 'Guide existant', 'parent-ref': folder }
    ];
    testWorkflow.responses.architecture = { body: nodes.map(node => '<div class="architecture-node-data" ' +
      Object.entries(node).map(([key, value]) => 'data-' + key + '="' + esc(value) + '"').join(' ') + '></div>').join('') };
    const box = document.getElementById('box');
    box.innerHTML = '<div id="pageData" parent-page="' + root + '"></div><form id="formulairePopup"><input name="form_token" value="test-csrf"></form>' +
      '<button id="explorer-delete-btn">Supprimer</button>' +
      '<div class="explorer-row" data-ref="' + existing + '"><input type="checkbox" checked class="explorer-select-input" ' +
      'data-ref="' + existing + '" data-title="Guide existant" data-type="document"></div>';
  }, { root, folder, existing });
  await page.addScriptTag({ path: path.join(codeDir, 'LienPerso.js') });
  await page.evaluate(() => {
    window.LienPerso = () => { testWorkflow.refreshes++; };
    DocPropositions.applyPermissions();
  });
}

async function deleteInUI(page, mode) {
  if (mode === 'architecture') {
    await open(page, '');
    await page.evaluate(ref => { architectureState.selected[ref] = true; renderArchitectureTree(); }, existing);
    await page.evaluate(() => deleteArchitectureSelection(document.getElementById('box')));
  } else {
    await page.evaluate(ref => deleteExplorerItems(document.getElementById('box'), [
      { ref, title: 'Guide existant', type: 'document' }
    ]), existing);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    await check('Propositions reuse the existing architecture modal and preserve published nodes', async () => {
      const page = await setup(browser);
      try {
        await open(page, '');
        await page.evaluate(() => { window.nativeModal = document.getElementById('explorer-architecture-modal'); window.nativeTree = document.getElementById('architecture-tree'); });
        await page.locator('[data-architecture-overlay="propositions"]').click();
        await page.waitForFunction(() => architectureState.overlayMode === 'propositions');
        assert.equal(await page.locator('#explorer-architecture-modal').count(), 1);
        assert.equal(await page.evaluate(() => nativeModal === document.getElementById('explorer-architecture-modal') && nativeTree === document.getElementById('architecture-tree')), true);
        assert.equal(await page.locator('.architecture-row-proposed').count(), 2);
        assert.deepEqual(await page.evaluate(refs => refs.map(ref => ({ ref, parent: architectureState.nodes[ref].parentRef })), [root, folder, existing]),
          [{ ref: root, parent: '' }, { ref: folder, parent: root }, { ref: existing, parent: folder }]);
        assert.equal(await page.evaluate(ref => architectureState.nodes['proposal:' + ref].parentRef, space + 'Contrat'), folder);
        await page.locator('[data-architecture-overlay="propositions"]').click();
        await page.waitForFunction(() => architectureState.overlayMode === '');
        assert.equal(await page.locator('.architecture-row-proposed').count(), 0);
        assert.equal(await page.locator('.architecture-row').count(), 3);
        assert.equal(await page.locator('.architecture-row[draggable="true"]').count(), 2);
      } finally { await page.close(); }
    });

    await check('Imported documents remain grouped under their intended destination', async () => {
      const page = await setup(browser, { proposals: [
        proposal('Archive', { type: 'folder', operation: 'import', 'batch-id': 'batch-one' }),
        proposal('Contrat', { operation: 'import', 'batch-id': 'batch-one', 'parent-proposal-ref': space + 'Archive' }),
        proposal('Guide', { operation: 'import', 'batch-id': 'batch-one', 'parent-proposal-ref': space + 'Archive' }),
        proposal('ImportDirect', { operation: 'import', 'batch-id': 'batch-two' })
      ] });
      try {
        await open(page);
        const result = await page.evaluate(() => ({
          groups: Object.values(architectureState.nodes).filter(node => node.proposalGroup).map(node => ({ batch: node.batchId, parent: node.parentRef })),
          contractParent: architectureState.nodes['proposal:TestPage.PAGE.doc-test.PROPOSITIONS.Contrat'].parentRef,
          count: architectureState.proposalCount
        }));
        assert.deepEqual(result.groups, [{ batch: 'batch-one', parent: folder }, { batch: 'batch-two', parent: folder }]);
        assert.equal(result.contractParent, 'proposal:' + space + 'Archive');
        assert.equal(result.count, 4);
        assert.equal(await page.locator('.architecture-row[draggable="true"]').count(), 0);
        assert.equal(await page.locator('.architecture-select-input').count(), 0);
      } finally { await page.close(); }
    });

    await check('Each item can be accepted or refused independently and refused items appear in Corbeille', async () => {
      const page = await setup(browser);
      try {
        await open(page);
        await page.locator('[data-architecture-proposal-decision="accept"][data-architecture-proposal-ref="proposal:' + space + 'Contrat"]').click();
        await page.waitForFunction(() => architectureState.proposalCount === 1);
        assert.equal(await page.evaluate(() => testState.decisions.length), 1);
        assert.equal(await page.evaluate(ref => !!architectureState.nodes['proposal:' + ref], space + 'Notes'), true);
        await page.locator('[data-architecture-proposal-decision="reject"][data-architecture-proposal-ref="proposal:' + space + 'Notes"]').click();
        await page.waitForFunction(() => architectureState.proposalCount === 0);
        await page.locator('[data-architecture-overlay="corbeille"]').click();
        await page.waitForFunction(() => architectureState.overlayMode === 'corbeille');
        assert.equal(await page.locator('.architecture-row-rejected').count(), 1);
        assert.equal(await page.locator('[data-architecture-proposal-decision="accept"]').count(), 0);
        await page.locator('[data-architecture-proposal-preview]').last().click();
        assert.match(await page.locator('#architecture-proposal-details').innerText(), /Document incomplet/);
        assert.match(await page.locator('#architecture-proposal-details').innerText(), /23\/10\/2026/);
        await page.locator('[data-architecture-proposal-decision="restore"]').click();
        await page.waitForFunction(() => architectureState.proposalCount === 0);
        await page.locator('[data-architecture-overlay="propositions"]').click();
        await page.waitForFunction(() => architectureState.proposalCount === 1);
        assert.deepEqual(await page.evaluate(() => testState.decisions), [
          { ref: space + 'Contrat', decision: 'accept', reason: '', version: '1.1' },
          { ref: space + 'Notes', decision: 'reject', reason: 'Document incomplet', version: '1.1' },
          { ref: space + 'Notes', decision: 'restore', reason: '', version: '1.1' }
        ]);
        assert.deepEqual(await page.evaluate(() => testState.alerts), []);
      } finally { await page.close(); }
    });

    await check('Documents have an accessible preview and can be opened before publication', async () => {
      const page = await setup(browser, { proposals: [proposal('Contrat')] });
      try {
        await open(page);
        const title = page.locator('.architecture-title[data-architecture-proposal-preview]');
        await title.focus();
        await page.keyboard.press('Enter');
        const details = page.locator('#architecture-proposal-details');
        assert.equal(await details.isVisible(), true);
        assert.equal(await details.locator('iframe').getAttribute('src'), 'https://wiki.test/xwiki/bin/view/proposal/Contrat?xpage=print');
        assert.match(await details.locator('iframe').getAttribute('title'), /Contrat/);
        assert.equal(await details.locator('a').getAttribute('target'), '_blank');
        assert.equal(await details.locator('a').getAttribute('rel'), 'noopener noreferrer');
        assert.equal(await page.evaluate(() => testState.decisions.length), 0);
      } finally { await page.close(); }
    });

    await check('Proposal names are escaped and external or javascript preview URLs are ignored', async () => {
      const page = await setup(browser, { proposals: [proposal('Unsafe', { title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', 'url-preview': 'https://other.test/file' })] });
      try {
        await open(page);
        await page.locator('[data-architecture-proposal-preview]').last().click();
        assert.equal(await page.locator('#architecture-proposal-details iframe, #architecture-proposal-details a, #architecture-tree img').count(), 0);
        assert.match(await page.locator('#architecture-proposal-details').innerText(), /<img src=x onerror=alert\(1\)>/);
        assert.deepEqual(await page.evaluate(() => testState.alerts), []);
      } finally { await page.close(); }
    });

    await check('Viewers can examine proposals but do not receive validation controls', async () => {
      const page = await setup(browser, { reviewer: false });
      try {
        await open(page);
        assert.equal(await page.locator('.architecture-row-proposed').count(), 2);
        assert.equal(await page.locator('[data-architecture-proposal-decision]').count(), 0);
        await page.evaluate(() => decideDocumentationProposal(Object.values(architectureState.nodes).find(node => node.proposalRef), 'accept'));
        assert.equal(await page.evaluate(() => testState.decisions.length), 0);
      } finally { await page.close(); }
    });

    await check('Missing or cyclic proposed parents cannot break the existing tree', async () => {
      const page = await setup(browser, { proposals: [
        proposal('Orphelin', { 'parent-ref': 'Missing.WebHome' }),
        proposal('CycleA', { type: 'folder', 'parent-proposal-ref': space + 'CycleB' }),
        proposal('CycleB', { type: 'folder', 'parent-proposal-ref': space + 'CycleA' })
      ] });
      try {
        await open(page);
        assert.equal(await page.locator('.architecture-row-proposed').count(), 3);
        assert.equal(await page.evaluate(ref => architectureState.nodes['proposal:' + ref].parentRef, space + 'Orphelin'), root);
        assert.equal(await page.evaluate(() => Object.values(architectureState.nodes).some(node => node.proposalRef && architectureWouldCreateCycle(node.id, node.parentRef))), false);
      } finally { await page.close(); }
    });

    await check('Settings are hidden from non-administrators and direct calls cannot open the settings dialog', async () => {
      const page = await workflowPage(browser, { configure: false, propose: true });
      try {
        assert.equal(await page.locator('#doc-settings').isVisible(), false);
        await page.evaluate(() => DocPropositions.openSettings());
        assert.equal(await page.locator('dialog').count(), 0);
        assert.equal(await page.evaluate(() => DocPropositions.modeFor('content')), 'proposal');
        assert.equal(await page.locator('#doc-contribution-mode').count(), 0);
      } finally { await page.close(); }
    });

    await check('Administrators save independent group grants with CSRF and the current configuration version', async () => {
      const page = await workflowPage(browser, { configure: true, create: true, propose: true, review: true });
      try {
        assert.equal(await page.locator('#doc-settings').isVisible(), true);
        await page.locator('#doc-settings').click();
        const dialog = page.getByRole('dialog', { name: 'Paramètres de la documentation' });
        await dialog.waitFor();
        assert.equal(await dialog.locator('input[data-right="propose"]').isChecked(), true);
        assert.equal(await dialog.locator('input[data-right="content"]').isChecked(), false);
        await dialog.locator('input[data-right="content"]').check();
        await dialog.getByRole('button', { name: 'Enregistrer les autorisations' }).click();
        await page.waitForFunction(() => !document.querySelector('dialog'));
        const saved = await page.evaluate(() => testWorkflow.requests.find(request => request.action === 'enregistrer parametres'));
        assert.equal(saved.method, 'POST');
        assert.equal(saved.credentials, 'same-origin');
        assert.equal(saved.values.form_token, 'test-csrf');
        assert.equal(saved.values.expectedVersion, '4.2');
        assert.equal(saved.values.content_groups, 'XWiki.Contributors');
        assert.equal(saved.values.propose_groups, 'XWiki.Contributors');
        assert.equal(saved.values.create_groups, '');
        assert.equal(saved.values.review_groups, '');
      } finally { await page.close(); }
    });

    await check('An administrator without action grants can configure settings but cannot create, import, move, edit, propose, validate or delete', async () => {
      const rights = ['create', 'import', 'move', 'modify', 'content', 'propose', 'review', 'delete'];
      const page = await workflowPage(browser, { configure: true, ...Object.fromEntries(rights.map(right => [right, false])) }, { groupGrants: {} });
      try {
        await addCreationUI(page);
        await addExplorerUI(page);
        assert.equal(await page.locator('#doc-settings').isVisible(), true);
        assert.equal(await page.locator('#doc-add-folder').isVisible(), false);
        assert.equal(await page.locator('#doc-add-document').isVisible(), false);
        assert.deepEqual(await page.evaluate(rights => rights.map(right => DocPropositions.can(right)), rights), rights.map(() => false));
        assert.deepEqual(await page.evaluate(rights => rights.map(right => DocPropositions.modeFor(right)), rights), rights.map(() => ''));

        await page.evaluate(async ref => {
          testWorkflow.requests = [];
          await ajouterFichier();
          await ajouterDocument();
          await DocPropositions.openContentEditor(ref);
          await deleteExplorerItems(document.getElementById('box'), [{ ref, title: 'Guide', type: 'document' }]);
        }, existing);
        assert.equal(await page.locator('#popup').isVisible(), false);
        assert.equal(await page.locator('dialog').count(), 0);
        for (const action of ['deplacer element', 'supprimer element']) {
          const message = await page.evaluate(async ({ action, ref, target }) => {
            try { await postExplorerAction({ action, source_ref: ref, target_parent_ref: target }); return ''; }
            catch (error) { return error.message; }
          }, { action, ref: existing, target: root });
          assert.match(message, /droit|autoris/i);
        }
        const reviewError = await page.evaluate(async () => {
          try { await DocPropositions.proposalAction('proposal', 'accept', '', '1.1'); return ''; }
          catch (error) { return error.message; }
        });
        assert.match(reviewError, /validation/);

        await open(page, '');
        assert.equal(await page.locator('.architecture-row[draggable="true"], .architecture-drop-target').count(), 0);
        assert.equal(await page.locator('#architecture-validate-btn').isVisible(), false);
        assert.equal(await page.locator('#architecture-delete-btn').isVisible(), false);
        const drag = await page.evaluate(({ ref, targetRef }) => {
          const row = document.querySelector('.architecture-row[data-architecture-ref="' + ref + '"]');
          const target = document.querySelector('.architecture-row[data-architecture-ref="' + targetRef + '"]');
          const start = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
          row.dispatchEvent(start);
          target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
          return { refused: start.defaultPrevented, parent: architectureState.nodes[ref].parentRef };
        }, { ref: existing, targetRef: root });
        assert.deepEqual(drag, { refused: true, parent: folder });
        await page.evaluate(async ref => {
          architectureState.selected[ref] = true;
          await deleteArchitectureSelection(document.getElementById('box'));
        }, existing);
        assert.equal(await page.evaluate(() => testWorkflow.requests.filter(request => request.method === 'POST').length), 0);
        assert.equal(await page.evaluate(() => testWorkflow.confirmations.length), 0);
        await page.evaluate(() => closeArchitectureEditor());

        await page.locator('#doc-settings').click();
        const dialog = page.getByRole('dialog', { name: 'Paramètres de la documentation' });
        await dialog.waitFor();
        assert.equal(await dialog.locator('input[type="checkbox"]:checked').count(), 0);
        await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
      } finally { await page.close(); }
    });

    await check('Saving and removing explicit group grants refreshes the workflow and enforces the new rights immediately', async () => {
      const page = await workflowPage(browser, { configure: true }, { groupGrants: {} });
      try {
        await addCreationUI(page);
        await addExplorerUI(page);
        // The combined fixture uses the real creation form, rather than the
        // token-only form needed by explorer-only scenarios.
        await page.evaluate(() => document.querySelector('#box #formulairePopup').remove());
        await page.locator('#doc-settings').click();
        let dialog = page.getByRole('dialog', { name: 'Paramètres de la documentation' });
        await dialog.waitFor();
        await dialog.locator('input[data-right="create"]').check();
        await dialog.locator('input[data-right="delete"]').check();
        await dialog.getByRole('button', { name: 'Enregistrer les autorisations' }).click();
        await page.waitForFunction(() => !document.querySelector('dialog'));
        assert.equal(await page.locator('#doc-add-folder').isVisible(), true);
        assert.equal(await page.locator('#explorer-delete-btn').isVisible(), true);
        assert.deepEqual(await page.evaluate(() => ['create', 'delete', 'propose', 'move'].map(right => DocPropositions.modeFor(right))), ['direct', 'direct', '', '']);
        assert.equal(await page.evaluate(() => DocPropositions.can('configure')), true);

        await page.evaluate(() => ajouterFichier());
        await page.locator('#folder-name-input').fill('Nouveau');
        await page.locator('#btn-popup-valide').click();
        await page.waitForFunction(() => document.getElementById('popup').style.display === 'none');
        await deleteInUI(page, 'explorer');
        const mutations = await page.evaluate(() => testWorkflow.requests.filter(request =>
          ['ajouter un fichier', 'supprimer element'].includes(request.action)));
        assert.equal(mutations.length, 2);
        assert.ok(mutations.every(request => request.values.mode === 'direct'));

        await page.locator('#doc-settings').click();
        dialog = page.getByRole('dialog', { name: 'Paramètres de la documentation' });
        await dialog.waitFor();
        assert.equal(await dialog.locator('input[data-right="create"]').isChecked(), true);
        assert.equal(await dialog.locator('input[data-right="delete"]').isChecked(), true);
        assert.equal(await dialog.locator('input[data-right="propose"]').isChecked(), false);
        await dialog.locator('input[data-right="create"]').uncheck();
        await dialog.locator('input[data-right="delete"]').uncheck();
        await dialog.getByRole('button', { name: 'Enregistrer les autorisations' }).click();
        await page.waitForFunction(() => !document.querySelector('dialog'));
        assert.equal(await page.locator('#doc-add-folder').isVisible(), false);
        assert.equal(await page.locator('#doc-add-document').isVisible(), false);
        assert.equal(await page.locator('#explorer-delete-btn').isVisible(), false);
        assert.deepEqual(await page.evaluate(() => ['create', 'delete', 'propose'].map(right => DocPropositions.modeFor(right))), ['', '', '']);
        assert.equal(await page.locator('#doc-settings').isVisible(), true);

        await page.evaluate(async ref => {
          testWorkflow.requests = [];
          await ajouterFichier();
          await deleteExplorerItems(document.getElementById('box'), [{ ref, title: 'Guide', type: 'document' }]);
        }, existing);
        assert.equal(await page.locator('#popup').isVisible(), false);
        assert.equal(await page.evaluate(() => testWorkflow.requests.filter(request => request.method === 'POST').length), 0);
        const workflow = await page.evaluate(async () => {
          const result = await DocPropositions.request('workflow');
          const permissions = result.getElementById('documentation-permissions');
          return { version: permissions.getAttribute('data-settings-version'),
            create: permissions.getAttribute('data-can-create'), delete: permissions.getAttribute('data-can-delete'),
            grants: result.querySelectorAll('.doc-grant-data').length };
        });
        assert.deepEqual(workflow, { version: '4.4', create: 'false', delete: 'false', grants: 0 });
      } finally { await page.close(); }
    });

    await check('Content changes preserve their base version and use proposal mode when only proposing is allowed', async () => {
      const page = await workflowPage(browser, { propose: true, content: false });
      try {
        await page.evaluate(() => DocPropositions.openContentEditor('TestPage.PAGE.doc-test.RH.Guide.WebHome'));
        const dialog = page.getByRole('dialog', { name: /^(Modifier le contenu du document|Proposer une modification du contenu)$/ });
        await dialog.locator('textarea').fill('**Contenu proposé**');
        await dialog.getByRole('button', { name: 'Proposer les modifications' }).click();
        await page.waitForFunction(() => !document.querySelector('dialog'));
        const saved = await page.evaluate(() => testWorkflow.requests.find(request => request.action === 'modifier contenu document'));
        assert.equal(saved.values.mode, 'proposal');
        assert.equal(saved.values.base_version, '3.7');
        assert.equal(saved.values.content, '**Contenu proposé**');
        assert.equal(saved.values.source_ref, existing);
        assert.equal(saved.values.form_token, 'test-csrf');
      } finally { await page.close(); }
    });

    await check('Mutation preparation preserves import batches, obtains source versions, and reports server errors', async () => {
      const page = await workflowPage(browser, { move: true, propose: true, review: false });
      try {
        const parameters = await page.evaluate(async () => {
          const batch = DocPropositions.beginBatch();
          const params = await DocPropositions.postActionParameters('move', { action: 'deplacer element', source_ref: 'TestPage.PAGE.doc-test.RH.Guide.WebHome' });
          DocPropositions.endBatch();
          return { params, batch, ended: DocPropositions.batchId() };
        });
        assert.equal(parameters.params.mode, 'direct');
        assert.equal(parameters.params.base_version, '3.7');
        assert.equal(parameters.params.batch_id, parameters.batch);
        assert.ok(parameters.batch);
        assert.equal(parameters.ended, '');
        assert.equal(await page.evaluate(async () => {
          try { await DocPropositions.proposalAction('proposal', 'accept', '', '1.1'); return ''; }
          catch (error) { return error.message; }
        }), 'Le droit de validation est nécessaire.');
        const error = await page.evaluate(async () => {
          testWorkflow.fail = 'workflow';
          try { await DocPropositions.request('workflow'); return ''; } catch (error) { return error.message; }
        });
        assert.equal(error, 'Action refusée');
      } finally { await page.close(); }
    });

    await check('An imported branch submits separate proposal pages with shared batch, proposed parents, and actual multipart files', async () => {
      const page = await workflowPage(browser, { propose: true, create: false, import: false });
      try {
        await page.evaluate(parent => {
          const host = document.createElement('div');
          host.innerHTML = '<div id="pageData" parent-page="' + parent + '"></div>' +
            '<div id="popup" style="display:none"><form id="formulairePopup"><input name="form_token" value="test-csrf">' +
            '<div id="popupContent"></div><button id="btn-popup-valide" type="button">Valider</button></form></div>';
          document.body.appendChild(host);
          window.uploads = []; window.alerts = []; window.openedProposals = 0;
          window.LienPerso = () => {};
          window.alert = message => alerts.push(message);
          window.openDocumentationProposals = () => { openedProposals++; };
          const previousFetch = window.fetch;
          window.fetch = async (url, options = {}) => {
            const values = Object.fromEntries(options.body || []);
            if (!/^ajouter un /.test(values.action || '')) return previousFetch(url, options);
            const file = options.body.get('filePath');
            const ref = 'TestPage.PAGE.doc-test.PROPOSITIONS.P' + (uploads.length + 1);
            uploads.push({ values: Object.fromEntries(Array.from(options.body).filter(([key]) => key !== 'filePath')),
              file: file ? { name: file.name, size: file.size, content: await file.text() } : null, ref });
            return { ok: true, text: async () => '<div id="creation-result" data-proposal-ref="' + ref + '"></div>PROPOSITION_OK' };
          };
        }, root);
        await page.addScriptTag({ path: path.join(codeDir, 'Popup.js') });
        await page.evaluate(async () => {
          await ajouterFichier();
          const file = new File(['pdf-content'], 'contrat.pdf', { type: 'application/pdf' });
          Object.defineProperty(file, 'webkitRelativePath', { value: 'Archive/Sous/contrat.pdf' });
          const branch = buildBranchTreeFromFiles([file]);
          branch.children.push(createBranchFolderNode('Vide'));
          prepareBranchTree(branch);
          branchImportSelection = { root: branch, sourceMode: 'directory-handle' };
          await popupValider();
        });
        const result = await page.evaluate(() => ({ uploads, alerts, opened: openedProposals, batchEnded: DocPropositions.batchId() }));
        assert.equal(result.uploads.length, 4, 'the root, subfolder, document and empty folder each get a proposal');
        const byTitle = Object.fromEntries(result.uploads.map(item => [item.values.nom_fichier, item]));
        assert.ok(byTitle.Archive && byTitle.Sous && byTitle.contrat && byTitle.Vide);
        assert.equal(byTitle.Archive.values.parent_proposal_ref, '');
        assert.equal(byTitle.Sous.values.parent_proposal_ref, byTitle.Archive.ref);
        assert.equal(byTitle.contrat.values.parent_proposal_ref, byTitle.Sous.ref);
        assert.equal(byTitle.Vide.values.parent_proposal_ref, byTitle.Archive.ref);
        for (const upload of result.uploads) {
          assert.equal(upload.values.mode, 'proposal');
          assert.equal(upload.values.intent, 'import');
          assert.equal(upload.values.page, root);
          assert.equal(upload.values.form_token, 'test-csrf');
          assert.equal(upload.values.batch_id, result.uploads[0].values.batch_id);
          assert.ok(upload.values.batch_id);
        }
        assert.deepEqual(byTitle.contrat.file, { name: 'contrat.pdf', size: 11, content: 'pdf-content' });
        assert.deepEqual(result.alerts, []);
        assert.equal(result.opened, 1);
        assert.equal(result.batchEnded, '');
      } finally { await page.close(); }
    });

    await check('Replacement files are proposed as multipart content without treating error-code text in a document as a server failure', async () => {
      const page = await workflowPage(browser, { propose: true });
      try {
        await page.evaluate(async () => {
          testWorkflow.source = 'Le guide contient le code ERREUR_CSRF en exemple.';
          await DocPropositions.openContentEditor('TestPage.PAGE.doc-test.RH.Guide.WebHome');
        });
        const dialog = page.getByRole('dialog', { name: /^(Modifier le contenu du document|Proposer une modification du contenu)$/ });
        assert.match(await dialog.locator('textarea').inputValue(), /ERREUR_CSRF/);
        await dialog.locator('input[type="file"]').setInputFiles({ name: 'Remplacement.pdf', mimeType: 'application/pdf', buffer: Buffer.from('new-pdf') });
        await dialog.getByRole('button', { name: 'Proposer les modifications' }).click();
        await page.waitForFunction(() => !document.querySelector('dialog'));
        const submitted = await page.evaluate(async () => {
          const request = testWorkflow.requests.find(value => value.action === 'modifier contenu document');
          const file = request.values.filePath;
          return { kind: request.values.source_kind, filename: request.values.source_filename,
            mode: request.values.mode, content: request.values.content, file: { name: file.name, contents: await file.text() } };
        });
        assert.equal(submitted.mode, 'proposal');
        assert.equal(submitted.kind, 'pdf');
        assert.equal(submitted.filename, 'Remplacement.pdf');
        assert.match(submitted.content, /ERREUR_CSRF/);
        assert.deepEqual(submitted.file, { name: 'Remplacement.pdf', contents: 'new-pdf' });
      } finally { await page.close(); }
    });

    await check('Each operation chooses direct rights before proposing, without a contribution selector or deletion proposals', async () => {
      for (const grants of [
        { create: true, import: true, content: true, propose: false },
        { create: true, import: false, content: true, propose: true },
        { create: false, import: false, content: false, propose: true },
        { create: false, import: false, content: false, propose: false }
      ]) {
        const page = await workflowPage(browser, grants);
        try {
          assert.equal(await page.locator('#doc-contribution-mode').count(), 0);
          const actual = await page.evaluate(() => ['create', 'import', 'content', 'delete'].map(right => DocPropositions.modeFor(right)));
          const expected = grants.create ? ['direct', grants.import ? 'direct' : 'proposal', 'direct', ''] :
            grants.propose ? ['proposal', 'proposal', 'proposal', ''] : ['', '', '', ''];
          assert.deepEqual(actual, expected);
          if (!grants.create && !grants.propose) {
            assert.equal(await page.locator('#doc-add-folder').isVisible(), false);
            assert.equal(await page.locator('#doc-add-document').isVisible(), false);
          }
        } finally { await page.close(); }
      }
    });

    await check('Manual folder creation publishes directly for creators and submits only a proposal for proposers', async () => {
      for (const grants of [{ create: true, propose: false }, { create: true, propose: true }, { create: false, propose: true }]) {
        const page = await workflowPage(browser, grants);
        try {
          await addCreationUI(page);
          if (!grants.create) await page.evaluate(() => {
            testWorkflow.responses['ajouter un fichier'] = {
              body: '<div id="creation-result" data-code="PROPOSITION_OK" data-proposal-ref="TestPage.PAGE.doc-test.PROPOSITIONS.P1"></div>PROPOSITION_OK'
            };
          });
          await page.evaluate(() => ajouterFichier());
          await page.locator('#folder-name-input').fill('Nouveau');
          assert.match(await page.locator('#btn-popup-valide').innerText(), grants.create ? /créer/i : /proposer/i);
          await page.locator('#btn-popup-valide').click();
          await page.waitForFunction(() => document.getElementById('popup').style.display === 'none');
          const requests = await page.evaluate(() => testWorkflow.requests.filter(request => request.action === 'ajouter un fichier'));
          assert.equal(requests.length, 1);
          assert.equal(requests[0].method, 'POST');
          assert.equal(requests[0].values.mode, grants.create ? 'direct' : 'proposal');
          assert.equal(requests[0].values.form_token, 'test-csrf');
          assert.deepEqual(await page.evaluate(() => testWorkflow.alerts), []);
        } finally { await page.close(); }
      }
    });

    await check('Manual calls cannot open creation or submit an import when the required rights are absent', async () => {
      const page = await workflowPage(browser, { create: false, import: false, propose: false });
      try {
        await addCreationUI(page);
        await page.evaluate(async () => { await ajouterFichier(); await ajouterDocument(); });
        assert.equal(await page.locator('#popup').isVisible(), false);
        assert.equal(await page.evaluate(() => testWorkflow.requests.filter(request => /^ajouter un /.test(request.action)).length), 0);
        const messages = await page.locator('#notification').innerText();
        assert.ok(messages.length > 0 && messages.length < 300);
        assert.doesNotMatch(messages, /ERREUR_|Exception|<[^>]+>|\bat org\./);
      } finally { await page.close(); }
    });

    await check('Structured refusals, raw rights codes and HTML exceptions become short readable request errors', async () => {
      const page = await workflowPage(browser, { content: true });
      try {
        for (const response of [
          { status: 200, body: '<div id="documentation-error" data-message="Vous ne pouvez pas ajouter de document.">ERREUR_DROITS</div>', expected: /Vous ne pouvez pas ajouter de document\./ },
          { status: 200, body: 'ERREUR_DROITS', expected: /droit|autoris/i },
          { status: 403, body: '<html><h1>Forbidden</h1><pre>org.xwiki.security.AuthorizationException: secret</pre></html>', expected: /droit|autoris|refus/i },
          { status: 500, body: '<html><h1>Failed to execute Velocity macro</h1><pre>org.xwiki.rendering.MacroExecutionException\n at org.xwiki.secret.run(Secret.java:63)</pre></html>', expected: /échou|erreur|impossible|indisponible/i }
        ]) {
          const message = await page.evaluate(async response => {
            testWorkflow.responses['modifier contenu document'] = response;
            try { await DocPropositions.request('modifier contenu document', { source_ref: 'source' }); return ''; }
            catch (error) { return error.message; }
          }, response);
          assert.match(message, response.expected);
          assert.ok(message.length < 300);
          assert.doesNotMatch(message, /ERREUR_|Exception|<[^>]+>|org\.xwiki|Secret\.java/);
        }
      } finally { await page.close(); }
    });

    await check('Creation refusal stays in the popup with a clean message and no false successful refresh', async () => {
      const page = await workflowPage(browser, { create: true, propose: false });
      try {
        await addCreationUI(page);
        await page.evaluate(() => {
          testWorkflow.responses['ajouter un fichier'] = {
            status: 403, body: '<html><h1>Failed Velocity</h1><pre>org.xwiki.AccessDeniedException\n at internal.Wiki.save(Wiki.java:33)</pre></html>'
          };
        });
        await page.evaluate(() => ajouterFichier());
        await page.locator('#folder-name-input').fill('Nouveau');
        await page.locator('#btn-popup-valide').click();
        await page.waitForFunction(() => !document.getElementById('btn-popup-valide').disabled);
        assert.equal(await page.locator('#popup').isVisible(), true);
        const displayed = await page.evaluate(() => [document.getElementById('popup').innerText,
          document.getElementById('notification').innerText, ...testWorkflow.alerts].join('\n'));
        assert.match(displayed, /droit|autoris|refus/i);
        assert.doesNotMatch(displayed, /ERREUR_|Exception|org\.xwiki|Wiki\.java|Failed Velocity/);
        assert.equal(await page.evaluate(() => testWorkflow.refreshes), 0);
      } finally { await page.close(); }
    });

    await check('A refused multipart file import keeps the selected file and shows only a short inline error', async () => {
      for (const response of [
        { status: 200, body: '<div id="documentation-error" data-message="Votre groupe ne peut plus importer de fichiers.">ERREUR_DROITS</div>' },
        { status: 200, body: 'ERREUR_DROITS' },
        { status: 500, body: '<html><h1>Failed Velocity macro</h1><pre>org.xwiki.MacroExecutionException at Importer.java:87</pre></html>' }
      ]) {
        const page = await workflowPage(browser, { create: false, import: true, propose: false });
        try {
          await addCreationUI(page);
          await page.evaluate(response => { testWorkflow.responses['ajouter un document'] = response; }, response);
          await page.evaluate(() => ajouterDocument());
          await page.locator('#document-file-input').setInputFiles({ name: 'contrat.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf-file') });
          assert.equal(await page.locator('#btn-popup-valide').innerText(), 'Importer');
          await page.locator('#btn-popup-valide').click();
          await page.waitForFunction(() => !document.getElementById('btn-popup-valide').disabled);
          const state = await page.evaluate(() => ({
            message: document.getElementById('documentation-popup-status').textContent,
            uploads: testWorkflow.requests.filter(request => request.action === 'ajouter un document'),
            refreshes: testWorkflow.refreshes, selected: documentImportSelection.length
          }));
          assert.equal(state.uploads.length, 1);
          assert.equal(state.uploads[0].values.mode, 'direct');
          assert.equal(state.uploads[0].values.intent, 'import');
          assert.equal(state.selected, 1);
          assert.equal(state.refreshes, 0);
          assert.ok(state.message.length > 0 && state.message.length < 300);
          assert.doesNotMatch(state.message, /ERREUR_|Exception|org\.xwiki|Importer\.java|Failed Velocity/);
          assert.equal(await page.locator('#popup').isVisible(), true);
        } finally { await page.close(); }
      }
    });

    await check('Explorer and Architecture reject every deletion entry point without delete rights, even for proposers', async () => {
      for (const mode of ['explorer', 'architecture']) {
        const page = await workflowPage(browser, { create: true, propose: true, delete: false, move: true });
        try {
          await addExplorerUI(page);
          await deleteInUI(page, mode);
          const directError = await page.evaluate(async ref => {
            try { await postExplorerAction({ action: 'supprimer element', source_ref: ref }); return ''; }
            catch (error) { return error.message; }
          }, existing);
          assert.match(directError, /droit|autoris|refus/i);
          assert.equal(await page.evaluate(() => testWorkflow.requests.filter(request => request.action === 'supprimer element').length), 0);
          assert.equal(await page.evaluate(() => testWorkflow.confirmations.length), 0);
          assert.equal(await page.locator(mode === 'explorer' ? '#explorer-delete-btn' : '#architecture-delete-btn').isVisible(), false);
          assert.equal(await page.evaluate(() => testWorkflow.refreshes), 0);
          if (mode === 'architecture') assert.equal(await page.evaluate(ref => !!architectureState.nodes[ref], existing), true);
        } finally { await page.close(); }
      }
    });

    await check('A server deletion refusal preserves both views and never displays a successful deletion or raw exception', async () => {
      for (const mode of ['explorer', 'architecture']) {
        for (const response of [
          { status: 200, body: '<div id="documentation-error" data-message="Vous ne disposez pas du droit de suppression.">ERREUR_DROITS</div>' },
          { status: 200, body: 'ERREUR_DROITS' },
          { status: 500, body: '<html><h1>Failed Velocity macro</h1><pre>org.xwiki.MacroExecutionException at Wiki.delete(Wiki.java:13)</pre></html>' }
        ]) {
          const page = await workflowPage(browser, { delete: true, propose: false, move: true });
          try {
            await addExplorerUI(page);
            await page.evaluate(response => { testWorkflow.responses['supprimer element'] = response; }, response);
            await deleteInUI(page, mode);
            const result = await page.evaluate(() => ({ alerts: testWorkflow.alerts, refreshes: testWorkflow.refreshes,
              requests: testWorkflow.requests.filter(request => request.action === 'supprimer element'),
              notification: document.getElementById('notification').innerText }));
            assert.equal(result.requests.length, 1);
            assert.equal(result.requests[0].values.mode, 'direct');
            assert.equal(result.refreshes, 0);
            const messages = [...result.alerts, result.notification].join('\n');
            assert.ok(messages.length > 0 && messages.length < 500);
            assert.doesNotMatch(messages, /ERREUR_|Exception|org\.xwiki|Wiki\.java|Failed Velocity|1 élément\(s\) supprimé|suppression réussie/i);
            if (mode === 'architecture') assert.equal(await page.evaluate(ref => !!architectureState.nodes[ref] && architectureState.selected[ref], existing), true);
            else assert.equal(await page.locator('.explorer-row').count(), 1);
          } finally { await page.close(); }
        }
      }
    });

    await check('Allowed deletions in both views post their CSRF token and source version in direct mode', async () => {
      for (const mode of ['explorer', 'architecture']) {
        const page = await workflowPage(browser, { delete: true, propose: true, move: true });
        try {
          await addExplorerUI(page);
          await deleteInUI(page, mode);
          const result = await page.evaluate(() => ({ requests: testWorkflow.requests.filter(request => request.action === 'supprimer element'),
            alerts: testWorkflow.alerts, refreshes: testWorkflow.refreshes }));
          assert.equal(result.requests.length, 1);
          assert.equal(result.requests[0].method, 'POST');
          assert.equal(result.requests[0].credentials, 'same-origin');
          assert.equal(result.requests[0].values.form_token, 'test-csrf');
          assert.equal(result.requests[0].values.base_version, '3.7');
          assert.equal(result.requests[0].values.source_ref, existing);
          assert.equal(result.requests[0].values.mode, 'direct');
          assert.equal(result.refreshes, 1);
          assert.deepEqual(result.alerts, []);
        } finally { await page.close(); }
      }
    });

    await check('Content editors distinguish direct saving from proposing when the same user can also propose', async () => {
      const page = await workflowPage(browser, { content: true, propose: true });
      try {
        await page.evaluate(() => DocPropositions.openContentEditor('TestPage.PAGE.doc-test.RH.Guide.WebHome'));
        const dialog = page.getByRole('dialog', { name: /^(Modifier le contenu du document|Proposer une modification du contenu)$/ });
        assert.equal(await dialog.getByRole('button', { name: 'Proposer les modifications' }).count(), 0);
        await dialog.locator('textarea').fill('Modification autorisée');
        await dialog.getByRole('button', { name: 'Enregistrer les modifications' }).click();
        await page.waitForFunction(() => !document.querySelector('dialog'));
        const request = await page.evaluate(() => testWorkflow.requests.find(request => request.action === 'modifier contenu document'));
        assert.equal(request.values.mode, 'direct');
      } finally { await page.close(); }
    });

    await check('Metadata controls and manual tag calls respect reader rights, while authorized users get the correct initial action', async () => {
      for (const grants of [{ modify: false, propose: false }, { modify: false, propose: true }, { modify: true, propose: true }]) {
        const page = await workflowPage(browser, grants);
        try {
          await page.evaluate(() => {
            const sidebar = document.createElement('div');
            sidebar.id = 'preview-sidebar';
            sidebar.innerHTML = '<textarea id="sidebar-desc-input">Description</textarea><div id="sidebar-tags-list"></div>' +
              '<input id="sidebar-tag-input"><button id="sidebar-tag-add">Ajouter</button>' +
              '<button id="sidebar-metadata-save">Enregistrer</button><div id="sidebar-metadata-status"></div>';
            document.body.appendChild(sidebar);
          });
          await page.addScriptTag({ path: path.join(codeDir, 'SidebarPreview.js') });
          await page.evaluate(ref => {
            sidebarCurrentDocumentRef = ref;
            sidebarCurrentTags = ['Initial'];
            sidebarMetadataDirty = false;
            renderSidebarTags();
            initSidebarPreview(document);
            DocPropositions.applyPermissions();
          }, existing);
          if (!grants.modify && !grants.propose) {
            assert.equal(await page.locator('.sidebar-tag-remove:visible').count(), 0);
            assert.equal(await page.locator('#sidebar-tag-input').isDisabled(), true);
            assert.equal(await page.locator('#sidebar-metadata-save').isVisible(), false);
            await page.evaluate(async () => {
              document.getElementById('sidebar-tag-input').value = 'Interdit';
              addSidebarTagsFromInput();
              removeSidebarTag(0);
              markSidebarMetadataDirty();
              await saveSidebarMetadata();
            });
            assert.deepEqual(await page.evaluate(() => sidebarCurrentTags), ['Initial']);
            assert.equal(await page.evaluate(() => sidebarMetadataDirty), false);
            assert.equal(await page.evaluate(() => testWorkflow.requests.filter(request => request.action === 'modifier metadonnees document').length), 0);
          } else {
            assert.equal(await page.locator('#sidebar-metadata-save').innerText(), grants.modify ? 'Enregistrer' : 'Proposer la modification');
            await page.locator('#sidebar-tag-input').fill('Nouveau');
            await page.locator('#sidebar-tag-add').click();
            await page.locator('.sidebar-tag-remove').first().click();
            assert.deepEqual(await page.evaluate(() => sidebarCurrentTags), ['Nouveau']);
            await page.locator('#sidebar-metadata-save').click();
            await page.waitForFunction(() => !document.getElementById('sidebar-metadata-save').disabled);
            const request = await page.evaluate(() => testWorkflow.requests.find(request => request.action === 'modifier metadonnees document'));
            assert.ok(request);
            assert.equal(request.values.mode, grants.modify ? 'direct' : 'proposal');
            assert.equal(request.values.tags, 'Nouveau');
            assert.equal(request.values.base_version, '3.7');
          }
        } finally { await page.close(); }
      }
    });
  } finally { await browser.close(); }
  console.log(passed + ' browser scenarios passed (COMMANDE simulated).');
})().catch(error => { console.error(error); process.exitCode = 1; });
