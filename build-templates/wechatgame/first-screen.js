/**
 * Custom WeChat first screen.
 * Draws the loading cover and progress bar, then the login art until the tap.
 * Removes the Cocos logo and slogan.
 *
 * Important: upload + paint the splash BEFORE resolving start().
 * Otherwise the engine can steal the WebGL context and the user only
 * ever sees the black placeholder (intermittent "elex missing").
 */
const VS_BG = `
attribute vec4 a_Position;
attribute vec2 a_TexCoord;
varying vec2 v_TexCoord;
void main() {
    gl_Position = a_Position;
    v_TexCoord = a_TexCoord;
}`;

const FS_BG = `
precision mediump float;
uniform sampler2D u_Sampler;
uniform float u_flip;
varying vec2 v_TexCoord;
void main() {
    vec2 texCoord = v_TexCoord;
    if (u_flip > 0.5) {
        texCoord.y = 1.0 - texCoord.y;
    }
    gl_FragColor = texture2D(u_Sampler, texCoord);
}`;

const options = {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'default',
    failIfMajorPerformanceCaveat: false,
};

let gl = null;
let bg = null;
let programBg = null;
let rafHandle = null;
let bgTexture = null;
let bgVertexBuffer = null;
let afterTick = null;
let backgroundFlip = 1.0;
let bgName = 'loading_bg.webp';
const loginName = 'splash_screen.webp';
/** 'loading' draws the forest cover and bar; 'login' is the click-to-enter art. */
let screenMode = 'login';
let loadingImg = null;
let loginImg = null;
let trackImg = null;
let fillImg = null;
let offscreen = null;
let offctx = null;
let shownProgress = 0;
/** When false, RAF loop stops — prevents elex splash from covering the game. */
let running = false;
/** True after at least one successful draw with the real splash texture. */
let bgPainted = false;
let splashPaintedAt = 0;
let drawFailCount = 0;

function createProgram(vshader, fshader) {
    const vertexShader = loadShader(gl.VERTEX_SHADER, vshader);
    const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fshader);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.log('Failed to link program: ' + gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    gl.deleteShader(fragmentShader);
    gl.deleteShader(vertexShader);
    return program;
}

function loadShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.log('Failed to compile shader: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function initBgVertexBuffer() {
    // Cover the full canvas (no letterbox).
    const vertices = new Float32Array([
        1.0, 1.0, 1.0, 1.0,
        1.0, -1.0, 1.0, 0.0,
        -1.0, 1.0, 0.0, 1.0,
        -1.0, -1.0, 0.0, 0.0,
    ]);
    bgVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bgVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
}

function createSplashImage() {
    if (typeof wx !== 'undefined' && typeof wx.createImage === 'function') {
        return wx.createImage();
    }
    const c = typeof canvas !== 'undefined' ? canvas : (typeof window !== 'undefined' ? window.canvas : null);
    if (c && typeof c.createImage === 'function') {
        return c.createImage();
    }
    return new Image();
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = createSplashImage();
        img.premultiplyAlpha = false;
        img.onload = function () {
            resolve(img);
        };
        img.onerror = function (err) {
            reject(err || new Error(src));
        };
        img.src = src.replace('#', '%23');
    });
}

function loadBackground(bgPath) {
    return loadImage(bgPath).then((img) => {
        bg = img;
        return img;
    });
}

function ensureOffscreen(w, h) {
    if (offscreen && offctx && offscreen.width === w && offscreen.height === h) return true;
    let c = null;
    try {
        if (typeof wx !== 'undefined' && typeof wx.createCanvas === 'function') {
            const made = wx.createCanvas();
            const screen = (typeof window !== 'undefined' && window.canvas) || (typeof canvas !== 'undefined' ? canvas : null);
            if (made && made !== screen) c = made;
        }
    } catch (e) {
        c = null;
    }
    if (!c && typeof document !== 'undefined' && document.createElement) {
        c = document.createElement('canvas');
    }
    if (!c || typeof c.getContext !== 'function') return false;
    c.width = w;
    c.height = h;
    offscreen = c;
    offctx = c.getContext('2d');
    return !!offctx;
}

function traceRound(ctx, x, y, w, h) {
    const r = Math.min(h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

const START_LABEL = '开始游戏';
/** LumewispVale start hint: #fff2d2 on rgba(40, 28, 14, 0.9). */
const START_FILL = '#fff2d2';
const START_RIM = 'rgba(40, 28, 14, 0.9)';
let startFontFamily = '"PingFang SC", "Microsoft YaHei", sans-serif';

function loadStartFont() {
    try {
        if (typeof wx !== 'undefined' && typeof wx.loadFont === 'function') {
            const family = wx.loadFont('ZCOOLKuaiLe-Regular.ttf');
            if (family) startFontFamily = '"' + family + '", "PingFang SC", sans-serif';
        }
    } catch (e) {
        /* system face still uses the cream fill and brown rim */
    }
}

/** Opacity 255 → 120 over 0.9s each way, same breath as LumewispVale. */
function loginBreathe() {
    const t = (Date.now() % 1800) / 1800;
    const wave = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
    return 1 - wave * (1 - 120 / 255);
}

function drawStartLabel(ctx, w, h, alpha) {
    const fontPx = Math.max(28, Math.round(h * 0.042));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(w * 0.5, h * 0.958);
    ctx.font = fontPx + 'px ' + startFontFamily;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = fontPx * (8 / 48);
    ctx.strokeStyle = START_RIM;
    ctx.fillStyle = START_FILL;
    ctx.strokeText(START_LABEL, 0, 0);
    ctx.fillText(START_LABEL, 0, 0);
    ctx.restore();
}

function paintLogin() {
    const img = loginImg;
    if (!img || !img.width || !img.height) return false;
    const w = img.width;
    const h = img.height;
    if (!ensureOffscreen(w, h)) return false;
    const ctx = offctx;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    drawStartLabel(ctx, w, h, loginBreathe());
    bg = offscreen;
    return true;
}

/** Forest cover plus the authored bar. The fill is clipped, not stretched. */
function paintLoading(progress) {
    const img = loadingImg;
    if (!img || !img.width || !img.height) return false;
    const w = img.width;
    const h = img.height;
    if (!ensureOffscreen(w, h)) return false;
    const ctx = offctx;
    const p = Math.max(0, Math.min(1, progress));
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    if (trackImg && trackImg.width && fillImg && fillImg.width) {
        const bw = w * 0.76348;
        const bh = bw * (trackImg.height / trackImg.width);
        const bx = (w - bw) / 2;
        const by = h * 0.859;
        ctx.drawImage(trackImg, bx, by, bw, bh);
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx, by, bw * p, bh);
        ctx.clip();
        ctx.drawImage(fillImg, bx, by, bw, bh);
        ctx.restore();
        const fontPx = Math.max(12, Math.round(h * 0.0255));
        ctx.font = 'bold ' + fontPx + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineWidth = fontPx * 0.18;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#120d08';
        ctx.fillStyle = '#ffffff';
        const label = '加载中...';
        ctx.strokeText(label, w * 0.5, by + bh + h * 0.008);
        ctx.fillText(label, w * 0.5, by + bh + h * 0.008);
    }

    bg = offscreen;
    return true;
}

function initBgTexture() {
    bgTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bgTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        2,
        2,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]),
    );
}

function updateBgTexture() {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bgTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bg);
}

function drawTexture(program, texture, vertexBuffer) {
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_Sampler'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_flip'), backgroundFlip);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    const aPosition = gl.getAttribLocation(program, 'a_Position');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);
    const aTexCoord = gl.getAttribLocation(program, 'a_TexCoord');
    gl.enableVertexAttribArray(aTexCoord);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 16, 8);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function syncViewport() {
    if (!gl) return;
    const c = typeof canvas !== 'undefined' ? canvas : (typeof window !== 'undefined' ? window.canvas : null);
    const w = (gl.drawingBufferWidth || (c && c.width) || 0) | 0;
    const h = (gl.drawingBufferHeight || (c && c.height) || 0) | 0;
    if (w > 0 && h > 0) {
        gl.viewport(0, 0, w, h);
    }
}

function draw() {
    syncViewport();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (programBg && bgTexture && bgVertexBuffer) {
        drawTexture(programBg, bgTexture, bgVertexBuffer);
    }
}

function markPainted() {
    if (!bgPainted) {
        bgPainted = true;
        splashPaintedAt = Date.now();
    }
}

function tick() {
    if (!running) return;
    rafHandle = requestAnimationFrame(() => {
        if (!running) return;
        try {
            if (screenMode === 'login' && paintLogin() && gl) updateBgTexture();
            draw();
            drawFailCount = 0;
            // Only count frames after the real splash texture is bound.
            if (bg && bg.width) {
                markPainted();
            }
        } catch (e) {
            drawFailCount += 1;
            // Engine may have taken the GL context — stop painting splash.
            if (bgPainted || drawFailCount >= 3 || (gl && gl.isContextLost && gl.isContextLost())) {
                running = false;
            }
        }
        if (afterTick) {
            const cb = afterTick;
            afterTick = null;
            cb();
        }
        tick();
    });
}

function waitForPresentedFrame() {
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            afterTick = null;
            resolve();
        };
        // Prefer a real RAF present; never hang boot if RAF dies.
        afterTick = finish;
        requestAnimationFrame(() => {
            try {
                if (gl && running) {
                    draw();
                    if (gl.flush) gl.flush();
                    markPainted();
                }
            } catch (e) {
                // ignore — finish still runs via timeout / afterTick
            }
            finish();
        });
        setTimeout(finish, 64);
    });
}

function showLoginArt() {
    screenMode = 'login';
    globalThis.__tdLoading = false;
    if (!loginImg || !loginImg.width) return;
    bg = loginImg;
    try {
        if (gl) {
            updateBgTexture();
            draw();
            if (gl.flush) gl.flush();
        }
    } catch (e) {
        console.warn('Failed to swap in login art', e);
    }
}

function showLoadingCover() {
    screenMode = 'loading';
    globalThis.__tdLoading = true;
    shownProgress = Math.max(shownProgress, 0.04);
    try {
        if (paintLoading(shownProgress) && gl) {
            updateBgTexture();
            draw();
        }
    } catch (e) {
        console.warn('Failed to show loading cover', e);
    }
}

function waitForTapOnly() {
    return new Promise((resolve) => {
        const check = () => {
            if (globalThis.__tdSplashClicked) resolve();
            else setTimeout(check, 40);
        };
        check();
    });
}

function waitForArtReady() {
    return new Promise((resolve) => {
        const t0 = Date.now();
        const check = () => {
            const elapsed = (Date.now() - t0) / 1000;
            let p = 0.08 + 0.8 * (1 - Math.exp(-elapsed / 2.2));
            if (globalThis.__elexArtReady) p = 1;
            shownProgress = Math.max(shownProgress, Math.min(p, globalThis.__elexArtReady ? 1 : 0.97));
            try {
                if (paintLoading(shownProgress) && gl) updateBgTexture();
            } catch (e) {
                /* first screen may already have lost the context */
            }
            if (globalThis.__elexArtReady) {
                setTimeout(resolve, 160);
                return;
            }
            setTimeout(check, 80);
        };
        check();
    });
}

function end() {
    const ready = (loginImg && loginImg.width)
        ? Promise.resolve()
        : loadImage(loginName).then((img) => {
            loginImg = img;
        }).catch(() => {});
    return ready.then(() => {
        showLoginArt();
        return waitForTapOnly();
    })
        .then(() => {
            showLoadingCover();
            return waitForArtReady();
        })
        .then(() => setProgress(1))
        .then(() => {
            running = false;
            if (rafHandle) {
                cancelAnimationFrame(rafHandle);
                rafHandle = null;
            }
            // Do NOT delete GL objects — Cocos reuses this WebGL context on WeChat.
            afterTick = null;
            bgTexture = null;
            bgVertexBuffer = null;
            programBg = null;
            gl = null;
            bg = null;
        });
}

function setProgress(val) {
    const p = typeof val === 'number' ? val : parseFloat(val);
    if (p > shownProgress) shownProgress = Math.max(0, Math.min(1, p || 0));
    if (screenMode === 'loading' && loadingImg) {
        try {
            if (paintLoading(shownProgress) && gl) updateBgTexture();
        } catch (e) {
            /* keep the plain cover if the bar cannot be drawn */
        }
    }
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            afterTick = null;
            resolve();
        };
        afterTick = finish;
        // Engine import can steal the WebGL context and break our RAF/draw loop.
        // Never block boot on splash frames — resolve on the next macrotask.
        setTimeout(finish, 0);
    });
}

function armEnterTap() {
    if (globalThis.__tdTapArmed) return;
    globalThis.__tdTapArmed = true;
    const mark = () => {
        if (screenMode !== 'login') return;
        globalThis.__tdSplashClicked = true;
        globalThis.__tdSwallowInputUntil = Date.now() + 500;
    };
    if (typeof wx !== 'undefined' && typeof wx.onTouchStart === 'function') {
        wx.onTouchStart(mark);
    }
    const root = typeof window !== 'undefined' ? window : globalThis;
    if (root && root.addEventListener) {
        root.addEventListener('touchstart', mark, true);
        root.addEventListener('mousedown', mark, true);
    }
}

function waitForEnterTap() {
    return new Promise((resolve) => {
        const check = () => {
            // Stay up until the battlefield has drawn a settled frame.
            if (globalThis.__tdSplashClicked && globalThis.__elexArtReady) resolve();
            else setTimeout(check, 40);
        };
        check();
    });
}

function start(alpha, antialias, useWebgl2) {
    globalThis.__tdLoading = false;
    screenMode = 'login';
    loadStartFont();
    armEnterTap();
    options.alpha = alpha === 'true';
    options.antialias = antialias !== 'false';
    bgPainted = false;
    splashPaintedAt = 0;
    drawFailCount = 0;

    if (useWebgl2 === 'true') {
        gl = window.canvas.getContext('webgl2', options);
    }
    if (gl) {
        window.WebGL2RenderingContext = true;
    } else {
        window.WebGL2RenderingContext = false;
        gl = window.canvas.getContext('webgl', options);
    }

    syncViewport();
    initBgVertexBuffer();
    initBgTexture();
    programBg = createProgram(VS_BG, FS_BG);
    running = true;
    tick();

    loadImage(bgName).then((img) => {
        loadingImg = img;
    }).catch(() => {});
    loadImage('load-bar-track.png').then((img) => {
        trackImg = img;
    }).catch(() => {});
    loadImage('load-bar-fill.png').then((img) => {
        fillImg = img;
    }).catch(() => {});

    return loadImage(loginName)
        .then((img) => {
            loginImg = img;
            bg = img;
            screenMode = 'login';
            globalThis.__tdLoading = false;
        })
        .catch((err) => {
            console.warn('Failed to load login art', err);
        })
        .then(() => {
            if (!gl || !bg) {
                console.warn('WebGL gone before splash upload');
                return setProgress(0);
            }
            updateBgTexture();
            try {
                draw();
                if (gl.flush) gl.flush();
                markPainted();
            } catch (e) {
                console.warn('Failed to paint splash immediately', e);
            }
            // Ensure at least one presented frame before boot continues.
            return waitForPresentedFrame().then(() => setProgress(0));
        })
        .catch((err) => {
            console.warn('Failed to load splash art, keep black screen', err);
            return setProgress(0);
        });
}

module.exports = { start, end, setProgress };
