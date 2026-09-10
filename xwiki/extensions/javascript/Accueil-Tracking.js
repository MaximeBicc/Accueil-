(function () {
  'use strict';

  var TRACKING_VERSION = 'v5.4';
  var DOCUMENTATION_ROOT = 'TestPage.PAGE.Doc';
  var STORAGE_PREFIX = 'infowiki.recentDocuments.v5.2.';
  var VIEW_THROTTLE_PREFIX = 'infowiki.viewThrottle.v5.3.';
  var TRACKING_STATUS_PREFIX = 'infowiki.trackingStatus.v5.4.';
  var VIEW_THROTTLE_MS = 30 * 60 * 1000;
  var started = false;

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

  function localDocumentReference(documentReference) {
    var separator = documentReference.indexOf(':');
    return separator >= 0 ? documentReference.substring(separator + 1) : documentReference;
  }

  function isUnderDocumentationRoot(documentReference) {
    var localReference = localDocumentReference(documentReference || '');
    return localReference === DOCUMENTATION_ROOT ||
      localReference.indexOf(DOCUMENTATION_ROOT + '.') === 0;
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

  function makeRecentKey(meta) {
    return STORAGE_PREFIX + getWikiName(meta) + '.' + getUserKey(meta);
  }

  function makeStatusKey(meta) {
    return TRACKING_STATUS_PREFIX + getWikiName(meta);
  }

  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Le tracking partagé peut continuer même sans localStorage.
    }
  }

  function writeStatus(meta, status, detail) {
    writeJSON(makeStatusKey(meta), {
      version: TRACKING_VERSION,
      status: status,
      detail: detail || '',
      document: getDocumentReferenceText(meta || {}),
      at: Date.now()
    });
  }

  function readStatus(meta) {
    return readJSON(makeStatusKey(meta), null);
  }

  function readRecent(meta) {
    var value = readJSON(makeRecentKey(meta), []);
    return Array.isArray(value) ? value : [];
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
      space: localDocumentReference(documentReference),
      viewedAt: Date.now()
    });

    writeJSON(makeRecentKey(meta), list.slice(0, 10));
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderRecent(meta) {
    var host = document.querySelector('[data-recent-documents]');
    if (!host) return;

    var recent = readRecent(meta);
    if (!recent.length) {
      host.innerHTML = '<li class="nh-feed-empty">Aucun document récemment ouvert sur ce navigateur.</li>';
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
  }

  function updateStatusChip(meta) {
    var chip = document.querySelector('.nh-recent-card .nh-stats-chip');
    if (!chip) return;

    var status = readStatus(meta);
    chip.classList.remove('is-enabled');
    chip.classList.remove('is-disabled');

    if (!status) {
      chip.textContent = 'Tracking v5.4 · en attente d’une première consultation';
      return;
    }

    if (status.status === 'tracked' || status.status === 'valid') {
      chip.textContent = 'Tracking v5.4 · suivi des documents actif';
      chip.classList.add('is-enabled');
    } else if (status.status === 'no-edit-right') {
      chip.textContent = 'Tracking v5.4 · historique local actif · compteur sans droit Edit';
      chip.classList.add('is-disabled');
    } else if (status.status === 'requesting') {
      chip.textContent = 'Tracking v5.4 · requête envoyée, réponse en attente';
    } else {
      chip.textContent = 'Tracking v5.4 · à vérifier : ' + status.status;
      chip.classList.add('is-disabled');
    }
  }

  function isTopLevelWindow() {
    try {
      return window.self === window.top;
    } catch (error) {
      return false;
    }
  }

  function isRealViewAction() {
    var action = '';
    var path = window.location.pathname || '';

    if (window.XWiki) {
      action = String(XWiki.contextaction || '');
    }

    // XWiki "get" sert notamment aux prévisualisations / chargements AJAX.
    // Une vraie navigation utilisateur vers le document est une action "view".
    if (action === 'get') return false;
    if (path.indexOf('/bin/get/') >= 0 || path.indexOf('/get/') >= 0) return false;

    // Une prévisualisation rendue dans un iframe ne doit pas compter comme vue.
    if (!isTopLevelWindow()) return false;

    if (action) return action === 'view';

    return path.indexOf('/bin/view/') >= 0 || path.indexOf('/view/') >= 0;
  }

  function makeThrottleKey(meta, documentReference) {
    return VIEW_THROTTLE_PREFIX +
      getWikiName(meta) + '.' +
      getUserKey(meta) + '.' +
      documentReference;
  }

  function shouldCountView(meta, documentReference) {
    try {
      var key = makeThrottleKey(meta, documentReference);
      var previous = Number(window.localStorage.getItem(key) || 0);
      return !previous || Date.now() - previous >= VIEW_THROTTLE_MS;
    } catch (error) {
      return true;
    }
  }

  function markViewCounted(meta, documentReference) {
    try {
      window.localStorage.setItem(
        makeThrottleKey(meta, documentReference),
        String(Date.now())
      );
    } catch (error) {
      // Pas bloquant.
    }
  }

  var TRACKVIEW_URL =
    '$escapetool.javascript($xwiki.getURL("InfoWiki.CODE.TrackView.WebHome", "get"))';

  function getTrackingEndpoint() {
    return TRACKVIEW_URL || '';
  }

  function track(meta) {
    meta = meta || {};

    var documentReference = getDocumentReferenceText(meta);
    renderRecent(meta);
    updateStatusChip(meta);

    if (!documentReference || !isRealViewAction()) return;
    if (!isUnderDocumentationRoot(documentReference)) return;

    var endpoint = getTrackingEndpoint();
    if (!endpoint) {
      writeStatus(meta, 'endpoint-unavailable');
      return;
    }

    var countView = shouldCountView(meta, documentReference);
    var body = new URLSearchParams();
    body.set('form_token', getFormToken(meta));
    body.set('documentReference', documentReference);
    body.set('countView', countView ? '1' : '0');

    writeStatus(meta, 'requesting', endpoint);

    var request = new XMLHttpRequest();
    request.open('POST', endpoint, true);
    request.withCredentials = true;
    request.setRequestHeader(
      'Content-Type',
      'application/x-www-form-urlencoded; charset=UTF-8'
    );
    request.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    request.onreadystatechange = function () {
      if (request.readyState !== 4) return;

      var result = String(request.responseText || '');

      if (request.status < 200 || request.status >= 300) {
        writeStatus(meta, 'http-' + request.status, result.slice(0, 180));
        return;
      }

      if (result.indexOf('tracked') !== -1) {
        if (countView) markViewCounted(meta, documentReference);
        recordRecent(meta, documentReference);
        writeStatus(meta, 'tracked');
      } else if (result.indexOf('valid') !== -1) {
        recordRecent(meta, documentReference);
        writeStatus(meta, 'valid');
      } else if (result.indexOf('no-edit-right') !== -1) {
        recordRecent(meta, documentReference);
        writeStatus(meta, 'no-edit-right');
      } else if (result.indexOf('csrf') !== -1) {
        writeStatus(meta, 'csrf');
      } else if (result.indexOf('ignored') !== -1) {
        writeStatus(meta, 'ignored-document');
      } else {
        writeStatus(meta, 'unexpected-response', result.slice(0, 180));
      }
    };

    request.onerror = function () {
      writeStatus(meta, 'network-error');
    };

    request.timeout = 8000;
    request.ontimeout = function () {
      writeStatus(meta, 'timeout');
    };

    request.send(body.toString());
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
    track(meta || fallbackMeta());
  }

  function start() {
    if (typeof window.require === 'function') {
      try {
        window.require(
          ['xwiki-meta'],
          function (meta) {
            startWithMeta(meta || fallbackMeta());
          },
          function () {
            startWithMeta(fallbackMeta());
          }
        );

        window.setTimeout(function () {
          startWithMeta(fallbackMeta());
        }, 1800);
        return;
      } catch (error) {
        // Fallback ci-dessous.
      }
    }

    startWithMeta(fallbackMeta());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}());
