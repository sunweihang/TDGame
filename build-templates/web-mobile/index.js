System.register(["./application.js"], function (_export, _context) {
  "use strict";

  var Application, _window$visualViewpor, DESIGN_WIDTH, DESIGN_HEIGHT, canvas, container, gameFrame, cocosScreen, CocosSize, resizeFrameId, lastFrameWidth, lastFrameHeight, containerRect, application;
  /**
   * Largest 9:16 game frame that fits in the browser viewport.
   * Uniform scale keeps runtime at 1080×1920 design proportions.
   */
  function calculateGameFrameSize() {
    var visualViewport = window.visualViewport;
    var viewportWidth = Math.max(1, (visualViewport == null ? void 0 : visualViewport.width) || window.innerWidth);
    var viewportHeight = Math.max(1, (visualViewport == null ? void 0 : visualViewport.height) || window.innerHeight);
    var scale = Math.min(viewportWidth / DESIGN_WIDTH, viewportHeight / DESIGN_HEIGHT);
    return {
      width: DESIGN_WIDTH * scale,
      height: DESIGN_HEIGHT * scale
    };
  }

  /**
   * Sync DOM container + Cocos physical windowSize (CSS px × DPR).
   */
  function applyGameFrameSize(forceEngineSync) {
    if (forceEngineSync === void 0) {
      forceEngineSync = false;
    }
    var frameSize = calculateGameFrameSize();
    var sizeChanged = frameSize.width !== lastFrameWidth || frameSize.height !== lastFrameHeight;
    if (!sizeChanged && !forceEngineSync) {
      return;
    }
    lastFrameWidth = frameSize.width;
    lastFrameHeight = frameSize.height;
    gameFrame.style.setProperty('--game-frame-width', frameSize.width + "px");
    gameFrame.style.setProperty('--game-frame-height', frameSize.height + "px");
    if (cocosScreen && CocosSize) {
      var devicePixelRatio = cocosScreen.devicePixelRatio;
      cocosScreen.windowSize = new CocosSize(frameSize.width * devicePixelRatio, frameSize.height * devicePixelRatio);
    }
  }

  function scheduleGameFrameResize() {
    if (resizeFrameId !== 0) {
      return;
    }
    resizeFrameId = requestAnimationFrame(function () {
      resizeFrameId = 0;
      applyGameFrameSize();
    });
  }
  function topLevelImport(url) {
    return System["import"](url);
  }
  /** DOM elex splash — hide only when the battlefield signals it is on screen. */
  var ELEX_SPLASH_MAX_MS = 15000;
  var elexSplashHidden = false;
  function finishElexSplash() {
    if (elexSplashHidden) {
      return;
    }
    var el = document.getElementById('splash');
    elexSplashHidden = true;
    window.__elexArtReady = true;
    if (el) {
      el.classList.add('is-done');
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
    }
  }
  function hideElexSplash() {
    // Wait for GameBootstrap art-ready; fallback so splash never sticks forever.
    if (window.__elexArtReady) {
      finishElexSplash();
      return;
    }
    var onReady = function () {
      window.removeEventListener('elex-art-ready', onReady);
      finishElexSplash();
    };
    window.addEventListener('elex-art-ready', onReady);
    setTimeout(onReady, ELEX_SPLASH_MAX_MS);
  }
  return {
    setters: [function (_applicationJs) {
      Application = _applicationJs.Application;
    }],
    execute: function () {
      DESIGN_WIDTH = 1080;
      DESIGN_HEIGHT = 1920;
      canvas = document.getElementById('GameCanvas');
      container = canvas.parentElement;
      gameFrame = document.getElementById('GameDiv');
      cocosScreen = null;
      CocosSize = null;
      resizeFrameId = 0;
      lastFrameWidth = 0;
      lastFrameHeight = 0;
      applyGameFrameSize();
      window.addEventListener('resize', scheduleGameFrameResize, {
        passive: true
      });
      (_window$visualViewpor = window.visualViewport) == null || _window$visualViewpor.addEventListener('resize', scheduleGameFrameResize, {
        passive: true
      });
      containerRect = container.getBoundingClientRect();
      canvas.width = containerRect.width;
      canvas.height = containerRect.height;
      application = new Application();
      topLevelImport('cc').then(function (engine) {
        /*
         * Web Mobile defaults to fitting the whole browser window.
         * GameDiv is CSS-locked to 9:16 — disable exactFitScreen so the engine
         * uses the frame size (avoids wide buffers squeezed into a narrow box).
         */
        var originalGameInit = engine.game.init.bind(engine.game);
        engine.game.init = function (config) {
          var overrideSettings = config.overrideSettings || (config.overrideSettings = {});
          var screenSettings = overrideSettings.screen || (overrideSettings.screen = {});
          screenSettings.exactFitScreen = false;

          // Branding is the DOM #splash <img>; engine canvas stays black (no Cocos logo).
          var splashScreenSettings = overrideSettings.splashScreen || (overrideSettings.splashScreen = {});
          splashScreenSettings.totalTime = 0;
          splashScreenSettings.logo = {
            type: 'none'
          };
          splashScreenSettings.background = {
            type: 'color',
            color: {
              x: 0,
              y: 0,
              z: 0,
              w: 1
            }
          };

          engine.game.init = originalGameInit;
          return originalGameInit(config).then(function () {
            cocosScreen = engine.screen;
            CocosSize = engine.Size;
            applyGameFrameSize(true);

            var launchScene = engine.settings.querySettings('launch', 'launchScene');
            if (launchScene) {
              engine.director.preloadScene(launchScene, null, function (error) {
                if (error) {
                  console.warn("首场景预加载失败，将按原流程继续加载：" + launchScene, error);
                }
              });
            }
          });
        };
        return application.init(engine);
      }).then(function () {
        return application.start();
      }).then(function () {
        hideElexSplash();
      })["catch"](function (err) {
        console.error(err);
        hideElexSplash();
      });
    }
  };
});
