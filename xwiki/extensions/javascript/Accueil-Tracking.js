(function () {
  'use strict';

  var STORAGE_PREFIX = 'infowiki.recentDocuments.v2.';
  var VIEW_THROTTLE_PREFIX = 'infowiki.viewThrottle.v2.';
  var TRACKING_STATUS_PREFIX = 'infowiki.trackingStatus.v2.';
  var VIEW_THROTTLE_MS = 30 * 60 * 1000;

  function serializeReference(reference) {
    if (window.XWiki && XWiki.Model && reference) {
      return XWiki.Model.serialize(reference);
    }
    return '';
  }

  function getWikiName(meta) {
    var reference = serializeReference(meta.documentReference);
    var separator = reference.indexOf(':');
    if (separator > 0) return reference.substring(0, separator);
    return meta.wiki || 'current';
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
    var user = serializeReference(meta.userReference) || 'guest';
    return STORAGE_PREFIX + getWikiName(meta) + '.' + user;
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

  function writeStatus(meta, status) {
    try {
      window.localStorage.setItem(makeStatusKey(meta), JSON.stringify({
        status: status,
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

  function recordRecent(meta, documentReference) {
    var userReference = serializeReference(meta.userReference);
    if (!userReference || userReference.indexOf('XWikiGuest') !== -1) return;

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

  function getDisplaySpace(documentReference) {
    var localReference = documentReference;
    var separator = localReference.indexOf(':');
    if (separator >= 0) localReference = localReference.substring(separator + 1);

    var lastDot = localReference.lastIndexOf('.');
    return lastDot > 0 ? localReference.substring(0, lastDot) : 'Documentation';
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
    if (!status) {
      chip.textContent = 'Suivi en attente d’une première consultation';
      return;
    }

    if (status.status === 'tracked' || status.status === 'valid') {
      chip.textContent = 'Suivi des documents actif';
      chip.classList.add('is-enabled');
      chip.classList.remove('is-disabled');
    } else if (status.status === 'no-edit-right') {
      chip.textContent = 'Historique local actif · compteur sans droit Edit';
      chip.classList.remove('is-enabled');
      chip.classList.add('is-disabled');
    } else {
      chip.textContent = 'Suivi à vérifier · ' + status.status;
      chip.classList.remove('is-enabled');
      chip.classList.add('is-disabled');
    }
  }

  function renderRecent(meta) {
    var host = document.querySelector('[data-recent-documents]');
    if (!host) return;

    var userReference = serializeReference(meta.userReference);
    if (!userReference || userReference.indexOf('XWikiGuest') !== -1) {
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
              '<span class="nh-doc-meta">' + escapeHTML(item.space || 'Documentation') + '</span>' +
            '</span>' +
          '</a>' +
        '</li>';
    }).join('');

    updateStatusChip(meta);
  }

  function isDocumentationReference(documentReference) {
    if (!documentReference) return false;

    var localReference = documentReference;
    var separator = localReference.indexOf(':');
    if (separator >= 0) localReference = localReference.substring(separator + 1);

    return localReference === 'Documentation' || localReference.indexOf('Documentation.') === 0;
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

    var reference = XWiki.Model.resolve(
      'InfoWiki.CODE.TrackView',
      XWiki.EntityType.DOCUMENT,
      meta.documentReference
    );

    return new XWiki.Document(reference).getURL('get');
  }

  function track(meta) {
    var documentReference = serializeReference(meta.documentReference);

    renderRecent(meta);

    if (window.XWiki && XWiki.contextaction && XWiki.contextaction !== 'view') return;
    if (!isDocumentationReference(documentReference)) return;

    var endpoint = getTrackingEndpoint(meta);
    if (!endpoint) {
      writeStatus(meta, 'endpoint-unavailable');
      return;
    }

    var countView = shouldCountView(documentReference);
    var body = new URLSearchParams();
    body.set('xpage', 'plain');
    body.set('outputSyntax', 'plain');
    body.set('form_token', meta.form_token || '');
    body.set('documentReference', documentReference);
    body.set('countView', countView ? '1' : '0');

    window.fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: body.toString()
    }).then(function (response) {
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
        // Le document a déjà été validé côté serveur : l'historique local peut fonctionner.
        recordRecent(meta, documentReference);
        writeStatus(meta, 'no-edit-right');
      } else if (result.indexOf('csrf') !== -1) {
        writeStatus(meta, 'csrf');
      } else {
        writeStatus(meta, 'ignored');
      }
    }).catch(function () {
      writeStatus(meta, 'network-error');
    });
  }

  function start() {
    if (typeof window.require !== 'function') return;
    window.require(['xwiki-meta'], function (meta) {
      track(meta || {});
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}());
