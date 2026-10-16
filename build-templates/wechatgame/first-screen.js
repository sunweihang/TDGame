/**
 * Custom WeChat first screen: elex splash only.
 * Removes Cocos logo / slogan / progress bar.
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

/** Minimum time the elex frame stays on screen after a successful paint (ms). */
const MIN_SPLASH_MS = 600;

let gl = null;
let bg = null;
let programBg = null;
let rafHandle = null;
let bgTexture = null;
let bgVertexBuffer = null;
let afterTick = null;
let backgroundFlip = 1.0;
let bgName = 'splash_screen.png';
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

function loadBackground(bgPath) {
    return new Promise((resolve, reject) => {
        bg = createSplashImage();
        bg.premultiplyAlpha = false;
        bg.onload = function () {
            resolve(bg);
        };
        bg.onerror = function (err) {
            reject(err || new Error('splash image error'));
        };
        bg.src = bgPath.replace('#', '%23');
    });
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

function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

function end() {
    const waitMin = bgPainted
        ? Math.max(0, MIN_SPLASH_MS - (Date.now() - splashPaintedAt))
        : 0;
    return waitMs(waitMin)
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

function setProgress(_val) {
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

function start(alpha, antialias, useWebgl2) {
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

    return loadBackground(bgName)
        .then(() => {
            if (!gl) {
                console.warn('WebGL gone before elex splash upload');
                return setProgress(0);
            }
            updateBgTexture();
            try {
                draw();
                if (gl.flush) gl.flush();
                markPainted();
            } catch (e) {
                console.warn('Failed to paint elex splash immediately', e);
            }
            // Ensure at least one presented frame before boot continues.
            return waitForPresentedFrame().then(() => setProgress(0));
        })
        .catch((err) => {
            console.warn('Failed to load splash_screen.png, keep black screen', err);
            return setProgress(0);
        });
}

module.exports = { start, end, setProgress };
