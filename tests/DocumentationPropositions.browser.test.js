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
      can: right => right === 'review' && testState.reviewer,
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

async function workflowPage(browser, permissions = {}) {
  const page = await browser.newPage();
  await page.route('https://wiki.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }));
  await page.goto('https://wiki.test/documentation');
  await page.setContent(`<!doctype html><html><body><input name="form_token" value="test-csrf">
    <div id="notification"></div><div id="box"></div>
    <button id="doc-settings" hidden>Paramètres</button><button id="doc-add-folder">Ajouter un dossier</button>
    <button id="doc-add-document">Ajouter un document</button>
    <select id="doc-contribution-mode"><option value="direct">Direct</option><option value="proposal">Proposer</option></select>
  </body></html>`);
  await page.evaluate(granted => {
    window.urlCommande = '/xwiki/bin/view/COMMANDE';
    window.testWorkflow = { granted, requests: [], fail: '' };
    window.fetch = async (url, options = {}) => {
      const parsedURL = new URL(url, location.href);
      const values = Object.fromEntries(options.body || parsedURL.searchParams);
      const action = values.action;
      testWorkflow.requests.push({ action, method: options.method || 'GET', values,
        credentials: options.credentials });
      let body = '';
      if (testWorkflow.fail === action) body = '<div id="documentation-error" data-message="Action refusée">ERREUR_DROITS</div>';
      else if (action === 'workflow') {
        body = '<div id="documentation-permissions" data-settings-version="4.2" ' +
          Object.entries(granted).map(([right, value]) => 'data-can-' + right + '="' + value + '"').join(' ') + '></div>' +
          '<div class="doc-group-data" data-ref="XWiki.Contributors" data-title="Contributeurs"></div>' +
          '<div class="doc-grant-data" data-right="propose" data-group="XWiki.Contributors"></div>';
      } else if (action === 'contenu document') body = '<div id="documentation-content" data-version="3.7"></div><textarea id="documentation-source">' + (testWorkflow.source || 'Contenu initial') + '</textarea>';
      else body = 'PROPOSITION_OK';
      return { ok: true, text: async () => body };
    };
  }, { view: true, ...permissions });
  await page.addScriptTag({ path: path.join(codeDir, 'Propositions.js') });
  await page.evaluate(() => DocPropositions.ready);
  return page;
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
        assert.equal(await page.locator('#doc-contribution-mode').inputValue(), 'proposal');
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

    await check('Content changes preserve their base version and use proposal mode when only proposing is allowed', async () => {
      const page = await workflowPage(browser, { propose: true, content: false });
      try {
        await page.evaluate(() => DocPropositions.openContentEditor('TestPage.PAGE.doc-test.RH.Guide.WebHome'));
        const dialog = page.getByRole('dialog', { name: 'Modifier le contenu du document' });
        await dialog.locator('textarea').fill('**Contenu proposé**');
        await dialog.getByRole('button', { name: 'Enregistrer / proposer' }).click();
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
          ajouterFichier();
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
        const dialog = page.getByRole('dialog', { name: 'Modifier le contenu du document' });
        assert.match(await dialog.locator('textarea').inputValue(), /ERREUR_CSRF/);
        await dialog.locator('input[type="file"]').setInputFiles({ name: 'Remplacement.pdf', mimeType: 'application/pdf', buffer: Buffer.from('new-pdf') });
        await dialog.getByRole('button', { name: 'Enregistrer / proposer' }).click();
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
  } finally { await browser.close(); }
  console.log(passed + ' browser scenarios passed (COMMANDE simulated).');
})().catch(error => { console.error(error); process.exitCode = 1; });
