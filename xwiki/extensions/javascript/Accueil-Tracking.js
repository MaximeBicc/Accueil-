(function () {
  'use strict';

  var TRACKING_VERSION = 'v5';
  var DOCUMENTATION_ROOT = 'TestPage.PAGE.Doc';
  var STORAGE_PREFIX = 'infowiki.recentDocuments.v5.';
  var VIEW_THROTTLE_PREFIX = 'infowiki.viewThrottle.v5.';
  var TRACKING_STATUS_PREFIX = 'infowiki.trackingStatus.v5.';
  var PROBE_KEY = 'infowiki.trackingProbe.v5';
  var PROBE_LIMIT = 30;
  var VIEW_THROTTLE_MS = 30 * 60 * 1000;
  var started = false;

  function now() {
    return Date.now();
  }

  function safeLocalStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeLocalStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function readProbeHistory() {
    try {
      var raw = safeLocalStorageGet(PROBE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeProbe(phase, meta, detail) {
    var history = readProbeHistory();
    var reference = '';

    try {
      reference = getDocumentReferenceText(meta || {});
    } catch (error) {
      reference = '';
    }

    history.push({
      version: TRACKING_VERSION,
      phase: phase,
      detail: detail || '',
      document: reference,
      href: window.location.href || '',
      pathname: window.location.pathname || '',
      at: now()
    });

    if (history.length > PROBE_LIMIT) {
      history = history.slice(history.length - PROBE_LIMIT);
    }

    safeLocalStorageSet(PROBE_KEY, JSON.stringify(history));
  }

  function getMetaContent(name) {
    var node = document.querySelector('meta[name="' + name + '"]');
    return node ? (node.getAttribute('content') || '') : '';
  }

  function serializeReference(reference) {
    if (!reference) return '';
    if (typeof reference === 'string') return reference;

    if (window.XWiki && XWiki.Model) {
      try {
        return XWiki.Model.serialize(reference);
      } catch (error) {
        return '';
      }
    }

    return '';
  }

  function getDocumentReferenceText(meta) {
    var reference = serializeReference(meta && meta.documentReference);
    if (reference) return reference;

    var documentName = (meta && meta.document) || getMetaContent('document');
    var wikiName = (meta && meta.wiki) || getMetaContent('wiki');

    if (!documentName) return '';
    if (documentName.indexOf(':') >= 0) return documentName;
    return wikiName ? wikiName + ':' + documentName : documentName;
  }

  function getWikiName(meta) {
    var reference = getDocumentReferenceText(meta || {});
    var separator = reference.indexOf(':');
    if (separator > 0) return reference.substring(0, separator);

    return (meta && meta.wiki) || getMetaContent('wiki') || 'current';
  }

  function getUserKey(meta) {
    var user = serializeReference(meta && meta.userReference);
    if (user) return user;

    user = (meta && meta.user) || getMetaContent('user');
    return user || 'browser-user';
  }

  function getFormToken(meta) {
    var token = (meta && meta.form_token) || getMetaContent('form_token');
    if (token) return token;

    var input = document.querySelector('input[name="form_token"]');
    return input ? (input.value || '') : '';
  }

  function getPageTitle() {
    var titleNode = document.querySelector('#document-title h1, #document-title, .document-header h1');
    if (titleNode && titleNode.textContent) {
      return titleNode.textContent.replace(/^\s+|\s+$/g, '');
    }
    return document.title || 'Document';
  }

  function cleanCurrentURL() {
    try {
      var url = new URL(window.location.href);
      url.hash = '';
      url.search = '';
      return url.toString();
    } catch (error) {
      return window.location.href.split('#')[0].split('?')[0];
    }
  }

  function makeStorageKey(meta) {
    return STORAGE_PREFIX + getWikiName(meta) + '.' + getUserKey(meta);
  }

  function makeStatusKey(meta) {
    return TRACKING_STATUS_PREFIX + getWikiName(meta);
  }

  function readRecent(meta) {
    try {
      var raw = safeLocalStorageGet(makeStorageKey(meta));
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeRecent(meta, list) {
    safeLocalStorageSet(makeStorageKey(meta), JSON.stringify(list.slice(0, 10)));
  }

  function writeStatus(meta, status, detail) {
    safeLocalStorageSet(makeStatusKey(meta), JSON.stringify({
      version: TRACKING_VERSION,
      status: status,
      detail: detail || '',
      document: getDocumentReferenceText(meta || {}),
      at: now()
    }));
  }

  function readStatus(meta) {
    try {
      var raw = safeLocalStorageGet(makeStatusKey(meta));
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function localDocumentReference(documentReference) {
    var separator = documentReference.indexOf(':');
    return separator >= 0 ? documentReference.substring(separator + 1) : documentReference;
  }

  function isUnderDocumentationRoot(documentReference) {
    var localReference = localDocumentReference(documentReference || '');
    return localReference === DOCUMENTATION_ROOT || localReference.indexOf(DOCUMENTATION_ROOT + '.') === 0;
  }

  function pathLooksLikeDocumentation(pathname) {
    var rootPath = '/' + DOCUMENTATION_ROOT.split('.').join('/') + '/';
    var path = pathname || '';
    return path.indexOf(rootPath) >= 0 || path.indexOf(rootPath.substring(0, rootPath.length - 1)) >= 0;
  }

  function latestDocumentationProbe() {
    var history = readProbeHistory();
    var index;

    for (index = history.length - 1; index >= 0; index -= 1) {
      var entry = history[index] || {};
      if (isUnderDocumentationRoot(entry.document || '') || pathLooksLikeDocumentation(entry.pathname || '')) {
        return entry;
      }
    }

    return null;
  }

  function getDisplaySpace(documentReference) {
    var localReference = localDocumentReference(documentReference || '');
    var lastDot = localReference.lastIndexOf('.');
    return lastDot > 0 ? localReference.substring(0, lastDot) : 'Document';
  }

  function recordRecent(meta, documentReference) {
    var userKey = getUserKey(meta);
    if (userKey.indexOf('XWikiGuest') !== -1) return;

    var list = readRecent(meta).filter(function (item) {
      return item.reference !== documentReference;
    });

    list.unshift({
      reference: documentReference,
      title: getPageTitle(),
      url: cleanCurrentURL(),
      space: getDisplaySpace(documentReference),
      viewedAt: now()
    });

    writeRecent(meta, list);
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function updateStatusChip(meta) {
    var chip = document.querySelector('.nh-recent-card .nh-stats-chip');
    if (!chip) return;

    var status = readStatus(meta);
    var probe = latestDocumentationProbe();
    chip.classList.remove('is-enabled');
    chip.classList.remove('is-disabled');

    if (status && (status.status === 'tracked' || status.status === 'valid')) {
      chip.textContent = 'Tracking v5 · suivi des documents actif';
      chip.classList.add('is-enabled');
      return;
    }

    if (status && status.status === 'no-edit-right') {
      chip.textContent = 'Tracking v5 · historique local actif · compteur sans droit Edit';
      chip.classList.add('is-disabled');
      return;
    }

    if (status && status.status === 'requesting') {
      chip.textContent = 'Tracking v5 · requête envoyée, réponse en attente';
      return;
    }

    if (status && status.status && status.status !== 'no-document-reference') {
      chip.textContent = 'Tracking v5 · à vérifier : ' + status.status;
      chip.classList.add('is-disabled');
      return;
    }

    if (probe) {
      chip.textContent = 'Tracking v5 · JSX vue sur document · phase : ' + probe.phase;
      if (probe.phase === 'tracked' || probe.phase === 'valid') {
        chip.classList.add('is-enabled');
      } else {
        chip.classList.add('is-disabled');
      }
      return;
    }

    chip.textContent = 'Tracking v5 · aucune exécution détectée sur TestPage.PAGE.Doc';
    chip.classList.add('is-disabled');
  }

  function renderRecent(meta) {
    var host = document.querySelector('[data-recent-documents]');
    if (!host) return;

    var userKey = getUserKey(meta);
    if (userKey.indexOf('XWikiGuest') !== -1) {
      host.innerHTML = '<li class="nh-feed-empty">Connectez-vous pour retrouver vos derniers documents ouverts.</li>';
      updateStatusChip(meta);
      return;
    }

    var recent = readRecent(meta);
    if (!recent.length) {
      host.innerHTML = '<li class="nh-feed-empty">Aucun document récemment ouvert sur ce navigateur.</li>';
      updateStatusChip(meta);
      return;
    }

    host.innerHTML = recent.slice(0, 10).map(function (item, index) {
      return '' +
        '<li class="nh-doc-item">' +
          '<a class="nh-doc-link" href="' + escapeHTML(item.url) + '">' +
            '<span class="nh-doc-symbol" aria-hidden="true">' + (index + 1) + '</span>' +
            '<span class="nh-doc-copy">' +
              '<span class="nh-doc-title">' + escapeHTML(item.title) + '</span>' +
              '<span class="nh-doc-meta">' + escapeHTML(item.space || 'Document') + '</span>' +
            '</span>' +
          '</a>' +
        '</li>';
    }).join('');

    updateStatusChip(meta);
  }

  function isViewAction() {
    var action = '';
    if (window.XWiki && XWiki.contextaction) action = String(XWiki.contextaction);

    if (action === 'view') return true;

    var path = window.location.pathname || '';
    return path.indexOf('/bin/view/') >= 0 || path.indexOf('/view/') >= 0;
  }

  function shouldCountView(documentReference) {
    var throttleKey = VIEW_THROTTLE_PREFIX + documentReference;
    var previous = Number(safeLocalStorageGet(throttleKey) || 0);
    return !previous || now() - previous >= VIEW_THROTTLE_MS;
  }

  function markViewCounted(documentReference) {
    safeLocalStorageSet(VIEW_THROTTLE_PREFIX + documentReference, String(now()));
  }

  function getTrackingEndpoint(meta) {
    if (!window.XWiki || !XWiki.Model || typeof XWiki.Document !== 'function') return '';

    var wikiName = getWikiName(meta);
    var endpointReferenceText = (wikiName && wikiName !== 'current' ? wikiName + ':' : '') + 'InfoWiki.CODE.TrackView';

    try {
      var reference = XWiki.Model.resolve(endpointReferenceText, XWiki.EntityType.DOCUMENT);
      return new XWiki.Document(reference).getURL('get', 'xpage=plain&outputSyntax=plain');
    } catch (error) {
      return '';
    }
  }

  function track(meta) {
    meta = meta || {};

    var documentReference = getDocumentReferenceText(meta);
    writeProbe('meta-ready', meta, documentReference);
    renderRecent(meta);

    if (!documentReference) {
      writeProbe('no-document-reference', meta, '');
      writeStatus(meta, 'no-document-reference');
      updateStatusChip(meta);
      return;
    }

    if (!isViewAction()) {
      if (isUnderDocumentationRoot(documentReference)) {
        writeProbe('not-view-action', meta, documentReference);
        writeStatus(meta, 'not-view-action');
      }
      return;
    }

    // Le suivi métier ne concerne que la racine documentaire configurée.
    // Le probe global reste, lui, écrit sur toutes les pages et permet de
    // vérifier que la JSX est réellement chargée avec le scope "Sur ce wiki".
    if (!isUnderDocumentationRoot(documentReference)) {
      return;
    }

    var endpoint = getTrackingEndpoint(meta);
    if (!endpoint) {
      if (isUnderDocumentationRoot(documentReference)) {
        writeProbe('endpoint-unavailable', meta, documentReference);
        writeStatus(meta, 'endpoint-unavailable');
      }
      return;
    }

    if (isUnderDocumentationRoot(documentReference)) {
      writeProbe('endpoint-ready', meta, endpoint);
    }

    var countView = shouldCountView(documentReference);
    var body = new URLSearchParams();
    body.set('form_token', getFormToken(meta));
    body.set('documentReference', documentReference);
    body.set('countView', countView ? '1' : '0');

    if (isUnderDocumentationRoot(documentReference)) {
      writeProbe('requesting', meta, endpoint);
      writeStatus(meta, 'requesting');
    }

    window.fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: body.toString()
    }).then(function (response) {
      if (!response.ok && isUnderDocumentationRoot(documentReference)) {
        writeProbe('http-' + response.status, meta, endpoint);
        writeStatus(meta, 'http-' + response.status);
      }
      return response.text();
    }).then(function (text) {
      var result = String(text);

      if (result.indexOf('tracked') !== -1) {
        if (countView) markViewCounted(documentReference);
        recordRecent(meta, documentReference);
        writeProbe('tracked', meta, documentReference);
        writeStatus(meta, 'tracked');
      } else if (result.indexOf('valid') !== -1) {
        recordRecent(meta, documentReference);
        writeProbe('valid', meta, documentReference);
        writeStatus(meta, 'valid');
      } else if (result.indexOf('no-edit-right') !== -1) {
        recordRecent(meta, documentReference);
        writeProbe('no-edit-right', meta, documentReference);
        writeStatus(meta, 'no-edit-right');
      } else if (result.indexOf('csrf') !== -1 && isUnderDocumentationRoot(documentReference)) {
        writeProbe('csrf', meta, documentReference);
        writeStatus(meta, 'csrf');
      } else if (result.indexOf('ignored') !== -1 && isUnderDocumentationRoot(documentReference)) {
        writeProbe('ignored-document', meta, documentReference);
        writeStatus(meta, 'ignored-document');
      }
    }).catch(function (error) {
      if (isUnderDocumentationRoot(documentReference)) {
        var message = error && error.message ? error.message : '';
        writeProbe('network-error', meta, message);
        writeStatus(meta, 'network-error', message);
      }
    });
  }

  function fallbackMeta() {
    return {
      document: getMetaContent('document'),
      wiki: getMetaContent('wiki'),
      form_token: getMetaContent('form_token'),
      user: getMetaContent('user')
    };
  }

  function startWithMeta(meta) {
    if (started) return;
    started = true;
    writeProbe('start-with-meta', meta || {}, '');
    track(meta || fallbackMeta());
  }

  function start() {
    writeProbe('start', fallbackMeta(), '');

    if (typeof window.require === 'function') {
      try {
        writeProbe('require-available', fallbackMeta(), '');
        window.require(['xwiki-meta'], function (meta) {
          writeProbe('xwiki-meta-loaded', meta || {}, '');
          startWithMeta(meta || fallbackMeta());
        }, function () {
          writeProbe('xwiki-meta-error', fallbackMeta(), '');
          startWithMeta(fallbackMeta());
        });

        window.setTimeout(function () {
          if (!started) writeProbe('xwiki-meta-timeout', fallbackMeta(), '');
          startWithMeta(fallbackMeta());
        }, 1800);
        return;
      } catch (error) {
        writeProbe('require-exception', fallbackMeta(), error && error.message ? error.message : '');
      }
    } else {
      writeProbe('require-unavailable', fallbackMeta(), '');
    }

    startWithMeta(fallbackMeta());
  }

  // Ce probe est écrit dès l'évaluation du fichier. Il permet de prouver
  // que la JSX "Sur ce wiki" a réellement été injectée sur la page visitée.
  writeProbe('script-evaluated', {}, '');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}());