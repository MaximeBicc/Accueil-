(function () {
  'use strict';

  // IMPORTANT : cette JSX de diagnostic doit avoir "Parser le contenu = Oui".
  // Les URL sont générées côté serveur par XWiki : aucune reconstruction
  // JavaScript de la référence TrackView / WebHome.
  var TRACKVIEW_URL = '$escapetool.javascript($xwiki.getURL("InfoWiki.CODE.TrackView.WebHome", "get"))';
  var TRACKVIEW_PING_URL = '$escapetool.javascript($xwiki.getURL("InfoWiki.CODE.TrackView.WebHome", "get", "diagnostic=1&diagnosticStep=0"))';

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
    panel.textContent = 'DIAGNOSTIC TRACKVIEW — URL générée côté XWiki.';
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

  function extractDiagnostic(text) {
    var value = String(text || '');
    var match = value.match(/diag-[0-9]+\|[^<\r\n]*/);
    if (match) return match[0].replace(/\s+$/g, '');
    return value.replace(/\s+/g, ' ').slice(0, 300) || '(réponse vide)';
  }

  function request(method, url, bodyText) {
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      var finished = false;

      function done(result) {
        if (finished) return;
        finished = true;
        resolve(result);
      }

      xhr.open(method, url, true);
      xhr.withCredentials = true;
      xhr.timeout = 8000;
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      if (method === 'POST') {
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
      }

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        done({ status: xhr.status, text: extractDiagnostic(xhr.responseText) });
      };

      xhr.onerror = function () {
        done({ status: xhr.status || 0, text: 'ERREUR RÉSEAU XHR' });
      };

      xhr.ontimeout = function () {
        done({ status: 0, text: 'TIMEOUT : aucune réponse après 8 secondes' });
      };

      xhr.send(method === 'POST' ? (bodyText || '') : null);
    });
  }

  function makeBody(meta, documentReference, step) {
    var body = new URLSearchParams();
    body.set('diagnostic', '1');
    body.set('diagnosticStep', String(step));
    body.set('form_token', meta.form_token || '');
    body.set('documentReference', documentReference || '');
    return body.toString();
  }

  function runSteps(panel, meta, documentReference) {
    var step = 1;

    function next() {
      if (step > 7) {
        addLine(panel, 'Conclusion', 'Diagnostic terminé jusqu’à l’étape 7.');
        return;
      }

      var currentStep = step;
      addLine(panel, 'Étape ' + currentStep, 'POST diagnostic vers TrackView…');

      request('POST', TRACKVIEW_URL, makeBody(meta, documentReference, currentStep)).then(function (result) {
        addLine(panel, 'Réponse étape ' + currentStep, 'HTTP ' + result.status + ' — ' + result.text);

        if (result.status === 0 || result.text.indexOf('TIMEOUT') !== -1 || result.text.indexOf('ERREUR RÉSEAU') !== -1) {
          addLine(panel, 'Conclusion', 'Blocage détecté pendant l’étape ' + currentStep + '.');
          return;
        }

        step += 1;
        next();
      });
    }

    next();
  }

  function run() {
    if (!document.body) return;
    var panel = createPanel();

    addLine(panel, 'URL TrackView via $xwiki.getURL', TRACKVIEW_URL || '(vide)');
    addLine(panel, 'URL ping via $xwiki.getURL', TRACKVIEW_PING_URL || '(vide)');

    if (!TRACKVIEW_URL || TRACKVIEW_URL.indexOf('$xwiki.getURL') !== -1) {
      addLine(panel, 'Erreur', 'La JSX n’est pas parsée. Mets « Parser le contenu = Oui ».');
      return;
    }

    // Étape 0 volontairement en GET, avec une URL entièrement générée par XWiki.
    // Pas de xpage=plain / outputSyntax=plain : on cherche simplement le marqueur
    // diag-0 dans la réponse, même si XWiki renvoie sa page HTML habituelle.
    addLine(panel, 'Étape 0', 'GET direct vers TrackView.WebHome…');
    request('GET', TRACKVIEW_PING_URL, '').then(function (ping) {
      addLine(panel, 'Réponse étape 0', 'HTTP ' + ping.status + ' — ' + ping.text);

      if (ping.text.indexOf('diag-0|executed') === -1) {
        addLine(panel, 'Conclusion', 'TrackView.WebHome n’est pas confirmé comme exécuté. Aucun POST n’est lancé.');
        return;
      }

      addLine(panel, 'Conclusion étape 0', 'TrackView.WebHome EST exécuté. On peut maintenant tester les POST.');

      if (typeof window.require !== 'function') {
        addLine(panel, 'Erreur', 'window.require indisponible');
        return;
      }

      window.require(['xwiki-meta'], function (meta) {
        var documentReference = serializeReference(meta.documentReference);
        addLine(panel, 'Document', documentReference || '(vide)');
        runSteps(panel, meta, documentReference);
      }, function () {
        addLine(panel, 'Erreur', 'xwiki-meta ne se charge pas');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}());
