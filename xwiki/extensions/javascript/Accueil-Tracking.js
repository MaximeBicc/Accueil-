(function () {
  'use strict';

  var TRACKING_VERSION = 'v4';
  var DOCUMENTATION_ROOT = 'TestPage.PAGE.Doc';
  var STORAGE_PREFIX = 'infowiki.recentDocuments.v4.';
  var VIEW_THROTTLE_PREFIX = 'infowiki.viewThrottle.v4.';
  var TRACKING_STATUS_PREFIX = 'infowiki.trackingStatus.v4.';
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
      var raw = window.localStorage.getItem(makeStorageKey(meta));
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeRecent(meta, list) {
    try {
      window.localStorage.setItem(makeStorageKey(meta), JSON.stringify(list.slice(0, 10)));
    } catch (error) {
      // Le portail reste utilisable si le stockage navigateur est bloqué.
    }
  }

  function writeStatus(meta, status, detail) {
    try {
      window.localStorage.setItem(makeStatusKey(meta), JSON.stringify({
        version: TRACKING_VERSION,
        status: status,
        detail: detail || '',
        document: getDocumentReferenceText(meta || {}),
        at: Date.now()
      }));
    } catch (error) {
      // Diagnostic facultatif.
    }
  }

  function readStatus(meta) {
    try {
      var raw = window.localStorage.getItem(makeStatusKey(meta));
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function getDisplaySpace(documentReference) {
    var localReference = documentReference;
    var separator = localReference.indexOf(':');
    if (separator >= 0) localReference = localReference.substring(separator + 1);

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
      viewedAt: Date.now()
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
    chip.classList.remove('is-enabled');
    chip.classList.remove('is-disabled');

    if (!status) {
      chip.textContent = 'Tracking v4 · en attente d’une première consultation';
      return;
    }

    if (status.status === 'tracked' || status.status === 'valid') {
      chip.textContent = 'Tracking v4 · suivi des documents actif';
      chip.classList.add('is-enabled');
    } else if (status.status === 'no-edit-right') {
      chip.textContent = 'Tracking v4 · historique local actif · compteur sans droit Edit';
      chip.classList.add('is-disabled');
    } else if (status.status === 'requesting') {
      chip.textContent = 'Tracking v4 · requête envoyée, réponse en attente';
    } else {
      chip.textContent = 'Tracking v4 · à vérifier : ' + status.status;
      chip.classList.add('is-disabled');
    }
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

  function localDocumentReference(documentReference) {
    var separator = documentReference.indexOf(':');
    return separator >= 0 ? documentReference.substring(separator + 1) : documentReference;
  }

  function isUnderDocumentationRoot(documentReference) {
    var localReference = localDocumentReference(documentReference || '');
    return localReference === DOCUMENTATION_ROOT || localReference.indexOf(DOCUMENTATION_ROOT + '.') === 0;
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
    var now = Date.now();

    try {
      var previous = Number(window.localStorage.getItem(throttleKey) || 0);
      return !previous || now - previous >= VIEW_THROTTLE_MS;
    } catch (error) {
      return true;
    }
  }

  function markViewCounted(documentReference) {
    try {
      window.localStorage.setItem(VIEW_THROTTLE_PREFIX + documentReference, String(Date.now()));
    } catch (error) {
      // Sans localStorage, le serveur continuera à recevoir les consultations.
    }
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
    renderRecent(meta);

    if (!documentReference) {
      writeStatus(meta, 'no-document-reference');
      updateStatusChip(meta);
      return;
    }

    if (!isViewAction()) {
      if (isUnderDocumentationRoot(documentReference)) {
        writeStatus(meta, 'not-view-action');
      }
      return;
    }

    var endpoint = getTrackingEndpoint(meta);
    if (!endpoint) {
      if (isUnderDocumentationRoot(documentReference)) {
        writeStatus(meta, 'endpoint-unavailable');
      }
      return;
    }

    var countView = shouldCountView(documentReference);
    var body = new URLSearchParams();
    body.set('form_token', getFormToken(meta));
    body.set('documentReference', documentReference);
    body.set('countView', countView ? '1' : '0');

    if (isUnderDocumentationRoot(documentReference)) {
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
      if (!response.ok) {
        if (isUnderDocumentationRoot(documentReference)) {
          writeStatus(meta, 'http-' + response.status);
        }
      }
      return response.text();
    }).then(function (text) {
      var result = String(text);

      if (result.indexOf('tracked') !== -1) {
        if (countView) markViewCounted(documentReference);
        recordRecent(meta, documentReference);
        writeStatus(meta, 'tracked');
      } else if (result.indexOf('valid') !== -1) {
        recordRecent(meta, documentReference);
        writeStatus(meta, 'valid');
      } else if (result.indexOf('no-edit-right') !== -1) {
        recordRecent(meta, documentReference);
        writeStatus(meta, 'no-edit-right');
      } else if (result.indexOf('csrf') !== -1) {
        if (isUnderDocumentationRoot(documentReference)) {
          writeStatus(meta, 'csrf');
        }
      } else if (result.indexOf('ignored') !== -1 && isUnderDocumentationRoot(documentReference)) {
        writeStatus(meta, 'ignored-document');
      }
    }).catch(function (error) {
      if (isUnderDocumentationRoot(documentReference)) {
        writeStatus(meta, 'network-error', error && error.message ? error.message : '');
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
    track(meta || fallbackMeta());
  }

  function start() {
    if (typeof window.require === 'function') {
      try {
        window.require(['xwiki-meta'], function (meta) {
          startWithMeta(meta || fallbackMeta());
        }, function () {
          startWithMeta(fallbackMeta());
        });

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