const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rawCode = fs.readFileSync(
  path.join(__dirname, '..', 'xwiki', 'extensions', 'javascript', 'Accueil-Tracking.js'),
  'utf8'
);

// La JSX est parsée par Velocity dans XWiki : simuler son URL calculée.
const code = rawCode.replace(
  '$escapetool.javascript($xwiki.getURL("InfoWiki.CODE.TrackView.WebHome", "get"))',
  '/xwiki/bin/get/InfoWiki/CODE/TrackView/WebHome'
);

class Storage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
}

const sharedStorage = new Storage();

function makeContext(options) {
  const {
    href,
    pathname,
    documentName,
    wiki = 'infowiki',
    user = 'XWiki.Maxime',
    trackedResponse = 'tracked',
    withAccueil = false,
    action = 'view',
    embedded = false
  } = options;

  const chip = {
    textContent: '',
    classList: {
      set: new Set(),
      add(value) { this.set.add(value); },
      remove(value) { this.set.delete(value); }
    }
  };
  const recentHost = { innerHTML: '' };
  const metas = {
    document: documentName,
    wiki,
    user,
    form_token: 'token123'
  };

  const documentObject = {
    readyState: 'complete',
    title: 'Test page',
    querySelector(selector) {
      const metaMatch = selector.match(/^meta\[name="(.+)"\]$/);
      if (metaMatch) {
        return {
          getAttribute(name) {
            return name === 'content' ? (metas[metaMatch[1]] || '') : '';
          }
        };
      }
      if (selector === '.nh-recent-card .nh-stats-chip') return withAccueil ? chip : null;
      if (selector === '[data-recent-documents]') return withAccueil ? recentHost : null;
      if (selector === 'input[name="form_token"]') return { value: 'token123' };
      if (selector.indexOf('#document-title') !== -1) {
        return { textContent: documentName.split('.').pop() };
      }
      return null;
    },
    addEventListener() {}
  };

  function XWikiDocument(reference) {
    this.reference = reference;
  }
  XWikiDocument.prototype.getURL = function getURL() {
    return '/xwiki/bin/get/InfoWiki/CODE/TrackView';
  };

  const XWiki = {
    contextaction: action,
    EntityType: { DOCUMENT: 'DOCUMENT' },
    Model: {
      serialize(reference) {
        return typeof reference === 'string' ? reference : reference.serialized;
      },
      resolve(text) {
        return { serialized: text };
      }
    },
    Document: XWikiDocument
  };

  const meta = {
    documentReference: { serialized: wiki + ':' + documentName },
    userReference: { serialized: wiki + ':' + user },
    wiki,
    form_token: 'token123'
  };

  const requests = [];
  class MockXMLHttpRequest {
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader() {}
    send(body) {
      requests.push({ method: this.method, url: this.url, body: new URLSearchParams(body) });
      this.status = 200;
      this.responseText = trackedResponse;
      this.readyState = 4;
      this.onreadystatechange();
    }
  }

  const windowObject = {
    localStorage: sharedStorage,
    location: { href, pathname },
    XWiki,
    URL,
    URLSearchParams,
    setTimeout() {},
    require(dependencies, success) { success(meta); },

  };

  windowObject.self = windowObject;
  windowObject.top = embedded ? {} : windowObject;

  const context = {
    window: windowObject,
    document: documentObject,
    XWiki,
    URL,
    URLSearchParams,
    console,
    Promise,
    XMLHttpRequest: MockXMLHttpRequest
  };

  vm.createContext(context);
  vm.runInContext(code, context);
  return { chip, recentHost, requests };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

(async function run() {
  const documentation = makeContext({
    href: 'https://wiki.test/xwiki/bin/view/TestPage/PAGE/Doc/Page1/',
    pathname: '/xwiki/bin/view/TestPage/PAGE/Doc/Page1/',
    documentName: 'TestPage.PAGE.Doc.Page1'
  });
  await flushPromises();

  const status = JSON.parse(sharedStorage.getItem('infowiki.trackingStatus.v5.4.infowiki'));
  assert.equal(status.status, 'tracked');
  assert.equal(documentation.requests.length, 1);
  assert.equal(documentation.requests[0].url, '/xwiki/bin/get/InfoWiki/CODE/TrackView/WebHome');
  assert.equal(documentation.requests[0].body.get('countView'), '1');

  const revisit = makeContext({
    href: 'https://wiki.test/xwiki/bin/view/TestPage/PAGE/Doc/Page1/',
    pathname: '/xwiki/bin/view/TestPage/PAGE/Doc/Page1/',
    documentName: 'TestPage.PAGE.Doc.Page1'
  });
  assert.equal(revisit.requests[0].body.get('countView'), '0');

  for (const options of [{ action: 'get' }, { embedded: true }]) {
    const preview = makeContext({
      href: 'https://wiki.test/xwiki/bin/view/TestPage/PAGE/Doc/Page2/',
      pathname: '/xwiki/bin/view/TestPage/PAGE/Doc/Page2/',
      documentName: 'TestPage.PAGE.Doc.Page2',
      ...options
    });
    assert.equal(preview.requests.length, 0);
  }

  const home = makeContext({
    href: 'https://wiki.test/xwiki/bin/view/TestPage/accueilV2/',
    pathname: '/xwiki/bin/view/TestPage/accueilV2/',
    documentName: 'TestPage.accueilV2',
    trackedResponse: 'ignored',
    withAccueil: true
  });
  await flushPromises();

  if (home.chip.textContent.indexOf('suivi des documents actif') === -1) {
    throw new Error('The accueilV2 status chip did not report active tracking: ' + home.chip.textContent);
  }
  if (home.recentHost.innerHTML.indexOf('Page1') === -1) {
    throw new Error('The recent-documents panel did not contain Page1.');
  }

  assert.equal(home.requests.length, 0);
  console.log('PASS: suivi des documents, limitation des vues répétées, exclusion des prévisualisations et historique récent.');
}()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
