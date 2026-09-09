(function () {
  'use strict';

  function ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
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
  }

  ready(function () {
    document.querySelectorAll('.naval-home').forEach(initFeed);
  });
}());
