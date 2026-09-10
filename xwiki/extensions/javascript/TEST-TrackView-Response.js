(function () {
  'use strict';

  function createPanel() {
    var panel = document.createElement('div');
    panel.id = 'trackview-diagnostic-panel';
    panel.style.position = 'fixed';
    panel.style.top = '12px';
    panel.style.right = '12px';
    panel.style.zIndex = '2147483647';
    panel.style.width = 'min(620px, calc(100vw - 24px))';
    panel.style.maxHeight = '78vh';
    panel.style.overflow = 'auto';
    panel.style.padding = '12px 14px';
    panel.style.border = '2px solid #173f98';
    panel.style.borderRadius = '10px';
    panel.style.background = '#ffffff';
    panel.style.color = '#0d2d73';
    panel.style.font = '13px/1.45 sans-serif';
    panel.style.boxShadow = '0 10px 30px rgba(0,0,0,.18)';
    panel.textContent = 'DIAGNOSTIC TRACKVIEW PAR ÉTAPES — JavaScript exécuté.';
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
        'InfoWiki.CODE.TrackView.WebHome',
        XWiki.EntityType.DOCUMENT,
        meta.documentReference
      );
      return new XWiki.Document(reference).getURL('get', 'xpage=plain&outputSyntax=plain');
    } catch (error) {
      return '';
    }
  }

  function requestStep(endpoint, meta, documentReference, step, method) {
    var body = new URLSearchParams();
    body.set('diagnostic', '1');
    body.set('diagnosticStep', String(step));
    body.set('form_token', meta.form_token || '');
    body.set('documentReference', documentReference || '');

    var options = {
      method: method || 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      }
    };

    var url = endpoint;
    if (options.method === 'GET') {
      var parsed = new URL(endpoint, window.location.href);
      parsed.searchParams.set('diagnostic', '1');
      parsed.searchParams.set('diagnosticStep', String(step));
      url = parsed.toString();
    } else {
      options.body = body.toString();
    }

    var request = window.fetch(url, options).then(function (response) {
      return response.text().then(function (text) {
        return {
          status: response.status,
          ok: response.ok,
          text: String(text).replace(/\s+/g, ' ').slice(0, 500)
        };
      });
    }).catch(function (error) {
      return {
        status: 0,
        ok: false,
        text: 'ERREUR FETCH : ' + (error && error.message ? error.message : String(error))
      };
    });

    var timeout = new Promise(function (resolve) {
      window.setTimeout(function () {
        resolve({
          status: 0,
          ok: false,
          text: 'TIMEOUT : aucune réponse après 8 secondes'
        });
      }, 8000);
    });

    return Promise.race([request, timeout]);
  }

  function shouldContinue(step, text) {
    if (step === 0) return text.indexOf('diag-0|executed') !== -1;
    if (step === 1) return text.indexOf('diag-1|csrf-ok') !== -1;
    if (step === 2) return text.indexOf('diag-2|resolved|') !== -1;
    if (step === 3) return text.indexOf('diag-3|scope-ok|') !== -1;
    if (step === 4) return text.indexOf('diag-4|type=document|') !== -1;
    if (step === 5) return text.indexOf('diag-5|edit-right=true|') !== -1;
    if (step === 6) return text.indexOf('diag-6|stats-access-ok|') !== -1;
    return false;
  }

  function explainStop(step, text) {
    if (text.indexOf('TIMEOUT') !== -1) {
      return 'Blocage/absence de réponse pendant l’étape ' + step + '.';
    }
    if (step === 1 && text.indexOf('csrf-failed') !== -1) {
      return 'TrackView s’exécute, mais le token CSRF est refusé.';
    }
    if (step === 3 && text.indexOf('scope-failed') !== -1) {
      return 'TrackView s’exécute, mais la page n’est pas reconnue sous TestPage.PAGE.Doc.';
    }
    if (step === 4 && text.indexOf('type-object-missing') !== -1) {
      return 'TrackView ne trouve aucun objet contenant la propriété type.';
    }
    if (step === 4 && text.indexOf('type=') !== -1) {
      return 'TrackView trouve l’objet, mais type n’est pas document.';
    }
    if (step === 5 && text.indexOf('edit-right=false') !== -1) {
      return 'Validation OK, mais l’utilisateur n’a pas le droit Edit sur la page de statistiques.';
    }
    return 'L’étape ' + step + ' a répondu, mais avec un résultat inattendu.';
  }

  function runSteps(panel, endpoint, meta, documentReference) {
    var steps = [0, 1, 2, 3, 4, 5, 6];

    function next(index) {
      if (index >= steps.length) {
        addLine(panel, 'Étape 7', 'écriture réelle d’une vue…');
        requestStep(endpoint, meta, documentReference, 7, 'POST').then(function (result) {
          addLine(panel, 'Réponse étape 7', 'HTTP ' + result.status + ' — ' + result.text);
          if (result.text.indexOf('diag-7|tracked|') !== -1) {
            addLine(panel, 'Conclusion', 'OK : TrackView est exécuté, valide le document et enregistre une vue.');
          } else if (result.text.indexOf('diag-7|no-edit-right|') !== -1) {
            addLine(panel, 'Conclusion', 'Tout fonctionne jusqu’à l’écriture, bloquée par les droits Edit.');
          } else {
            addLine(panel, 'Conclusion', 'Le blocage final est à l’étape 7 (création/incrément/sauvegarde).');
          }
        });
        return;
      }

      var step = steps[index];
      var descriptions = {
        0: 'ping de TrackView.WebHome',
        1: 'POST + validation CSRF',
        2: 'résolution de la référence du document',
        3: 'validation de la racine TestPage.PAGE.Doc',
        4: 'lecture de la propriété type',
        5: 'vérification du droit Edit sur les statistiques',
        6: 'accès à la page de stats et aux objets existants'
      };

      addLine(panel, 'Étape ' + step, descriptions[step] + '…');
      requestStep(endpoint, meta, documentReference, step, step === 0 ? 'GET' : 'POST').then(function (result) {
        addLine(panel, 'Réponse étape ' + step, 'HTTP ' + result.status + ' — ' + result.text);

        if (!shouldContinue(step, result.text)) {
          addLine(panel, 'Conclusion', explainStop(step, result.text));
          return;
        }

        next(index + 1);
      });
    }

    next(0);
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

      if (!documentReference || !endpoint) {
        addLine(panel, 'Conclusion', 'Impossible de démarrer le diagnostic : référence ou endpoint absent.');
        return;
      }

      runSteps(panel, endpoint, meta, documentReference);
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
