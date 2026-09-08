(function () {
  'use strict';

  function ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function readModules(root) {
    return Array.prototype.map.call(root.querySelectorAll('[data-home-module]'), function (source) {
      return {
        label: source.getAttribute('data-label') || '',
        icon: source.getAttribute('data-icon') || '',
        title: source.getAttribute('data-title') || source.getAttribute('data-label') || '',
        description: source.getAttribute('data-description') || '',
        url: source.getAttribute('data-url') || '',
        points: Array.prototype.map.call(source.querySelectorAll('[data-module-point]'), function (point) {
          return point.textContent.trim();
        }).filter(Boolean)
      };
    });
  }

  function initModuleOrbit(root) {
    var orbit = root.querySelector('[data-module-orbit]');
    var nodesHost = root.querySelector('[data-module-nodes]');
    var detail = root.querySelector('[data-module-detail]');
    var detailIndex = root.querySelector('[data-detail-index]');
    var detailTitle = root.querySelector('[data-detail-title]');
    var detailDescription = root.querySelector('[data-detail-description]');
    var detailPoints = root.querySelector('[data-detail-points]');
    var detailLink = root.querySelector('[data-detail-link]');
    var modules = readModules(root);
    var nodeButtons = [];

    if (!orbit || !nodesHost || !detail || modules.length === 0) return;

    function layoutNodes() {
      var rect = orbit.getBoundingClientRect();
      var compact = window.matchMedia('(max-width: 620px)').matches;
      var nodeSize = compact ? 72 : 86;
      var hubClearance = compact ? 88 : 106;
      var maxRadius = Math.max(hubClearance, Math.min(rect.width, rect.height) / 2 - nodeSize / 2 - 10);
      var ringGap = compact ? 72 : 82;
      var radii = [];
      var radius;

      for (radius = hubClearance; radius <= maxRadius + 1; radius += ringGap) {
        radii.push(Math.min(radius, maxRadius));
        if (radius >= maxRadius) break;
      }

      if (!radii.length) radii.push(maxRadius);
      if (radii[radii.length - 1] !== maxRadius && maxRadius - radii[radii.length - 1] > 30) {
        radii.push(maxRadius);
      }

      var capacities = radii.map(function (currentRadius) {
        return Math.max(4, Math.floor((2 * Math.PI * currentRadius) / (nodeSize + 18)));
      });

      var assignments = radii.map(function () { return []; });
      var ringIndex = radii.length - 1;

      nodeButtons.forEach(function (_, index) {
        while (ringIndex > 0 && assignments[ringIndex].length >= capacities[ringIndex]) {
          ringIndex -= 1;
        }
        assignments[ringIndex].push(index);
        if (assignments[ringIndex].length >= capacities[ringIndex] && ringIndex > 0) {
          ringIndex -= 1;
        }
      });

      assignments.forEach(function (indices, currentRing) {
        if (!indices.length) return;
        var currentRadius = radii[currentRing];
        var offset = currentRing % 2 ? -90 : -90 + (180 / indices.length);

        indices.forEach(function (nodeIndex, position) {
          var angle = (offset + (360 / indices.length) * position) * Math.PI / 180;
          var x = Math.cos(angle) * currentRadius;
          var y = Math.sin(angle) * currentRadius;
          var button = nodeButtons[nodeIndex];

          button.style.transform = 'translate(-50%, -50%) translate(' + x.toFixed(2) + 'px, ' + y.toFixed(2) + 'px)';
          button.style.transitionDelay = (nodeIndex * 18) + 'ms';
        });
      });
    }

    function selectModule(index, instant) {
      if (!modules[index]) return;
      var module = modules[index];

      nodeButtons.forEach(function (button, buttonIndex) {
        var active = buttonIndex === index;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      function render() {
        detailIndex.textContent = 'Module ' + String(index + 1).padStart(2, '0');
        detailTitle.textContent = module.title;
        detailDescription.textContent = module.description;
        detailPoints.innerHTML = '';

        module.points.forEach(function (point) {
          var item = document.createElement('li');
          item.textContent = point;
          detailPoints.appendChild(item);
        });

        detailLink.href = module.url || '#';
        detailLink.style.display = module.url ? 'inline-flex' : 'none';
      }

      if (instant) {
        render();
        return;
      }

      detail.classList.remove('is-changing');
      window.requestAnimationFrame(function () {
        render();
        detail.classList.add('is-changing');
      });
    }

    nodesHost.innerHTML = '';
    nodeButtons = modules.map(function (module, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'nh-node';
      button.setAttribute('aria-label', 'Afficher ' + module.label);
      button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
      button.innerHTML = '<span><span class="nh-node-icon" aria-hidden="true">' + escapeHTML(module.icon) + '</span><span class="nh-node-label">' + escapeHTML(module.label) + '</span></span>';
      button.addEventListener('click', function () { selectModule(index); });
      nodesHost.appendChild(button);
      return button;
    });

    layoutNodes();
    selectModule(0, true);

    var resizeTimer;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(layoutNodes, 100);
    });
  }

  ready(function () {
    document.querySelectorAll('.naval-home').forEach(initModuleOrbit);
  });
}());