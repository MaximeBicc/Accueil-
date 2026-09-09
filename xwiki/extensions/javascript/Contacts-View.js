(function () {
  'use strict';

  function ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function initContactsView(root) {
    var tabButtons = root.querySelectorAll('[data-contacts-tab]');
    var panels = root.querySelectorAll('[data-contacts-panel]');
    var managerShortcut = root.querySelector('[data-open-manager]');
    var layoutButtons = root.querySelectorAll('[data-contact-layout]');
    var collection = root.querySelector('[data-contact-collection]');
    var searchInput = root.querySelector('[data-contact-search]');
    var noSearchResult = root.querySelector('[data-no-contact-result]');
    var toast = root.querySelector('[data-contacts-toast]');

    function openTab(name) {
      tabButtons.forEach(function (button) {
        var active = button.getAttribute('data-contacts-tab') === name;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      panels.forEach(function (panel) {
        var active = panel.getAttribute('data-contacts-panel') === name;
        panel.hidden = !active;
      });
    }

    tabButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        openTab(button.getAttribute('data-contacts-tab'));
      });
    });

    if (managerShortcut) {
      managerShortcut.addEventListener('click', function () {
        openTab('manage');
        var managerPanel = root.querySelector('[data-contacts-panel="manage"]');
        if (managerPanel) managerPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    function setLayout(layout) {
      if (!collection) return;

      var vertical = layout === 'vertical';
      collection.classList.toggle('is-horizontal', !vertical);
      collection.classList.toggle('is-vertical', vertical);

      layoutButtons.forEach(function (button) {
        var active = button.getAttribute('data-contact-layout') === layout;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      try {
        window.localStorage.setItem('xwiki.contacts.layout', layout);
      } catch (error) {
        // La préférence d'affichage est facultative.
      }
    }

    layoutButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        setLayout(button.getAttribute('data-contact-layout'));
      });
    });

    try {
      var storedLayout = window.localStorage.getItem('xwiki.contacts.layout');
      if (storedLayout === 'horizontal' || storedLayout === 'vertical') {
        setLayout(storedLayout);
      }
    } catch (error) {
      // Le mode horizontal reste le défaut.
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        var query = searchInput.value.trim().toLocaleLowerCase();
        var cards = root.querySelectorAll('[data-contact-card]');
        var visibleCount = 0;

        cards.forEach(function (card) {
          var haystack = (card.getAttribute('data-search-text') || '').toLocaleLowerCase();
          var visible = !query || haystack.indexOf(query) !== -1;
          card.hidden = !visible;
          if (visible) visibleCount += 1;
        });

        if (noSearchResult) {
          noSearchResult.hidden = !query || visibleCount > 0 || cards.length === 0;
        }
      });
    }

    var saveStatus = root.getAttribute('data-save-status');
    var saveMessage = root.getAttribute('data-save-message');
    if (toast && saveStatus && saveMessage) {
      toast.textContent = saveMessage;
      toast.classList.toggle('is-error', saveStatus === 'error');
      toast.classList.add('is-visible');

      window.setTimeout(function () {
        toast.classList.remove('is-visible');
      }, 5000);
    }
  }

  ready(function () {
    document.querySelectorAll('.contacts-page').forEach(initContactsView);
  });
}());
