(function () {
  'use strict';

  function showMarker() {
    if (!document.body || document.getElementById('infowiki-tracking-ondemand-test')) return;

    var marker = document.createElement('div');
    marker.id = 'infowiki-tracking-ondemand-test';
    marker.textContent = '✅ TRACKING ON-DEMAND EXÉCUTÉ SUR : ' + (document.title || window.location.pathname);
    marker.setAttribute('style', [
      'position:fixed',
      'top:12px',
      'right:12px',
      'z-index:2147483647',
      'max-width:520px',
      'padding:12px 16px',
      'border:2px solid #173f98',
      'border-radius:10px',
      'background:#ffffff',
      'color:#0d2d73',
      'font:700 13px/1.4 Arial,sans-serif',
      'box-shadow:0 8px 24px rgba(0,0,0,.18)'
    ].join(';'));

    document.body.appendChild(marker);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showMarker, { once: true });
  } else {
    showMarker();
  }
}());
