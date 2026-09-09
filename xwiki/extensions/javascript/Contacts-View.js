(function () {
  'use strict';

  function ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function normalizeText(value) {
    var text = String(value || '').toLocaleLowerCase('fr');
    if (typeof text.normalize === 'function') {
      text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return text.trim();
  }

  function initContactsView(root) {
    var tabButtons = root.querySelectorAll('[data-contacts-tab]');
    var panels = root.querySelectorAll('[data-contacts-panel]');
    var managerShortcut = root.querySelector('[data-open-manager]');
    var layoutButtons = root.querySelectorAll('[data-contact-layout]');
    var collection = root.querySelector('[data-contact-collection]');
    var searchInput = root.querySelector('[data-contact-search]');
    var groupFilter = root.querySelector('[data-contact-group-filter]');
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

    function populateGroupFilter() {
      if (!groupFilter) return;

      var groupsByKey = {};
      root.querySelectorAll('[data-contact-card] .ct-group-chip').forEach(function (chip) {
        var label = chip.textContent.trim();
        var key = normalizeText(label);
        if (key && key !== normalizeText('Sans groupe')) {
          groupsByKey[key] = label;
        }
      });

      Object.keys(groupsByKey)
        .sort(function (a, b) {
          return groupsByKey[a].localeCompare(groupsByKey[b], 'fr', { sensitivity: 'base' });
        })
        .forEach(function (key) {
          var option = document.createElement('option');
          option.value = key;
          option.textContent = groupsByKey[key];
          groupFilter.appendChild(option);
        });
    }

    function applyContactFilters() {
      var query = normalizeText(searchInput ? searchInput.value : '');
      var selectedGroup = groupFilter ? normalizeText(groupFilter.value) : '';
      var cards = root.querySelectorAll('[data-contact-card]');
      var visibleCount = 0;

      cards.forEach(function (card) {
        var explicitSearchText = card.getAttribute('data-search-text') || '';
        var haystack = normalizeText(explicitSearchText + ' ' + card.textContent);
        var matchesText = !query || haystack.indexOf(query) !== -1;

        var matchesGroup = !selectedGroup;
        if (selectedGroup) {
          matchesGroup = Array.prototype.some.call(card.querySelectorAll('.ct-group-chip'), function (chip) {
            return normalizeText(chip.textContent) === selectedGroup;
          });
        }

        var visible = matchesText && matchesGroup;
        card.hidden = !visible;
        if (visible) visibleCount += 1;
      });

      if (noSearchResult) {
        var hasActiveFilter = !!query || !!selectedGroup;
        noSearchResult.hidden = !hasActiveFilter || visibleCount > 0 || cards.length === 0;
      }
    }

    populateGroupFilter();

    if (searchInput) {
      searchInput.addEventListener('input', applyContactFilters);
    }

    if (groupFilter) {
      groupFilter.addEventListener('change', applyContactFilters);
    }

    applyContactFilters();

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
