(function () {
  'use strict';

  var STORAGE_PREFIX = 'infowiki.recentDocuments.';
  var VIEW_THROTTLE_PREFIX = 'infowiki.viewThrottle.';
  var VIEW_THROTTLE_MS = 30 * 60 * 1000;

  function serializeReference(reference) {
    if (window.XWiki && XWiki.Model && reference) {
      return XWiki.Model.serialize(reference);
    }
    return '';
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
    var wiki = meta.wiki || 'current';
    return STORAGE_PREFIX + wiki + '.' + user;
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
      space: meta.space || '',
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

  function renderRecent(meta) {
    var host = document.querySelector('[data-recent-documents]');
    if (!host) return;

    var userReference = serializeReference(meta.userReference);
    if (!userReference || userReference.indexOf('XWikiGuest') !== -1) {
      host.innerHTML = '<li class="nh-feed-empty">Connectez-vous pour retrouver vos derniers documents ouverts.</li>';
      return;
    }

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
              '<span class="nh-doc-meta">' + escapeHTML(item.space || 'Documentation') + '</span>' +
            '</span>' +
          '</a>' +
        '</li>';
    }).join('');
  }

  function isDocumentationView(meta, documentReference) {
    if (window.XWiki && XWiki.contextaction && XWiki.contextaction !== 'view') return false;
    if (!documentReference) return false;

    var space = meta.space || '';
    return space === 'Documentation' || space.indexOf('Documentation.') === 0;
  }

  function canCountView(documentReference) {
    var throttleKey = VIEW_THROTTLE_PREFIX + documentReference;
    var now = Date.now();

    try {
      var previous = Number(window.localStorage.getItem(throttleKey) || 0);
      if (previous && now - previous < VIEW_THROTTLE_MS) return false;
      window.localStorage.setItem(throttleKey, String(now));
    } catch (error) {
      // Sans localStorage, on compte la consultation côté serveur.
    }

    return true;
  }

  function track(meta) {
    var documentReference = serializeReference(meta.documentReference);

    renderRecent(meta);

    if (!isDocumentationView(meta, documentReference)) return;
    if (!window.XWiki || typeof XWiki.Document !== 'function') return;

    var endpoint = new XWiki.Document('TrackView', 'InfoWiki.CODE').getURL('get');
    var body = new URLSearchParams();
    body.set('xpage', 'plain');
    body.set('outputSyntax', 'plain');
    body.set('form_token', meta.form_token || '');
    body.set('documentReference', documentReference);
    body.set('countView', canCountView(documentReference) ? '1' : '0');

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
      if (result.indexOf('tracked') !== -1 || result.indexOf('valid') !== -1) {
        recordRecent(meta, documentReference);
      }
    }).catch(function () {
      // Le tracking ne doit jamais bloquer la consultation d'un document.
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
