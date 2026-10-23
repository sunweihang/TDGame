/**
 * Loading cover stays hidden on the login screen.
 * After the login tap it covers level init, and the bar reveals with a mask.
 */
(function () {
  var boot = document.getElementById('boot');
  if (!boot) return;
  var bar = boot.querySelector('.boot-bar');
  var mask = boot.querySelector('.boot-mask');
  var fill = boot.querySelector('.boot-fill');
  if (!bar || !mask || !fill) return;

  var shown = 0;
  var target = 0.02;
  var started = 0;
  var finishing = false;
  var active = false;

  function layout() {
    var w = bar.clientWidth;
    var h = bar.clientHeight;
    if (w < 2 || h < 2) return;
    fill.style.width = w + 'px';
    fill.style.height = h + 'px';
    fill.style.webkitMaskSize = w + 'px ' + h + 'px';
    fill.style.maskSize = w + 'px ' + h + 'px';
  }

  function paint(p) {
    var clamped = Math.max(0, Math.min(1, p));
    mask.style.width = (clamped * 100).toFixed(2) + '%';
    bar.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
    layout();
  }

  window.__tdSetLoadProgress = function (p) {
    if (!active) return;
    if (typeof p !== 'number' || !(p > target)) return;
    target = Math.min(0.97, p);
  };

  function markReady() {
    if (!active) return;
    window.__tdLoadReady = true;
    target = 1;
  }

  window.addEventListener('td-load-ready', markReady);
  window.addEventListener('elex-art-ready', markReady);

  function swallow(ev) {
    if (!active || boot.classList.contains('is-done')) return;
    ev.stopImmediatePropagation();
    ev.preventDefault();
  }
  window.addEventListener('pointerdown', swallow, true);
  window.addEventListener('touchstart', swallow, true);

  function frame() {
    if (!active || boot.classList.contains('is-done')) return;
    if (!window.__tdLoadReady) {
      var creep = 1 - Math.exp(-((Date.now() - started) / 1000) / 2.2);
      var auto = 0.08 + 0.78 * creep;
      if (auto > target) target = auto;
      if (Date.now() - started > 20000) markReady();
    }
    var k = target >= 1 ? 0.22 : 0.1;
    shown += (target - shown) * k;
    if (target >= 1 && shown > 0.995) shown = 1;
    paint(shown);
    if (shown >= 1) {
      if (finishing) return;
      finishing = true;
      setTimeout(function () {
        boot.classList.add('is-done');
      }, 160);
      return;
    }
    requestAnimationFrame(frame);
  }

  function activate() {
    if (active) return;
    active = true;
    boot.classList.remove('is-idle');
    started = Date.now();
    window.__tdLoadReady = false;
    layout();
    requestAnimationFrame(frame);
  }

  function watch() {
    if (window.__tdSplashClicked) {
      activate();
      return;
    }
    requestAnimationFrame(watch);
  }
  watch();
  window.addEventListener('resize', layout);
})();
