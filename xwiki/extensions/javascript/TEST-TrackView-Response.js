(function () {
  'use strict';

  function createPanel() {
    var panel = document.createElement('div');
    panel.id = 'trackview-diagnostic-panel';
    panel.style.position = 'fixed';
    panel.style.top = '12px';
    panel.style.right = '12px';
    panel.style.zIndex = '2147483647';
    panel.style.width = 'min(560px, calc(100vw - 24px))';
    panel.style.maxHeight = '70vh';
    panel.style.overflow = 'auto';
    panel.style.padding = '12px 14px';
    panel.style.border = '2px solid #173f98';
    panel.style.borderRadius = '10px';
    panel.style.background = '#ffffff';
    panel.style.color = '#0d2d73';
    panel.style.font = '13px/1.45 sans-serif';
    panel.style.boxShadow = '0 10px 30px rgba(0,0,0,.18)';
    panel.textContent = 'DIAGNOSTIC TRACKVIEW — JavaScript exécuté.';
    document.body.appendChild(panel);
    return panel;
  }

  function addLine(panel, label, value) {
    var line = document.createElement('div');
    line.style.marginTop = '7px';
    var strong = document.createElement('strong');
    strong.textContent = label + ' : ';
    var text = document.createElement('span');
    text.textContent = value;
    line.appendChild(strong);
    line.appendChild(text);
    panel.appendChild(line);
  }

  function serializeReference(reference) {
    try {
      return XWiki.Model.serialize(reference);
    } catch (error) {
      return '';
    }
  }

  function endpointURL(meta) {
    try {
      var reference = XWiki.Model.resolve(
        'InfoWiki.CODE.TrackView',
        XWiki.EntityType.DOCUMENT,
        meta.documentReference
      );
      return new XWiki.Document(reference).getURL('get', 'xpage=plain&outputSyntax=plain');
    } catch (error) {
      return '';
    }
  }

  function post(endpoint, meta, documentReference, countView) {
    var body = new URLSearchParams();
    body.set('form_token', meta.form_token || '');
    body.set('documentReference', documentReference);
    body.set('countView', countView ? '1' : '0');

    var request = window.fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: body.toString()
    }).then(function (response) {
      return response.text().then(function (text) {
        return {
          status: response.status,
          ok: response.ok,
          text: String(text).replace(/\s+/g, ' ').slice(0, 350)
        };
      });
    });

    var timeout = new Promise(function (resolve) {
      window.setTimeout(function () {
        resolve({ status: 0, ok: false, text: 'TIMEOUT : aucune réponse après 8 secondes' });
      }, 8000);
    });

    return Promise.race([request, timeout]);
  }

  function run() {
    if (!document.body) return;
    var panel = createPanel();

    if (typeof window.require !== 'function') {
      addLine(panel, 'Erreur', 'window.require indisponible');
      return;
    }

    window.require(['xwiki-meta'], function (meta) {
      var documentReference = serializeReference(meta.documentReference);
      var endpoint = endpointURL(meta);

      addLine(panel, 'Document', documentReference || '(vide)');
      addLine(panel, 'Endpoint', endpoint || '(introuvable)');

      if (!documentReference || !endpoint) return;

      addLine(panel, 'Étape 1', 'validation sans compter la vue…');
      post(endpoint, meta, documentReference, false).then(function (result) {
        addLine(panel, 'Réponse étape 1', 'HTTP ' + result.status + ' — ' + result.text);

        if (result.text.indexOf('valid') === -1) {
          addLine(panel, 'Conclusion', 'TrackView ne valide pas encore ce document. On ne teste pas l’écriture.');
          return;
        }

        addLine(panel, 'Étape 2', 'écriture d’une vue…');
        return post(endpoint, meta, documentReference, true).then(function (writeResult) {
          addLine(panel, 'Réponse étape 2', 'HTTP ' + writeResult.status + ' — ' + writeResult.text);
          if (writeResult.text.indexOf('tracked') !== -1) {
            addLine(panel, 'Conclusion', 'OK : TrackView valide ET enregistre la vue.');
          } else if (writeResult.text.indexOf('no-edit-right') !== -1) {
            addLine(panel, 'Conclusion', 'Validation OK, mais pas de droit Edit sur les données de statistiques.');
          } else {
            addLine(panel, 'Conclusion', 'La réponse d’écriture doit être corrigée avant de retoucher Tracking V5.');
          }
        });
      }).catch(function (error) {
        addLine(panel, 'Erreur fetch', error && error.message ? error.message : String(error));
      });
    }, function () {
      addLine(panel, 'Erreur', 'xwiki-meta ne se charge pas');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}());
