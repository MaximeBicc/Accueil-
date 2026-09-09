(function () {
  'use strict';

  function ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function populatePreviewLatest(panel) {
    if (!document.querySelector('.preview-toolbar')) return false;

    var list = panel.querySelector('.nh-doc-list');
    if (!list) return false;

    var originals = Array.prototype.slice.call(list.querySelectorAll('.nh-doc-item'));
    if (!originals.length) return false;

    var targetCount = 18;
    var index = originals.length;

    while (list.querySelectorAll('.nh-doc-item').length < targetCount) {
      var source = originals[index % originals.length];
      var clone = source.cloneNode(true);
      var title = clone.querySelector('.nh-doc-title');
      var meta = clone.querySelector('.nh-doc-meta');

      if (title) title.textContent = title.textContent + ' · exemple ' + (index + 1);
      if (meta) meta.textContent = 'Document simulé pour tester le défilement';

      list.appendChild(clone);
      index += 1;
    }

    panel.setAttribute('data-latest-loaded', 'true');
    return true;
  }

  function loadMoreLatest(panel) {
    if (!panel || panel.getAttribute('data-latest-loaded') === 'true') return;

    if (!window.XWiki || !XWiki.Model || typeof XWiki.Document !== 'function') {
      populatePreviewLatest(panel);
      return;
    }

    if (typeof window.require !== 'function') return;

    panel.setAttribute('data-latest-loaded', 'loading');

    window.require(['xwiki-meta'], function (meta) {
      var endpoint;

      try {
        var reference = XWiki.Model.resolve(
          'InfoWiki.CODE.LatestDocuments',
          XWiki.EntityType.DOCUMENT,
          meta && meta.documentReference ? meta.documentReference : null
        );
        endpoint = new XWiki.Document(reference).getURL('get', 'xpage=plain&outputSyntax=plain');
      } catch (error) {
        panel.setAttribute('data-latest-loaded', 'error');
        return;
      }

      window.fetch(endpoint, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      }).then(function (response) {
        return response.text();
      }).then(function (html) {
        var container = document.createElement('div');
        container.innerHTML = html;
        var list = container.querySelector('.nh-doc-list');

        if (list) {
          panel.innerHTML = '';
          panel.appendChild(list);
        }

        panel.setAttribute('data-latest-loaded', 'true');
      }).catch(function () {
        panel.setAttribute('data-latest-loaded', 'error');
      });
    });
  }

  function initLatestScroll(root) {
    var panel = root.querySelector('[data-feed-panel="latest"]');
    if (!panel) return;

    var requested = false;

    function requestMore() {
      if (requested) return;
      requested = true;
      loadMoreLatest(panel);
    }

    panel.addEventListener('scroll', function () {
      if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 45) {
        requestMore();
      }
    });

    // Si la liste initiale tient entièrement dans la zone, on prépare
    // directement la version longue. Sinon elle sera chargée au premier scroll.
    window.setTimeout(function () {
      if (panel.scrollHeight <= panel.clientHeight + 80) {
        requestMore();
      }
    }, 250);
  }

  function initFeed(root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-feed-tab]'));
    var panels = Array.prototype.slice.call(root.querySelectorAll('[data-feed-panel]'));

    if (!tabs.length || !panels.length) return;

    function selectFeed(name) {
      tabs.forEach(function (tab) {
        var active = tab.getAttribute('data-feed-tab') === name;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
      });

      panels.forEach(function (panel) {
        var active = panel.getAttribute('data-feed-panel') === name;
        panel.hidden = !active;
      });
    }

    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        selectFeed(tab.getAttribute('data-feed-tab'));
      });

      tab.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        var direction = event.key === 'ArrowRight' ? 1 : -1;
        var nextIndex = (index + direction + tabs.length) % tabs.length;
        tabs[nextIndex].focus();
        selectFeed(tabs[nextIndex].getAttribute('data-feed-tab'));
      });
    });

    selectFeed(tabs[0].getAttribute('data-feed-tab'));
    initLatestScroll(root);
  }

  ready(function () {
    document.querySelectorAll('.naval-home').forEach(initFeed);
  });
}());
