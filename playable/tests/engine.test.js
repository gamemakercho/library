import test from 'node:test';
import assert from 'node:assert/strict';
import { RescueEngine } from '../engine.js';

function until(engine, phase, maxSeconds = 40) {
  for (let t = 0; t < maxSeconds; t += 1 / 60) {
    if (engine.snapshot().phase === phase) return engine.snapshot();
    engine.advance(1 / 60);
  }
  throw new Error(`Did not reach ${phase}: ${engine.snapshot().phase}`);
}

test('one aligned rescue swaps souls once and completes once', () => {
  const events = [];
  const results = [];
  const engine = new RescueEngine({ onEvent: (e) => events.push(e), onComplete: (r) => results.push(r) });
  assert.equal(engine.start(), true);
  assert.equal(engine.start(), false);
  const slip = until(engine, 'slip');
  engine.moveCat(slip.landingX);
  until(engine, 'complete');
  engine.advance(300);
  assert.equal(events.filter((e) => e.type === 'rescue').length, 1);
  assert.equal(events.filter((e) => e.type === 'forehead-bump').length, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].assisted, false);
});

test('misalignment freezes safely, then dragging into range continues without a failure state', () => {
  const results = [];
  const engine = new RescueEngine({ onComplete: (r) => results.push(r) });
  engine.start();
  engine.moveCat(engine.config.catMaxX);
  const assist = until(engine, 'assist');
  engine.advance(60);
  assert.equal(engine.snapshot().phase, 'assist');
  assert.equal(engine.snapshot().human.y, assist.human.y);
  assert.equal(results.length, 0);
  engine.moveCat(assist.landingX + engine.config.rescueRadius - 1);
  assert.equal(engine.snapshot().phase, 'jump');
  until(engine, 'complete');
  assert.equal(results.length, 1);
  assert.equal(results[0].assisted, true);
});

test('pause preserves scene and input; resume and replay reset all transient flags', () => {
  const engine = new RescueEngine();
  engine.start();
  until(engine, 'tracking');
  engine.advance(1);
  engine.pause('hidden');
  const before = engine.snapshot();
  engine.advance(20);
  assert.equal(engine.moveCat(100), false);
  assert.equal(engine.snapshot().totalTime, before.totalTime);
  assert.deepEqual(engine.snapshot().human, before.human);
  engine.resume();
  engine.advance(0.1);
  assert.ok(engine.snapshot().totalTime > before.totalTime);
  engine.reset();
  const reset = engine.snapshot();
  assert.equal(reset.phase, 'idle');
  assert.equal(reset.paused, false);
  assert.equal(reset.rescueStarted, false);
  assert.equal(reset.completionEmitted, false);
  assert.equal(reset.totalTime, 0);
});

test('large time steps cannot skip the assist stop, completion emits once again only after replay', () => {
  let completions = 0;
  const engine = new RescueEngine({ onComplete: () => completions++ });
  engine.start();
  engine.moveCat(engine.config.catMaxX);
  engine.advance(50);
  assert.equal(engine.snapshot().phase, 'assist');
  engine.moveCat(engine.snapshot().landingX);
  engine.advance(10);
  assert.equal(engine.snapshot().phase, 'complete');
  assert.equal(completions, 1);
  engine.reset();
  engine.start();
  until(engine, 'slip');
  engine.moveCat(engine.snapshot().landingX);
  engine.advance(10);
  assert.equal(completions, 2);
});

test('cat bounds and early alignment do not trigger repeated or premature contact', () => {
  const engine = new RescueEngine();
  engine.start();
  engine.moveCat(-999);
  assert.equal(engine.snapshot().catX, engine.config.catMinX);
  engine.moveCat(9999);
  assert.equal(engine.snapshot().catX, engine.config.catMaxX);
  until(engine, 'slip');
  engine.moveCat(engine.snapshot().landingX);
  assert.equal(engine.snapshot().phase, 'slip');
  engine.advance(engine.config.slipSeconds * 0.2);
  assert.equal(engine.snapshot().phase, 'slip');
});

test('recovery shows the seated human and fleeing cat before the final comic', () => {
  const engine = new RescueEngine();
  engine.start();
  until(engine, 'slip');
  engine.moveCat(engine.snapshot().landingX);
  const recovery = until(engine, 'recovery');
  assert.equal(recovery.showComic, false);
  assert.equal(recovery.human.action, 'sit');
  assert.equal(recovery.cat.action, 'flee');
  engine.advance(1);
  assert.ok(engine.snapshot().cat.x > recovery.cat.x);
  assert.equal(engine.snapshot().showComic, false);
  until(engine, 'complete');
  assert.equal(engine.snapshot().showComic, true);
});

test('an untouched cat waits indefinitely for help and only player alignment resumes rescue', () => {
  const engine = new RescueEngine();
  engine.start();
  engine.advance(120);
  const waiting = engine.snapshot();
  assert.equal(waiting.phase, 'assist');
  assert.equal(waiting.catX, 180);
  assert.equal(waiting.landingX, 382);
  assert.equal(waiting.completed, false);
  assert.equal(waiting.rescueStarted, false);
  engine.advance(120);
  assert.deepEqual(engine.snapshot().human, waiting.human);
  engine.moveCat(waiting.landingX);
  assert.equal(engine.snapshot().phase, 'jump');
  engine.advance(5);
  assert.equal(engine.snapshot().completed, true);
});

test('automatic ending lasts about 17 seconds at 30, 60 and 144 Hz', () => {
  const times = [];
  for (const hz of [30, 60, 144]) {
    const engine = new RescueEngine();
    engine.start();
    engine.moveCat(382);
    for (let i = 0; i < hz * 20 && !engine.snapshot().completed; i++) engine.advance(1 / hz);
    const state = engine.snapshot();
    assert.equal(state.completed, true);
    assert.equal(state.assisted, false);
    assert.ok(state.totalTime > 16.8 && state.totalTime < 17.1, `${hz} Hz: ${state.totalTime}`);
    times.push(state.totalTime);
  }
  assert.ok(Math.max(...times) - Math.min(...times) < 0.08);
});

test('slip to jump preserves the current human position for both assisted and aligned runs', () => {
  for (const assisted of [false, true]) {
    const engine = new RescueEngine();
    engine.start();
    until(engine, assisted ? 'assist' : 'slip');
    if (!assisted) engine.advance(engine.config.slipSeconds * engine.config.rescueEarliestProgress - engine.snapshot().phaseTime - 0.001);
    const before = engine.snapshot().human;
    engine.moveCat(engine.snapshot().landingX);
    if (!assisted) engine.advance(1 / 120);
    const after = engine.snapshot();
    assert.equal(after.phase, 'jump');
    assert.ok(Math.hypot(after.human.x - before.x, after.human.y - before.y) < 4);
    assert.deepEqual(after.rescueHumanStart, { x: after.human.x, y: after.human.y });
  }
});
