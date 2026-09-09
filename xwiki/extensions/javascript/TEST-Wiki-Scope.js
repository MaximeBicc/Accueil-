(function () {
  'use strict';

  function getCurrentDocumentName() {
    var meta = document.querySelector('meta[name="document"]');
    if (meta) {
      var value = meta.getAttribute('content');
      if (value) return value;
    }
    return window.location.pathname || 'page inconnue';
  }

  function showProbe() {
    if (!document.body || document.getElementById('jsx-wiki-scope-test')) return;

    var marker = document.createElement('h2');
    marker.id = 'jsx-wiki-scope-test';
    marker.textContent = '✅ TEST JSX « Sur ce wiki » actif sur : ' + getCurrentDocumentName();

    document.body.insertBefore(marker, document.body.firstChild);

    try {
      window.localStorage.setItem('infowiki.jsxWikiScopeTest', JSON.stringify({
        document: getCurrentDocumentName(),
        path: window.location.pathname || '',
        loadedAt: Date.now()
      }));
    } catch (error) {
      // Le marqueur visuel suffit si le stockage navigateur est indisponible.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showProbe, { once: true });
  } else {
    showProbe();
  }
}());
