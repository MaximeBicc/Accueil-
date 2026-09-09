const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(
  path.join(__dirname, '..', 'xwiki', 'extensions', 'javascript', 'Accueil-Tracking.js'),
  'utf8'
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
    withAccueil = false
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
    contextaction: 'view',
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

  const windowObject = {
    localStorage: sharedStorage,
    location: { href, pathname },
    XWiki,
    URL,
    URLSearchParams,
    setTimeout() {},
    require(dependencies, success) { success(meta); },
    fetch() {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(trackedResponse)
      });
    }
  };

  const context = {
    window: windowObject,
    document: documentObject,
    XWiki,
    URL,
    URLSearchParams,
    console,
    Promise
  };

  vm.createContext(context);
  vm.runInContext(code, context);
  return { chip, recentHost };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

(async function run() {
  makeContext({
    href: 'https://wiki.test/xwiki/bin/view/TestPage/PAGE/Doc/Page1/',
    pathname: '/xwiki/bin/view/TestPage/PAGE/Doc/Page1/',
    documentName: 'TestPage.PAGE.Doc.Page1'
  });
  await flushPromises();

  const probes = JSON.parse(sharedStorage.getItem('infowiki.trackingProbe.v5'));
  if (!probes.some((entry) => entry.phase === 'script-evaluated' && entry.pathname.indexOf('/TestPage/PAGE/Doc/') !== -1)) {
    throw new Error('The global JSX probe was not written on a documentation page.');
  }
  if (!probes.some((entry) => entry.phase === 'tracked' && entry.document.indexOf('TestPage.PAGE.Doc.Page1') !== -1)) {
    throw new Error('The document was not tracked.');
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

  console.log('PASS: tracking syntax, global JSX probe, server response, and recent-documents rendering.');
}()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
