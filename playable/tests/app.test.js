// DOM API doubles test the real application wiring. This is not a browser/device test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('application load retry, pointer cancellation, pauses, replay, comic zoom and completion wiring', async () => {
  const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  const noop = () => {};
  let canvasRect = { left: 30, top: 70, width: 384, height: 576 };
  const context = new Proxy({}, { get: (_, key) => key === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop, set: () => true });
  class Element extends EventTarget {
    constructor() { super(); this.style = {}; this.dataset = {}; this.hidden = false; this.disabled = false; this.open = false; this.capture = null; }
    getContext() { return context; }
    getBoundingClientRect() { return { ...canvasRect }; }
    focus() {}
    setAttribute(name, value) { this[name] = value; }
    setPointerCapture(id) { this.capture = id; }
    hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture() { this.capture = null; this.dispatchEvent(new Event('lostpointercapture')); }
    showModal() { this.open = true; }
    close() { this.open = false; }
    scrollTo(x, y) { this.scrollLeft = x; this.scrollTop = y; }
  }
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map((m) => [m[1], new Element()]));
  const doc = new EventTarget();
  doc.baseURI = new URL('../index.html', import.meta.url).href;
  doc.hidden = false;
  doc.getElementById = (id) => { assert.ok(elements.has(id), `Missing HTML element: ${id}`); return elements.get(id); };
  const win = new EventTarget();
  win.devicePixelRatio = 2;
  const preference = new EventTarget();
  preference.matches = false;
  win.matchMedia = () => preference;
  let raf;
  let now = 0;
  let fail = true;
  globalThis.document = doc;
  globalThis.window = win;
  globalThis.requestAnimationFrame = (callback) => { raf = callback; };
  globalThis.fetch = async (url) => {
    if (fail) { fail = false; throw new Error('simulated load failure'); }
    return { ok: true, json: async () => JSON.parse(await fs.readFile(url, 'utf8')) };
  };
  globalThis.Image = class {
    set src(value) {
      this._src = value;
      [this.naturalWidth, this.naturalHeight] = value.includes('staircase') || value.includes('8frames') ? [1024, 1536] : value.includes('comic') ? [1536, 1024] : [1254, 1254];
      queueMicrotask(() => this.onload?.());
    }
    get src() { return this._src; }
  };
  const $ = (id) => elements.get(id);
  const fire = (target, type, properties = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, properties);
    target.dispatchEvent(event);
  };
  const tick = (seconds) => {
    raf(now);
    for (let i = 0; i < Math.ceil(seconds * 60); i++) { now += 1000 / 60; raf(now); }
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  const originalError = console.error;
  console.error = noop;
  try { await import('../app.js'); await settle(); } finally { console.error = originalError; }
  assert.equal($('start-button').disabled, true);
  assert.equal($('retry-load-button').hidden, false);
  fire($('start-button'), 'click');
  assert.equal(win.libraryEndingGame.getState().phase, 'idle');
  fire($('retry-load-button'), 'click');
  await settle();
  assert.equal($('start-button').disabled, false);
  assert.equal($('game-canvas').width, 768);

  const completions = [];
  const callbacks = [];
  doc.addEventListener('library:game-complete', (e) => completions.push(e.detail));
  win.onGameComplete = (result) => callbacks.push(result);
  fire($('start-button'), 'click');
  tick(2);
  const canvas = $('game-canvas');
  fire(canvas, 'pointerdown', { isPrimary: true, pointerId: 7, clientX: 121 });
  fire(canvas, 'pointermove', { pointerId: 7, clientX: 150 });
  const moved = win.libraryEndingGame.getState().catX;
  assert.ok(moved > 180);
  fire(canvas, 'pointercancel', { pointerId: 7 });
  fire(canvas, 'pointermove', { pointerId: 7, clientX: 300 });
  assert.equal(win.libraryEndingGame.getState().catX, moved);
  assert.equal(canvas.capture, null);

  fire(win, 'keydown', { key: 'ArrowRight' });
  tick(0.1);
  assert.ok(win.libraryEndingGame.getState().catX > moved);
  fire(win, 'keyup', { key: 'ArrowRight' });
  fire($('pause-button'), 'click');
  const pausedTime = win.libraryEndingGame.getState().totalTime;
  tick(2);
  assert.equal(win.libraryEndingGame.getState().totalTime, pausedTime);
  fire($('resume-button'), 'click');
  doc.hidden = true;
  fire(doc, 'visibilitychange');
  doc.hidden = false;
  fire(doc, 'visibilitychange');
  assert.equal(win.libraryEndingGame.getState().paused, true);
  fire($('resume-button'), 'click');
  fire(win, 'blur');
  assert.equal(win.libraryEndingGame.getState().paused, true);

  fire($('restart-button'), 'click');
  assert.equal(win.libraryEndingGame.getState().catX, 180);
  tick(20);
  assert.equal(canvas.dataset.phase, 'assist');
  assert.equal(completions.length, 0);
  fire(canvas, 'pointerdown', { isPrimary: true, pointerId: 8, clientX: 221 });
  fire(canvas, 'pointerup', { pointerId: 8 });
  for (let i = 0; i < 60 && canvas.dataset.cutinActive !== 'true'; i++) tick(1 / 60);
  assert.equal(canvas.dataset.cutinActive, 'true');
  assert.equal($('bump-label').hidden, true);
  assert.equal($('pause-overlay').hidden, true);
  const contactTime = win.libraryEndingGame.getState().phaseTime;
  tick(0.03);
  assert.equal(win.libraryEndingGame.getState().phaseTime, contactTime);
  assert.ok(Number(canvas.dataset.cutinElapsed) > 0);
  fire($('pause-button'), 'click');
  const effectTime = canvas.dataset.cutinElapsed;
  tick(2);
  assert.equal(canvas.dataset.cutinElapsed, effectTime);
  fire($('resume-button'), 'click');
  doc.hidden = true;
  fire(doc, 'visibilitychange');
  const hiddenEffectTime = canvas.dataset.cutinElapsed;
  tick(10);
  assert.equal(canvas.dataset.cutinElapsed, hiddenEffectTime);
  doc.hidden = false;
  fire(doc, 'visibilitychange');
  assert.equal(win.libraryEndingGame.getState().paused, true);
  fire($('resume-button'), 'click');
  tick(5);
  assert.deepEqual(completions, [{ gameId: 'library-ending-rescue', completed: true, assisted: true }]);
  assert.deepEqual(callbacks, completions);
  tick(20);
  assert.equal(completions.length, 1);
  assert.equal(canvas.dataset.cutinActive, 'false');
  assert.equal(canvas.dataset.cutinPlayed, 'true');
  assert.equal($('ending-controls').hidden, false);
  fire($('comic-button'), 'click');
  assert.equal($('comic-dialog').open, true);
  fire($('zoom-in-button'), 'click');
  assert.equal($('comic-image').style.width, '150%');
  fire($('zoom-reset-button'), 'click');
  assert.equal($('comic-image').style.width, '100%');
  fire($('close-comic-button'), 'click');
  fire($('replay-button'), 'click');
  assert.equal(canvas.dataset.cutinPlayed, 'false');
  assert.equal(canvas.dataset.cutinElapsed, '0');
  tick(2);
  fire(canvas, 'pointerdown', { isPrimary: true, pointerId: 9, clientX: 221 });
  fire(canvas, 'pointerup', { pointerId: 9 });
  tick(20);
  assert.equal(completions.length, 2);
  assert.equal(completions[1].assisted, false);
  win.libraryEndingGame.reset();
  assert.equal($('intro').hidden, false);
  assert.equal(canvas.dataset.phase, 'idle');
  assert.equal($('restart-button').disabled, true);
  assert.equal(canvas.dataset.cutinPlayed, 'false');

  canvasRect = { left: 5, top: 44, width: 260, height: 390 };
  win.devicePixelRatio = 4;
  fire(win, 'resize');
  assert.equal(canvas.width, 780);
  assert.equal(canvas.height, 1170);
  assert.equal(canvas.width / canvas.height, 2 / 3);
  canvasRect = { left: 30, top: 70, width: 384, height: 576 };
  win.devicePixelRatio = 2;
  fire(win, 'orientationchange');
  assert.equal(canvas.width, 768);
  assert.equal(canvas.height, 1152);

  preference.matches = true;
  fire(preference, 'change');
  fire($('start-button'), 'click');
  tick(2);
  fire(canvas, 'pointerdown', { isPrimary: true, pointerId: 10, clientX: 221 });
  fire(canvas, 'pointerup', { pointerId: 10 });
  for (let i = 0; i < 900 && canvas.dataset.cutinActive !== 'true'; i++) tick(1 / 60);
  assert.equal(canvas.dataset.cutinActive, 'true');
  const reducedContactTime = win.libraryEndingGame.getState().phaseTime;
  tick(0.03);
  assert.ok(win.libraryEndingGame.getState().phaseTime > reducedContactTime);
  tick(0.3);
  assert.equal(canvas.dataset.cutinActive, 'false');
  assert.ok(Number(canvas.dataset.cutinElapsed) <= 0.28);
});
