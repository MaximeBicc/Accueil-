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
    window.testState = { architecture, proposals, reviewer, decisions: [], edits: [], requests: [], alerts: [], refreshes: 0,
      decisionFailures: {}, editFailure: '' };
    window.alert = value => testState.alerts.push(String(value));
    window.prompt = () => 'Document incomplet';
    const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const html = (className, values) => '<div class="' + className + '" ' + Object.entries(values)
      .map(([key, value]) => 'data-' + key + '="' + esc(value) + '"').join(' ') + '></div>';
    window.fetch = async url => {
      const action = new URL(url, location.href).searchParams.get('action');
      testState.requests.push(action);
      if (action !== 'architecture') throw new Error('Unexpected request: ' + action);
      return { ok: true, text: async () => '<div id="architecture-data" data-complete="true">' +
        testState.architecture.map(item => html('architecture-node-data', item)).join('') + '</div>' };
    };
    window.DocPropositions = {
      ready: Promise.resolve(),
      can: right => right === 'review' ? testState.reviewer : ['move', 'delete'].includes(right),
      modeFor: right => ['move', 'delete'].includes(right) ? 'direct' : '',
      request: async mode => {
        testState.requests.push(mode);
        return new DOMParser().parseFromString(testState.proposals
          .filter(item => item.status === (mode === 'corbeille' ? 'rejected' : 'pending'))
          .map(item => {
            const parent = testState.proposals.find(value => value.ref === item['parent-proposal-ref']);
            const values = parent && parent.status === 'accepted' ?
              { ...item, 'parent-ref': parent.publishedRef, 'parent-proposal-ref': '' } : item;
            return html('doc-proposal-data', values);
          }).join(''), 'text/html');
      },
      proposalAction: async (ref, decision, reason, version) => {
        testState.decisions.push({ ref, decision, reason, version });
        const item = testState.proposals.find(value => value.ref === ref);
        if (!item) throw new Error('Missing proposal');
        if (!testState.reviewer && decision !== 'restore') throw new Error('Le droit de validation est nécessaire.');
        if (testState.decisionFailures[ref]) throw new Error(testState.decisionFailures[ref]);
        if (version !== item.version) throw new Error('Cette proposition a changé. Rechargez-la.');
        if (decision === 'accept') {
          const parent = testState.proposals.find(value => value.ref === item['parent-proposal-ref']);
          if (parent && parent.status !== 'accepted') throw new Error('Le dossier proposé doit d’abord être validé.');
          item.status = 'accepted';
          item.publishedRef = ref + '.Published';
          testState.architecture.push({ ref: item.publishedRef, type: item.type, title: item.title,
            'parent-ref': parent ? parent.publishedRef : item['parent-ref'] });
        } else if (decision === 'reject') {
          item.status = 'rejected';
          item['review-comment'] = reason;
          item['deleted-at'] = '16/10/2026 09:30';
          item['expires-at'] = '23/10/2026 09:30';
        } else if (decision === 'restore') {
          item.status = 'pending';
        }
      },
      updateProposal: async (ref, parameters, version) => {
        testState.edits.push({ ref, parameters, version });
        const item = testState.proposals.find(value => value.ref === ref);
        if (!testState.reviewer && (!item || item['can-edit'] !== 'true')) throw new Error('Vous ne pouvez pas modifier cette proposition.');
        if (testState.editFailure) throw new Error(testState.editFailure);
        if (!item || item.status !== 'pending') throw new Error('Cette proposition n’est plus en attente.');
        if (version !== item.version) throw new Error('Cette proposition a changé. Rechargez-la.');
        Object.assign(item, { title: parameters.title, 'parent-ref': parameters.parent_ref,
          'parent-proposal-ref': parameters.parent_proposal_ref, version: '1.2' });
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

async function confirmProposalBulk(page, scope, ref) {
  const selector = '[data-architecture-proposal-bulk="' + scope + '"]' +
    (ref ? '[data-architecture-proposal-ref="' + ref + '"]' : '');
  await page.locator(selector).first().click();
  await page.locator('#documentation-proposal-bulk-dialog').waitFor();
  assert.equal(await page.evaluate(() => testState.decisions.length), 0, 'opening the review summary must never publish');
  await page.locator('#documentation-proposal-bulk-confirm').click();
  await page.locator('#documentation-proposal-bulk-dialog').getByRole('button', { name: 'Fermer', exact: true }).waitFor();
}

function webHomeToolbar(permissions) {
  const source = fs.readFileSync(path.join(codeDir, '..', 'WebHome.xwiki'), 'utf8');
  const toolbar = source.match(/<div class="doc-propositions-toolbar">[\s\S]*?<\/div>/);
  assert.ok(toolbar, 'the test must start from the actual WebHome toolbar');
  // This toolbar only uses simple permission guards. Evaluate those guards as
  // they are evaluated at the initial page request, before settings are saved.
  // Keeping them here catches buttons omitted by Velocity, which a fixture
  // that always invents both buttons cannot detect.
  return toolbar[0].replace(/#if\(([^\n)]+)\)([\s\S]*?)#end/g, (_, condition, body) => {
    const enabled = condition.split('||').some(value => {
      const right = value.trim().match(/^\$can([A-Z][A-Za-z]*)$/);
      assert.ok(right, 'unsupported WebHome toolbar permission guard: ' + condition);
      const name = right[1].charAt(0).toLowerCase() + right[1].slice(1);
      return permissions[name] === true;
    });
    return enabled ? body : '';
  });
}

async function workflowPage(browser, permissions = {}, options = {}) {
  const page = await browser.newPage();
  await page.route('https://wiki.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }));
  await page.goto('https://wiki.test/documentation');
  const toolbar = options.webHomeToolbar ? webHomeToolbar(permissions) :
    '<button id="doc-settings" hidden>Paramètres</button><button id="doc-add-folder">Ajouter un dossier</button>' +
    '<button id="doc-add-document">Ajouter un document</button>';
  await page.setContent(`<!doctype html><html><body><input name="form_token" value="test-csrf">
    <div id="notification"></div><div id="box"></div>
    ${toolbar}
  </body></html>`);
  for (const stylesheet of ['FileExplorer.css', 'Propositions.css']) {
    await page.addStyleTag({ path: path.join(codeDir, stylesheet) });
  }
  await page.evaluate(({ granted, groupGrants }) => {
    window.urlCommande = '/xwiki/bin/view/COMMANDE';
    window.testWorkflow = { granted, groupGrants, settingsVersion: '4.2', requests: [], fail: '', responses: {}, alerts: [], confirmations: [], refreshes: 0,
      deletionNodes: [] };
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
      } else if (action === 'apercu suppression') {
        const source = values.source_ref;
        const prefix = source.replace(/\.WebHome$/, '.');
        const esc = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        const descendants = testWorkflow.deletionNodes.filter(item => item.ref === source || item.ref.startsWith(prefix));
        body = '<div id="deletion-preview-data" data-ref="' + esc(source) + '" data-complete="true">' + descendants.map(item =>
          '<div class="deletion-node-data" ' + Object.entries({ ...item,
            'parent-ref': item.ref === source ? '' : item.ref.replace(/\.WebHome$/, '').replace(/\.[^.]+$/, '.WebHome'),
            version: item.version || '3.7' }).map(([key, value]) =>
            'data-' + key + '="' + esc(value) + '"').join(' ') + '></div>').join('') + '</div>' +
          '<textarea id="deletion-preview-snapshot">' + esc(descendants.map(item => item.ref + '@' + (item.version || '3.7')).join('\n')) + '</textarea>';
      } else if (action === 'contenu document') body = '<div id="documentation-content" data-version="3.7"></div><textarea id="documentation-source">' + (testWorkflow.source || 'Contenu initial') + '</textarea>';
      else if (action === 'modifier metadonnees document') body = values.mode === 'proposal' ? 'PROPOSITION_OK' :
        '<div id="creation-result" data-code="METADONNEES_OK"></div><div id="metadata-result" data-modified="16/10/2026 12:00"></div>METADONNEES_OK';
      else body = ({
        'enregistrer parametres': 'PARAMETRES_OK', 'purger corbeille': 'CORBEILLE_PURGEE_OK',
        'modifier contenu document': values.mode === 'direct' ? 'CONTENU_OK' : 'PROPOSITION_OK',
        'modifier informations': values.mode === 'direct' ? 'METADONNEES_OK' : 'PROPOSITION_OK',
        'valider proposition': 'PROPOSITION_VALIDEE_OK', 'refuser proposition': 'PROPOSITION_REFUSEE_OK',
        'modifier proposition': 'PROPOSITION_MODIFIEE_OK',
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
    testWorkflow.deletionNodes = nodes;
    testWorkflow.responses.architecture = { body: '<div id="architecture-data" data-complete="true">' +
      nodes.map(node => '<div class="architecture-node-data" ' +
      Object.entries(node).map(([key, value]) => 'data-' + key + '="' + esc(value) + '"').join(' ') + '></div>').join('') + '</div>' };
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

async function setDeletionArchitecture(page, nodes) {
  await page.evaluate(nodes => {
    const esc = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    testWorkflow.responses.architecture = { body: '<div id="architecture-data" data-complete="true">' +
      nodes.map(node => '<div class="architecture-node-data" ' + Object.entries(node)
        .map(([key, value]) => 'data-' + key + '="' + esc(value) + '"').join(' ') + '></div>').join('') + '</div>' };
    testWorkflow.deletionNodes = nodes;
  }, nodes);
}

async function startFolderDeletion(page, selected = [{ ref: folder, title: 'RH', type: 'folder' }]) {
  await page.evaluate(items => { window.testDeletion = deleteExplorerItems(document.getElementById('box'), items); }, selected);
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

    await check('A grouped import can be accepted completely in parent-first order without accepting another batch', async () => {
      const page = await setup(browser, { proposals: [
        proposal('Deep', { operation: 'import', 'batch-id': 'batch-one', 'parent-proposal-ref': space + 'Sous' }),
        proposal('OtherBatch', { operation: 'import', 'batch-id': 'batch-two' }),
        proposal('Sous', { type: 'folder', operation: 'import', 'batch-id': 'batch-one', 'parent-proposal-ref': space + 'Archive' }),
        proposal('Outside'),
        proposal('OtherDestination', { operation: 'import', 'batch-id': 'batch-one', 'parent-ref': root }),
        proposal('Archive', { type: 'folder', operation: 'import', 'batch-id': 'batch-one' })
      ] });
      try {
        await open(page);
        await confirmProposalBulk(page, 'batch');
        await page.waitForFunction(() => testState.decisions.length === 4 && architectureState.proposalCount === 2);
        const refs = await page.evaluate(() => testState.decisions.map(item => item.ref));
        assert.deepEqual([...refs].sort(), ['Archive', 'Sous', 'Deep', 'OtherDestination'].map(name => space + name).sort());
        assert.ok(refs.indexOf(space + 'Archive') < refs.indexOf(space + 'Sous'));
        assert.ok(refs.indexOf(space + 'Sous') < refs.indexOf(space + 'Deep'));
        assert.ok(await page.evaluate(() => testState.decisions.every(item => item.decision === 'accept' && item.version === '1.1')));
        assert.equal(await page.evaluate(ref => architectureState.nodes['proposal:' + ref].status, space + 'OtherBatch'), 'pending');
        assert.deepEqual(await page.evaluate(() => testState.alerts), []);
      } finally { await page.close(); }
    });

    await check('Direct-child validation includes the proposed parent, while recursive validation also includes grandchildren', async () => {
      for (const scope of ['children', 'descendants']) {
        const page = await setup(browser, { proposals: [
          proposal('Grandchild', { 'parent-proposal-ref': space + 'ChildFolder' }),
          proposal('Parent', { type: 'folder' }),
          proposal('ChildFolder', { type: 'folder', 'parent-proposal-ref': space + 'Parent' }),
          proposal('ChildDocument', { 'parent-proposal-ref': space + 'Parent' }),
          proposal('Outside')
        ] });
        try {
          await open(page);
          await confirmProposalBulk(page, scope, 'proposal:' + space + 'Parent');
          const expected = scope === 'children' ? ['Parent', 'ChildFolder', 'ChildDocument'] : ['Parent', 'ChildFolder', 'ChildDocument', 'Grandchild'];
          await page.waitForFunction(count => testState.decisions.length === count && architectureState.proposalCount === 5 - count, expected.length);
          const refs = await page.evaluate(() => testState.decisions.map(item => item.ref));
          assert.deepEqual([...refs].sort(), expected.map(name => space + name).sort());
          assert.equal(refs[0], space + 'Parent');
          if (scope === 'descendants') assert.ok(refs.indexOf(space + 'ChildFolder') < refs.indexOf(space + 'Grandchild'));
          assert.deepEqual(await page.evaluate(() => testState.alerts), []);
        } finally { await page.close(); }
      }
    });

    await check('Children of an existing folder can be validated without republishing the existing folder', async () => {
      const page = await setup(browser, { proposals: [
        proposal('ChildFolder', { type: 'folder', 'parent-ref': folder }),
        proposal('Grandchild', { 'parent-ref': folder, 'parent-proposal-ref': space + 'ChildFolder' }),
        proposal('Outside', { 'parent-ref': root })
      ] });
      try {
        await open(page);
        await confirmProposalBulk(page, 'children', folder);
        await page.waitForFunction(() => architectureState.proposalCount === 2);
        assert.deepEqual(await page.evaluate(() => testState.decisions.map(item => item.ref)), [space + 'ChildFolder']);
        assert.equal(await page.evaluate(ref => testState.architecture.filter(item => item.ref === ref).length, folder), 1);
      } finally { await page.close(); }
    });

    await check('A failed parent leaves its descendants pending while independent siblings still validate', async () => {
      const page = await setup(browser, { proposals: [
        proposal('BlockedParent', { type: 'folder', operation: 'import', 'batch-id': 'batch-one' }),
        proposal('BlockedChild', { operation: 'import', 'batch-id': 'batch-one', 'parent-proposal-ref': space + 'BlockedParent' }),
        proposal('Independent', { operation: 'import', 'batch-id': 'batch-one' }),
        proposal('Outside', { operation: 'import', 'batch-id': 'batch-two' })
      ] });
      try {
        await page.evaluate(ref => { testState.decisionFailures[ref] = 'La proposition a été modifiée. Rechargez-la.'; }, space + 'BlockedParent');
        await open(page);
        await confirmProposalBulk(page, 'batch');
        await page.waitForFunction(() => architectureState.proposalCount === 3 && testState.decisions.length === 2);
        assert.deepEqual((await page.evaluate(() => testState.decisions.map(item => item.ref))).sort(), [space + 'BlockedParent', space + 'Independent'].sort());
        assert.equal(await page.evaluate(ref => testState.proposals.find(item => item.ref === ref).status, space + 'BlockedChild'), 'pending');
        const message = await page.locator('#documentation-proposal-bulk-dialog').innerText();
        assert.match(message, /modifi|échou|erreur|bloqu|impossible/i);
        assert.doesNotMatch(message, /ERREUR_|Exception|org\.xwiki/);
      } finally { await page.close(); }
    });

    await check('A batch never accepts a pending parent outside its scope or a child that depends on that parent', async () => {
      const page = await setup(browser, { proposals: [
        proposal('OutsideParent', { type: 'folder', operation: 'import', 'batch-id': 'other-batch' }),
        proposal('Dependent', { operation: 'import', 'batch-id': 'selected-batch', 'parent-proposal-ref': space + 'OutsideParent' }),
        proposal('Independent', { operation: 'import', 'batch-id': 'selected-batch' })
      ] });
      try {
        await open(page);
        const group = await page.evaluate(() => Object.values(architectureState.nodes).find(node => node.proposalGroup && node.batchId === 'selected-batch').id);
        await confirmProposalBulk(page, 'batch', group);
        await page.waitForFunction(() => architectureState.proposalCount === 2);
        assert.deepEqual(await page.evaluate(() => testState.decisions.map(item => item.ref)), [space + 'Independent']);
        assert.match(await page.locator('#documentation-proposal-bulk-dialog').innerText(), /parent.*séparément|parent.*sélection/i);
      } finally { await page.close(); }
    });

    await check('A proposal changed after opening bulk confirmation remains pending while unchanged siblings validate', async () => {
      const page = await setup(browser, { proposals: [
        proposal('Changed', { operation: 'import', 'batch-id': 'batch-one' }),
        proposal('Unchanged', { operation: 'import', 'batch-id': 'batch-one' })
      ] });
      try {
        await open(page);
        await page.locator('[data-architecture-proposal-bulk="batch"]').click();
        await page.locator('#documentation-proposal-bulk-dialog').waitFor();
        await page.evaluate(ref => { testState.proposals.find(item => item.ref === ref).version = '2.1'; }, space + 'Changed');
        await page.locator('#documentation-proposal-bulk-confirm').click();
        await page.locator('#documentation-proposal-bulk-dialog').getByRole('button', { name: 'Fermer', exact: true }).waitFor();
        assert.deepEqual(await page.evaluate(() => testState.decisions.map(item => item.ref)), [space + 'Unchanged']);
        assert.match(await page.locator('#documentation-proposal-bulk-dialog').innerText(), /changé/);
        assert.equal(await page.evaluate(() => architectureState.proposalCount), 1);
      } finally { await page.close(); }
    });

    await check('Revoking review rights before bulk confirmation prevents every validation request', async () => {
      const page = await setup(browser, { proposals: [proposal('Import', { operation: 'import', 'batch-id': 'batch-one' })] });
      try {
        await open(page);
        await page.locator('[data-architecture-proposal-bulk="batch"]').first().click();
        await page.locator('#documentation-proposal-bulk-dialog').waitFor();
        await page.evaluate(() => { testState.reviewer = false; });
        await page.locator('#documentation-proposal-bulk-confirm').click();
        assert.equal(await page.evaluate(() => testState.decisions.length), 0);
        assert.equal(await page.evaluate(() => testState.proposals[0].status), 'pending');
      } finally { await page.close(); }
    });

    await check('A reviewer can rename and move a proposal before acceptance, with the updated proposal version', async () => {
      const page = await setup(browser, { proposals: [proposal('Contrat'), proposal('Destination', { type: 'folder' })] });
      try {
        await open(page);
        await page.locator('[data-architecture-proposal-edit="proposal:' + space + 'Contrat' + '"]').click();
        await page.locator('#documentation-proposal-title').fill('Contrat corrigé');
        await page.locator('input[name="documentation-proposal-destination"][value="' + root + '"]').check();
        await page.locator('#documentation-proposal-edit-save').click();
        await page.waitForFunction(() => !document.getElementById('documentation-proposal-edit-dialog'));
        assert.deepEqual(await page.evaluate(() => testState.edits), [{ ref: space + 'Contrat',
          parameters: { title: 'Contrat corrigé', parent_ref: root, parent_proposal_ref: '' }, version: '1.1' }]);
        assert.equal(await page.evaluate(() => testState.decisions.length), 0);
        assert.equal(await page.evaluate(ref => architectureState.nodes['proposal:' + ref].title, space + 'Contrat'), 'Contrat corrigé');
        assert.equal(await page.evaluate(ref => architectureState.nodes['proposal:' + ref].parentRef, space + 'Contrat'), root);
        await page.locator('[data-architecture-proposal-decision="accept"][data-architecture-proposal-ref="proposal:' + space + 'Contrat' + '"]').click();
        await page.waitForFunction(() => testState.decisions.length === 1 && architectureState.proposalCount === 1);
        assert.equal(await page.evaluate(() => testState.decisions[0].version), '1.2');
      } finally { await page.close(); }
    });

    await check('A proposed folder cannot be moved into itself or its descendants, but can move under another proposed folder', async () => {
      const page = await setup(browser, { proposals: [
        proposal('Source', { type: 'folder' }),
        proposal('Child', { type: 'folder', 'parent-proposal-ref': space + 'Source' }),
        proposal('Destination', { type: 'folder' })
      ] });
      try {
        await open(page);
        await page.locator('[data-architecture-proposal-edit="proposal:' + space + 'Source' + '"]').click();
        for (const name of ['Source', 'Child']) {
          const target = page.locator('input[name="documentation-proposal-destination"][value="proposal:' + space + name + '"]');
          assert.ok(await target.count() === 0 || await target.isDisabled(), 'a proposal cannot target itself or its descendants');
        }
        await page.locator('input[name="documentation-proposal-destination"][value="proposal:' + space + 'Destination' + '"]').check();
        await page.locator('#documentation-proposal-edit-save').click();
        await page.waitForFunction(() => !document.getElementById('documentation-proposal-edit-dialog'));
        const edit = await page.evaluate(() => testState.edits[0]);
        assert.equal(edit.parameters.parent_proposal_ref, space + 'Destination');
        assert.equal(await page.evaluate(ref => architectureState.nodes['proposal:' + ref].parentRef, space + 'Source'), 'proposal:' + space + 'Destination');
        assert.equal(await page.evaluate(ref => architectureState.nodes['proposal:' + ref].parentRef, space + 'Child'), 'proposal:' + space + 'Source');
      } finally { await page.close(); }
    });

    await check('A server refusal keeps the proposal editor open and leaves the displayed proposal unchanged', async () => {
      const page = await setup(browser, { proposals: [proposal('Contrat')] });
      try {
        await open(page);
        await page.evaluate(() => { testState.editFailure = 'Cette proposition a changé. Rechargez-la.'; });
        await page.locator('[data-architecture-proposal-edit="proposal:' + space + 'Contrat' + '"]').click();
        await page.locator('#documentation-proposal-title').fill('Modification concurrente');
        await page.locator('#documentation-proposal-edit-save').click();
        await page.waitForFunction(() => !document.getElementById('documentation-proposal-edit-save').disabled);
        assert.match(await page.locator('#documentation-proposal-edit-status').innerText(), /changé/);
        assert.equal(await page.evaluate(ref => architectureState.nodes['proposal:' + ref].title, space + 'Contrat'), 'Contrat');
        assert.equal(await page.evaluate(() => testState.decisions.length), 0);
      } finally { await page.close(); }
    });

    await check('Pending metadata and content changes can also be renamed and moved before validation', async () => {
      for (const operation of ['modify', 'content']) {
        const page = await setup(browser, { proposals: [proposal('Modification', { operation, 'source-ref': existing })] });
        try {
          await open(page);
          await page.locator('[data-architecture-proposal-edit="proposal:' + space + 'Modification' + '"]').click();
          await page.locator('#documentation-proposal-title').fill('Document révisé');
          await page.locator('input[name="documentation-proposal-destination"][value="' + root + '"]').check();
          await page.locator('#documentation-proposal-edit-save').click();
          await page.waitForFunction(() => !document.getElementById('documentation-proposal-edit-dialog'));
          assert.deepEqual(await page.evaluate(() => testState.edits[0]), { ref: space + 'Modification',
            parameters: { title: 'Document révisé', parent_ref: root, parent_proposal_ref: '' }, version: '1.1' });
          assert.equal(await page.evaluate(ref => architectureState.nodes['proposal:' + ref].operation, space + 'Modification'), operation);
          assert.equal(await page.evaluate(() => testState.decisions.length), 0);
        } finally { await page.close(); }
      }
    });

    await check('An author can edit their own pending proposal without receiving edit rights over another author’s proposal', async () => {
      const page = await setup(browser, { reviewer: false, proposals: [
        proposal('Mine', { 'can-edit': 'true' }), proposal('SomeoneElse', { 'can-edit': 'false' })
      ] });
      try {
        await open(page);
        assert.equal(await page.locator('[data-architecture-proposal-edit]').count(), 1);
        assert.equal(await page.locator('[data-architecture-proposal-bulk], [data-architecture-proposal-decision="accept"]').count(), 0);
        await page.locator('[data-architecture-proposal-edit="proposal:' + space + 'Mine' + '"]').click();
        await page.locator('#documentation-proposal-title').fill('Mon titre corrigé');
        await page.locator('#documentation-proposal-edit-save').click();
        await page.waitForFunction(() => !document.getElementById('documentation-proposal-edit-dialog'));
        assert.deepEqual(await page.evaluate(() => testState.edits.map(item => item.ref)), [space + 'Mine']);
        assert.equal(await page.evaluate(ref => architectureState.nodes['proposal:' + ref].title, space + 'SomeoneElse'), 'SomeoneElse');
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

    await check('An import author can restore their own refused import using the server grant, without receiving validation rights', async () => {
      const page = await setup(browser, { reviewer: false, proposals: [
        proposal('ImportAuteur', { operation: 'import', status: 'rejected', 'can-restore': 'true' }),
        proposal('ImportAutre', { operation: 'import', status: 'rejected', 'can-restore': 'false' })
      ] });
      try {
        await open(page, 'corbeille');
        assert.equal(await page.locator('.architecture-row-rejected').count(), 2);
        assert.equal(await page.locator('[data-architecture-proposal-decision="accept"], [data-architecture-proposal-decision="reject"]').count(), 0);
        assert.equal(await page.locator('[data-architecture-proposal-decision="restore"]').count(), 1);
        await page.evaluate(async ref => {
          await decideDocumentationProposal(architectureState.nodes['proposal:' + ref], 'restore');
        }, space + 'ImportAutre');
        assert.equal(await page.evaluate(() => testState.decisions.length), 0, 'manual restoration cannot bypass the server grant');
        await page.locator('[data-architecture-proposal-decision="restore"]').click();
        await page.waitForFunction(() => architectureState.proposalCount === 1);
        assert.deepEqual(await page.evaluate(() => testState.decisions), [
          { ref: space + 'ImportAuteur', decision: 'restore', reason: '', version: '1.1' }
        ]);
        assert.equal(await page.locator('[data-architecture-proposal-decision]').count(), 0);
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

    await check('Importer alone can request restoration but cannot accept or refuse proposals', async () => {
      const page = await workflowPage(browser, { import: true, create: false, propose: false, review: false });
      try {
        await page.evaluate(async ref => {
          await DocPropositions.proposalAction(ref, 'restore', '', '2.4');
        }, space + 'ImportAuteur');
        const posted = await page.evaluate(() => testWorkflow.requests.filter(request => request.action === 'restaurer proposition'));
        assert.equal(posted.length, 1);
        assert.equal(posted[0].action, 'restaurer proposition');
        assert.equal(posted[0].values.proposal_ref, space + 'ImportAuteur');
        assert.equal(posted[0].values.version, '2.4');
        assert.equal(posted[0].values.form_token, 'test-csrf');
        for (const decision of ['accept', 'reject']) {
          const message = await page.evaluate(async ({ ref, decision }) => {
            try { await DocPropositions.proposalAction(ref, decision, '', '2.4'); return ''; }
            catch (error) { return error.message; }
          }, { ref: space + 'ImportAuteur', decision });
          assert.match(message, /validation/);
        }
        assert.equal(await page.evaluate(() => testWorkflow.requests.filter(request => /^(restaurer|valider|refuser) proposition$/.test(request.action)).length), 1);
      } finally { await page.close(); }
    });

    await check('Proposal editing sends its current version, destination and CSRF token, while readers cannot submit it', async () => {
      for (const grants of [{ review: true }, { propose: true }, { import: true }, {}]) {
        const page = await workflowPage(browser, grants);
        try {
          const message = await page.evaluate(async ({ ref, destination }) => {
            try {
              await DocPropositions.updateProposal(ref, { title: 'Titre révisé', parent_ref: destination, parent_proposal_ref: '' }, '2.4');
              return '';
            } catch (error) { return error.message; }
          }, { ref: space + 'Contrat', destination: root });
          const posts = await page.evaluate(() => testWorkflow.requests.filter(item => item.action === 'modifier proposition'));
          if (Object.keys(grants).length) {
            assert.equal(message, '');
            assert.equal(posts.length, 1);
            assert.equal(posts[0].method, 'POST');
            assert.equal(posts[0].credentials, 'same-origin');
            assert.equal(posts[0].values.form_token, 'test-csrf');
            assert.equal(posts[0].values.proposal_ref, space + 'Contrat');
            assert.equal(posts[0].values.version, '2.4');
            assert.equal(posts[0].values.title, 'Titre révisé');
            assert.equal(posts[0].values.parent_ref, root);
            assert.equal(posts[0].values.parent_proposal_ref, '');
          } else {
            assert.match(message, /droit|autoris|modifi/i);
            assert.equal(posts.length, 0);
          }
        } finally { await page.close(); }
      }
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

    await check('The real WebHome toolbar and file pickers reflect creation, proposal and import grants without reloading', async () => {
      const page = await workflowPage(browser, { configure: true }, { groupGrants: {}, webHomeToolbar: true });
      try {
        await addCreationUI(page);
        for (const selector of ['#doc-add-folder', '#doc-add-document']) {
          assert.equal(await page.locator(selector).count(), 1, 'WebHome must retain the button before any action grant');
          assert.equal(await page.locator(selector).isVisible(), false);
        }
        const buttonHandles = await page.evaluateHandle(() => [
          document.getElementById('doc-add-folder'), document.getElementById('doc-add-document')
        ]);

        for (const rights of [['create'], ['propose'], ['import', 'create'], ['import', 'propose'], ['import']]) {
          await page.locator('#doc-settings').click();
          let dialog = page.getByRole('dialog', { name: 'Paramètres de la documentation' });
          await dialog.waitFor();
          assert.equal(await dialog.locator('input[type="checkbox"]:checked').count(), 0);
          for (const right of rights) await dialog.locator('input[data-right="' + right + '"]').check();
          await dialog.getByRole('button', { name: 'Enregistrer les autorisations' }).click();
          await page.waitForFunction(() => !document.querySelector('dialog'));
          assert.equal(await page.evaluate(handles => handles.every(button => button.isConnected), buttonHandles), true,
            'changing a right must update the original buttons, without a page reload');
          const manual = rights.includes('create') || rights.includes('propose');
          const importing = rights.includes('import');
          const mode = rights.includes('create') ? 'direct' : 'proposal';
          for (const selector of ['#doc-add-folder', '#doc-add-document']) {
            assert.equal(await page.locator(selector).isVisible(), manual || importing, rights.join('+') + ' must expose only usable entry points');
            if (manual || importing) assert.match(await page.locator(selector).innerText(), mode === 'proposal' ? /proposer/i : /ajouter|créer/i);
          }
          await page.evaluate(({ mode, root }) => {
            testWorkflow.requests = [];
            const body = mode === 'proposal' ?
              '<div id="creation-result" data-code="PROPOSITION_OK" data-proposal-ref="TestPage.PAGE.doc-test.PROPOSITIONS.P1"></div>PROPOSITION_OK' :
              '<div id="creation-result" data-code="LIEN_AJOUTE_OK" data-page-ref="' + root + '.Nouveau.WebHome"></div>LIEN_AJOUTE_OK';
            testWorkflow.responses['ajouter un fichier'] = { body };
            testWorkflow.responses['ajouter un document'] = { body };
          }, { mode, root });

          if (manual || importing) {
            await page.locator('#doc-add-folder').click();
            await page.locator('#popup').waitFor({ state: 'visible' });
            assert.equal(await page.locator('#folder-empty-page-group').isVisible(), manual);
            assert.equal(await page.locator('#branch-folder-picker-btn').isVisible(), importing);
            if (importing) {
              await page.evaluate(() => {
                const file = new File(['branch-content'], 'guide.pdf', { type: 'application/pdf' });
                Object.defineProperty(file, 'webkitRelativePath', { value: 'Archive/guide.pdf' });
                const transfer = new DataTransfer(); transfer.items.add(file);
                const input = document.getElementById('branch-folder-input');
                input.files = transfer.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
              });
            } else await page.locator('#folder-name-input').fill('Dossier ' + rights.join('+'));
            assert.match(await page.locator('#btn-popup-valide').innerText(), mode === 'proposal' ? /proposer/i : importing ? /importer/i : /créer/i);
            await page.locator('#btn-popup-valide').click();
            await page.waitForFunction(() => document.getElementById('popup').style.display === 'none');

            await page.locator('#doc-add-document').click();
            await page.locator('#popup').waitFor({ state: 'visible' });
            assert.equal(await page.locator('#document-empty-page-group').isVisible(), manual);
            assert.equal(await page.locator('#document-file-picker-btn').isVisible(), importing);
            if (importing) {
              await page.locator('#document-file-input').setInputFiles({
                name: 'contrat.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf-file')
              });
            } else await page.locator('#document-name-input').fill('Document ' + rights.join('+'));
            assert.match(await page.locator('#btn-popup-valide').innerText(), mode === 'proposal' ? /proposer/i : importing ? /importer/i : /créer/i);
            await page.locator('#btn-popup-valide').click();
            await page.waitForFunction(() => document.getElementById('popup').style.display === 'none');
            const requests = await page.evaluate(() => testWorkflow.requests.filter(request => /^ajouter un /.test(request.action)));
            assert.equal(requests.length, importing ? 3 : 2);
            assert.ok(requests.some(request => request.action === 'ajouter un fichier'));
            assert.ok(requests.some(request => request.action === 'ajouter un document'));
            assert.ok(requests.every(request => request.method === 'POST' && request.values.mode === mode &&
              request.values.intent === (importing ? 'import' : 'create') && request.values.form_token === 'test-csrf'));
            assert.deepEqual(await page.evaluate(() => testWorkflow.alerts), []);
          } else {
            await page.evaluate(async () => { await ajouterFichier(); await ajouterDocument(); });
            assert.equal(await page.locator('#popup').isVisible(), false);
            assert.equal(await page.evaluate(() => testWorkflow.requests.filter(request => /^ajouter un /.test(request.action)).length), 0);
          }

          await page.locator('#doc-settings').click();
          dialog = page.getByRole('dialog', { name: 'Paramètres de la documentation' });
          await dialog.waitFor();
          for (const right of rights) await dialog.locator('input[data-right="' + right + '"]').uncheck();
          await dialog.getByRole('button', { name: 'Enregistrer les autorisations' }).click();
          await page.waitForFunction(() => !document.querySelector('dialog'));
          assert.equal(await page.locator('#doc-add-folder').isVisible(), false);
          assert.equal(await page.locator('#doc-add-document').isVisible(), false);
          assert.equal(await page.locator('#doc-settings').isVisible(), true);
        }
        await buttonHandles.dispose();
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

    await check('Multi-file imports require creation rights to publish directly, and otherwise use the proposal workflow', async () => {
      for (const grants of [
        { import: true, create: false, propose: true },
        { import: true, create: false, propose: false },
        { import: true, create: true, propose: false },
        { import: true, create: true, propose: true }
      ]) {
        const page = await workflowPage(browser, grants);
        try {
          const mode = grants.create ? 'direct' : 'proposal';
          assert.equal(await page.evaluate(() => DocPropositions.modeFor('import')), mode);
          await addCreationUI(page);
          await page.evaluate(({ mode, root }) => {
            testWorkflow.responses['ajouter un document'] = { body: mode === 'proposal' ?
              '<div id="creation-result" data-code="PROPOSITION_OK" data-proposal-ref="TestPage.PAGE.doc-test.PROPOSITIONS.P1"></div>PROPOSITION_OK' :
              '<div id="creation-result" data-code="LIEN_AJOUTE_OK" data-page-ref="' + root + '.Contrat.WebHome"></div>LIEN_AJOUTE_OK' };
          }, { mode, root });
          await page.evaluate(() => ajouterDocument());
          await page.locator('#document-file-input').setInputFiles([
            { name: 'contrat.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf-file') },
            { name: 'guide.pdf', mimeType: 'application/pdf', buffer: Buffer.from('second-file') }
          ]);
          assert.match(await page.locator('#btn-popup-valide').innerText(), grants.create ? /importer/i : /proposer/i);
          await page.locator('#btn-popup-valide').click();
          await page.waitForFunction(() => document.getElementById('popup').style.display === 'none');
          const uploads = await page.evaluate(async () => Promise.all(testWorkflow.requests
            .filter(request => request.action === 'ajouter un document').map(async request => ({
              mode: request.values.mode, intent: request.values.intent, token: request.values.form_token,
              filename: request.values.filePath.name, contents: await request.values.filePath.text(), batch: request.values.batch_id
            }))));
          assert.equal(uploads.length, 2);
          assert.ok(uploads[0].batch, 'a multiple-file import must share one batch');
          assert.deepEqual(uploads, [
            { mode, intent: 'import', token: 'test-csrf', filename: 'contrat.pdf', contents: 'pdf-file', batch: uploads[0].batch },
            { mode, intent: 'import', token: 'test-csrf', filename: 'guide.pdf', contents: 'second-file', batch: uploads[0].batch }
          ]);
          assert.deepEqual(await page.evaluate(() => testWorkflow.alerts), []);
        } finally { await page.close(); }
      }
    });

    await check('Imported branches preserve batches, hierarchy and multipart files in both proposal and direct modes', async () => {
      for (const grants of [
        { import: true, create: false, propose: true },
        { import: true, create: false, propose: false },
        { import: true, create: true, propose: false },
        { import: true, create: true, propose: true }
      ]) {
        const page = await workflowPage(browser, grants);
        const mode = grants.create ? 'direct' : 'proposal';
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
              const proposed = values.mode === 'proposal';
              const ref = proposed ? 'TestPage.PAGE.doc-test.PROPOSITIONS.P' + (uploads.length + 1) :
                values.page.replace(/\.WebHome$/, '') + '.' + values.technical_name + '.WebHome';
              uploads.push({ values: Object.fromEntries(Array.from(options.body).filter(([key]) => key !== 'filePath')),
                file: file ? { name: file.name, size: file.size, content: await file.text() } : null, ref });
              const code = proposed ? 'PROPOSITION_OK' : 'LIEN_AJOUTE_OK';
              return { ok: true, text: async () => '<div id="creation-result" data-code="' + code + '" ' +
                (proposed ? 'data-proposal-ref' : 'data-page-ref') + '="' + ref + '"></div>' + code };
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
          assert.equal(result.uploads.length, 4, 'the root, subfolder, document and empty folder must each be submitted');
          const byTitle = Object.fromEntries(result.uploads.map(item => [item.values.nom_fichier, item]));
          assert.ok(byTitle.Archive && byTitle.Sous && byTitle.contrat && byTitle.Vide);
          assert.equal(byTitle.Archive.values.parent_proposal_ref, '');
          assert.equal(byTitle.Sous.values.parent_proposal_ref, grants.create ? '' : byTitle.Archive.ref);
          assert.equal(byTitle.contrat.values.parent_proposal_ref, grants.create ? '' : byTitle.Sous.ref);
          assert.equal(byTitle.Vide.values.parent_proposal_ref, grants.create ? '' : byTitle.Archive.ref);
          assert.equal(byTitle.Archive.values.page, root);
          assert.equal(byTitle.Sous.values.page, grants.create ? byTitle.Archive.ref : root);
          assert.equal(byTitle.contrat.values.page, grants.create ? byTitle.Sous.ref : root);
          assert.equal(byTitle.Vide.values.page, grants.create ? byTitle.Archive.ref : root);
          for (const upload of result.uploads) {
            assert.equal(upload.values.mode, mode);
            assert.equal(upload.values.intent, 'import');
            assert.equal(upload.values.form_token, 'test-csrf');
            assert.equal(upload.values.batch_id, result.uploads[0].values.batch_id);
            assert.ok(upload.values.batch_id);
          }
          assert.deepEqual(byTitle.contrat.file, { name: 'contrat.pdf', size: 11, content: 'pdf-content' });
          assert.deepEqual(result.alerts, []);
          assert.equal(result.opened, grants.create ? 0 : 1);
          assert.equal(result.batchEnded, '');
        } finally { await page.close(); }
      }
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
        { create: true, import: true, content: true, propose: true },
        { create: true, import: false, content: true, propose: true },
        { create: false, import: true, content: false, propose: true },
        { create: false, import: true, content: false, propose: false },
        { create: false, import: false, content: false, propose: true },
        { create: false, import: false, content: false, propose: false }
      ]) {
        const page = await workflowPage(browser, grants);
        try {
          assert.equal(await page.locator('#doc-contribution-mode').count(), 0);
          const actual = await page.evaluate(() => ['create', 'import', 'content', 'delete'].map(right => DocPropositions.modeFor(right)));
          const creationMode = grants.create ? 'direct' : grants.propose ? 'proposal' : '';
          const importMode = grants.import ? (grants.create ? 'direct' : 'proposal') : '';
          const contentMode = grants.content ? 'direct' : grants.propose ? 'proposal' : '';
          const expected = [creationMode, importMode, contentMode, ''];
          assert.deepEqual(actual, expected);
          if (!grants.create && !grants.propose && !grants.import) {
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

    await check('Neither proposing alone nor creating alone can upload files through manual browser calls', async () => {
      for (const grants of [
        { create: false, import: false, propose: true },
        { create: true, import: false, propose: false }
      ]) {
        const page = await workflowPage(browser, grants);
        try {
          await addCreationUI(page);
          const message = await page.evaluate(async parent => {
            const file = new File(['pdf-file'], 'contrat.pdf', { type: 'application/pdf' });
            const info = getDocumentImportInfo(file, 'Contrat');
            try {
              await sendCreationRequest(document.getElementById('formulairePopup'), parent, info, 'test-csrf', 'document');
              return '';
            } catch (error) { return error.message; }
          }, root);
          assert.match(message, /droit|autoris/i);
          assert.equal(await page.evaluate(() => testWorkflow.requests.filter(request => /^ajouter un /.test(request.action)).length), 0);
        } finally { await page.close(); }
      }
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
        const page = await workflowPage(browser, { create: true, import: true, propose: false });
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

    await check('Deleting a folder outside Architecture displays its complete nested tree, and cancelling sends no deletion', async () => {
      const nested = folder.replace(/WebHome$/, 'Sous.WebHome');
      const deep = nested.replace(/WebHome$/, 'Contrat.WebHome');
      const detached = folder.replace(/WebHome$/, 'Physique.WebHome');
      const unrelated = root.replace(/WebHome$/, 'Autre.WebHome');
      const page = await workflowPage(browser, { delete: true });
      try {
        await addExplorerUI(page);
        await setDeletionArchitecture(page, [
          { ref: root, type: 'root', title: 'Documentation', 'parent-ref': '' },
          { ref: folder, type: 'folder', title: 'RH', 'parent-ref': root },
          { ref: existing, type: 'document', title: 'Guide existant', 'parent-ref': folder },
          { ref: nested, type: 'folder', title: 'Sous-dossier', 'parent-ref': folder },
          { ref: deep, type: 'document', title: 'Contrat profond', 'parent-ref': nested },
          { ref: detached, type: 'document', title: 'Enfant déplacé dans le classement', 'parent-ref': root },
          { ref: unrelated, type: 'document', title: 'Hors suppression', 'parent-ref': root }
        ]);
        await startFolderDeletion(page, [{ ref: folder, title: 'RH', type: 'folder' }, { ref: deep, title: 'Contrat profond', type: 'document' }]);
        const modal = page.locator('#explorer-delete-confirmation-modal');
        await modal.waitFor();
        assert.deepEqual((await modal.locator('[data-delete-ref]').evaluateAll(rows => rows.map(row => row.getAttribute('data-delete-ref')))).sort(),
          [folder, existing, nested, deep, detached].sort());
        assert.match(await modal.locator('#explorer-delete-confirmation-summary').innerText(), /5/);
        assert.equal(await modal.locator('[data-delete-ref="' + unrelated + '"]').count(), 0);
        assert.equal(await page.evaluate(() => testWorkflow.requests.filter(item => item.action === 'supprimer element').length), 0);
        assert.equal(await page.locator('#explorer-delete-confirmation-cancel').evaluate(element => document.activeElement === element), true);
        await page.locator('#explorer-delete-confirmation-cancel').click();
        await page.evaluate(() => testDeletion);
        assert.equal(await modal.count(), 0);
        assert.equal(await page.evaluate(() => testWorkflow.requests.filter(item => item.action === 'supprimer element').length), 0);
        assert.equal(await page.evaluate(() => testWorkflow.refreshes), 0);
        assert.equal(await page.locator('.explorer-row').count(), 1);
      } finally { await page.close(); }
    });

    await check('Confirming folder deletion removes the selected ancestor once, with CSRF and its current version', async () => {
      const page = await workflowPage(browser, { delete: true });
      try {
        await addExplorerUI(page);
        await startFolderDeletion(page, [{ ref: folder, title: 'RH', type: 'folder' }, { ref: existing, title: 'Guide existant', type: 'document' }]);
        await page.locator('#explorer-delete-confirmation-modal').waitFor();
        assert.equal(await page.locator('#explorer-delete-confirmation-tree [data-delete-ref]').count(), 2);
        assert.equal(await page.evaluate(() => testWorkflow.requests.filter(item => item.action === 'supprimer element').length), 0);
        await page.locator('#explorer-delete-confirmation-confirm').click();
        await page.evaluate(() => testDeletion);
        const posts = await page.evaluate(() => testWorkflow.requests.filter(item => item.action === 'supprimer element'));
        assert.equal(posts.length, 1);
        assert.equal(posts[0].values.source_ref, folder);
        assert.equal(posts[0].values.form_token, 'test-csrf');
        assert.equal(posts[0].values.base_version, '3.7');
        assert.equal(posts[0].values.delete_snapshot, folder + '@3.7\n' + existing + '@3.7');
        assert.equal(posts[0].values.mode, 'direct');
        assert.equal(await page.evaluate(() => testWorkflow.refreshes), 1);
      } finally { await page.close(); }
    });

    await check('Architecture also confirms folder descendants and posts the exact preview snapshot', async () => {
      const page = await workflowPage(browser, { delete: true });
      try {
        await addExplorerUI(page);
        await open(page, '');
        await page.evaluate(ref => {
          architectureState.selected[ref] = true;
          renderArchitectureTree();
          window.testDeletion = deleteArchitectureSelection(document.getElementById('box'));
        }, folder);
        await page.locator('#explorer-delete-confirmation-modal').waitFor();
        assert.equal(await page.locator('#explorer-delete-confirmation-tree [data-delete-ref]').count(), 2);
        await page.locator('#explorer-delete-confirmation-confirm').click();
        await page.evaluate(() => testDeletion);
        const posts = await page.evaluate(() => testWorkflow.requests.filter(item => item.action === 'supprimer element'));
        assert.equal(posts.length, 1);
        assert.equal(posts[0].values.source_ref, folder);
        assert.equal(posts[0].values.base_version, '3.7');
        assert.equal(posts[0].values.delete_snapshot, folder + '@3.7\n' + existing + '@3.7');
        assert.equal(await page.evaluate(() => testWorkflow.refreshes), 1);
      } finally { await page.close(); }
    });

    await check('Escape cancels folder deletion while leaving Architecture and its selection open', async () => {
      const page = await workflowPage(browser, { delete: true });
      try {
        await addExplorerUI(page);
        await open(page, '');
        await page.evaluate(ref => {
          architectureState.selected[ref] = true;
          renderArchitectureTree();
          window.testDeletion = deleteArchitectureSelection(document.getElementById('box'));
        }, folder);
        await page.locator('#explorer-delete-confirmation-modal').waitFor();
        await page.keyboard.press('Escape');
        await page.evaluate(() => testDeletion);
        assert.equal(await page.locator('#explorer-delete-confirmation-modal').count(), 0);
        assert.equal(await page.locator('#explorer-architecture-modal').count(), 1);
        assert.equal(await page.evaluate(ref => architectureState.selected[ref], folder), true);
        assert.equal(await page.evaluate(() => testWorkflow.requests.filter(item => item.action === 'supprimer element').length), 0);
      } finally { await page.close(); }
    });

    await check('An unavailable, incomplete or malformed deletion tree blocks folder deletion before confirmation', async () => {
      for (const response of [
        { status: 503, body: 'Unavailable' },
        { status: 200, body: '<div id="deletion-preview-data" data-ref="' + folder + '" data-complete="false"></div>' },
        { status: 200, body: '<div id="deletion-preview-data" data-ref="' + folder + '" data-complete="true"></div>' },
        { status: 200, body: '<html><h1>Failed Velocity macro</h1><pre>org.xwiki.MacroExecutionException</pre></html>' }
      ]) {
        const page = await workflowPage(browser, { delete: true });
        try {
          await addExplorerUI(page);
          await page.evaluate(response => { testWorkflow.responses['apercu suppression'] = response; }, response);
          await startFolderDeletion(page);
          await page.evaluate(() => testDeletion);
          assert.equal(await page.locator('#explorer-delete-confirmation-modal').count(), 0);
          assert.equal(await page.evaluate(() => testWorkflow.requests.filter(item => item.action === 'supprimer element').length), 0);
          const alerts = await page.evaluate(() => testWorkflow.alerts.join('\n'));
          assert.ok(alerts.length > 0 && alerts.length < 500);
          assert.doesNotMatch(alerts, /ERREUR_|Exception|org\.xwiki|Failed Velocity/);
        } finally { await page.close(); }
      }
    });

    await check('Revoking delete rights while the folder confirmation is open blocks deletion on confirmation', async () => {
      const page = await workflowPage(browser, { delete: true, configure: true });
      try {
        await addExplorerUI(page);
        await startFolderDeletion(page);
        await page.locator('#explorer-delete-confirmation-modal').waitFor();
        await page.evaluate(async () => { testWorkflow.granted.delete = false; await DocPropositions.openSettings(); });
        await page.getByRole('dialog', { name: 'Paramètres de la documentation' }).getByRole('button', { name: 'Fermer', exact: true }).click();
        await page.locator('#explorer-delete-confirmation-confirm').click();
        await page.evaluate(() => testDeletion);
        assert.equal(await page.evaluate(() => testWorkflow.requests.filter(item => item.action === 'supprimer element').length), 0);
        assert.equal(await page.evaluate(() => testWorkflow.refreshes), 0);
        assert.equal(await page.locator('.explorer-row').count(), 1);
      } finally { await page.close(); }
    });

    await check('A refused folder deletion keeps both views intact after the complete snapshot was confirmed', async () => {
      for (const mode of ['explorer', 'architecture']) {
        const page = await workflowPage(browser, { delete: true });
        try {
          await addExplorerUI(page);
          await page.evaluate(() => { testWorkflow.responses['supprimer element'] = {
            body: '<div id="documentation-error" data-message="Le dossier a changé depuis l’aperçu. Rechargez-le.">ERREUR_CONFLIT_VERSION</div>'
          }; });
          if (mode === 'architecture') {
            await open(page, '');
            await page.evaluate(ref => {
              architectureState.selected[ref] = true;
              renderArchitectureTree();
              window.testDeletion = deleteArchitectureSelection(document.getElementById('box'));
            }, folder);
          } else await startFolderDeletion(page);
          await page.locator('#explorer-delete-confirmation-modal').waitFor();
          const architectureReads = await page.evaluate(() => testWorkflow.requests.filter(item => item.action === 'architecture').length);
          await page.locator('#explorer-delete-confirmation-confirm').click();
          await page.evaluate(() => testDeletion);
          const result = await page.evaluate(() => ({
            posts: testWorkflow.requests.filter(item => item.action === 'supprimer element'),
            reads: testWorkflow.requests.filter(item => item.action === 'architecture').length,
            alerts: testWorkflow.alerts.join('\n'), refreshes: testWorkflow.refreshes
          }));
          assert.equal(result.posts.length, 1);
          assert.equal(result.posts[0].values.delete_snapshot, folder + '@3.7\n' + existing + '@3.7');
          assert.equal(result.reads, architectureReads);
          assert.equal(result.refreshes, 0);
          assert.match(result.alerts, /changé/);
          assert.doesNotMatch(result.alerts, /ERREUR_|Exception|org\.xwiki|supprimé avec succès/);
          if (mode === 'architecture') assert.equal(await page.evaluate(ref => architectureState.selected[ref] && !!architectureState.nodes[ref], folder), true);
          else assert.equal(await page.locator('.explorer-row').count(), 1);
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
