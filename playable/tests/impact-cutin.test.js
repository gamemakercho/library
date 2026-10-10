import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ImpactCutin, advanceImpactTimeline } from '../impact-cutin.js';
import { RescueEngine } from '../engine.js';
import { normalizeCutinMeta } from '../asset-loader.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../assets/forehead-bump-cutin.json', import.meta.url)));
const meta = normalizeCutinMeta(raw, { naturalWidth: 1254, naturalHeight: 1254 });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('cutin respects contact pivot, all width stages, aspect ratio and one-shot lifetime', () => {
  const fx = new ImpactCutin(meta);
  const origin = { x: 292, y: 940 };
  assert.equal(fx.trigger(origin), true);
  let sample = fx.sample(768, 1152);
  close(sample.width, 768 * 0.38);
  close(sample.left + sample.width * 0.46, origin.x);
  close(sample.top + sample.height * 0.52, origin.y);
  assert.equal(fx.trigger({ x: 1, y: 2 }), false);
  fx.advance(0.17);
  sample = fx.sample(768, 1152);
  close(sample.width, 768 * 1.28);
  close(sample.x, 768 * 0.5);
  close(sample.y, 1152 * 0.61);
  close(sample.height / sample.width, meta.content_rect[3] / meta.content_rect[2]);
  fx.advance(0.13);
  close(fx.sample(768, 1152).width, 768 * 1.05);
  fx.advance(0.259);
  sample = fx.sample(768, 1152);
  assert.ok(sample.width > 768 * 1.44);
  assert.ok(sample.alpha < 0.01);
  assert.ok(sample.dim <= 0.12);
  fx.advance(0.001);
  assert.equal(fx.sample(768, 1152), null);
  assert.equal(fx.trigger(origin), false);
  fx.reset();
  assert.equal(fx.elapsed, 0);
  assert.equal(fx.origin, null);
  assert.equal(fx.trigger(origin), true);
});

test('70ms stops the engine without pause UI while cutin continues; user pause freezes both', () => {
  const engine = new RescueEngine();
  const fx = new ImpactCutin(meta);
  engine.start();
  fx.trigger({ x: 300, y: 940 });
  advanceImpactTimeline(engine, fx, 0.04);
  assert.equal(engine.snapshot().totalTime, 0);
  close(fx.elapsed, 0.04);
  assert.equal(engine.snapshot().paused, false);
  assert.ok(fx.sample(768, 1152).width > 768 * 0.38);
  advanceImpactTimeline(engine, fx, 0.05);
  close(engine.snapshot().totalTime, 0.02);
  close(fx.elapsed, 0.09);
  engine.pause('hidden');
  advanceImpactTimeline(engine, fx, 500);
  close(engine.snapshot().totalTime, 0.02);
  close(fx.elapsed, 0.09);
  engine.resume();
  advanceImpactTimeline(engine, fx, 0.01);
  close(engine.snapshot().totalTime, 0.03);
  close(fx.elapsed, 0.10);
});

test('collision substep starts one cutin even when a large frame crosses into contact', () => {
  let pending = false;
  let triggers = 0;
  const fx = new ImpactCutin(meta);
  const engine = new RescueEngine({ onEvent: (e) => { if (e.type === 'forehead-bump') pending = true; } });
  engine.start(); engine.moveCat(382);
  while (engine.snapshot().phase !== 'jump') engine.advance(1 / 120);
  engine.advance(engine.config.jumpSeconds - 0.025);
  advanceImpactTimeline(engine, fx, 0.05, () => {
    if (pending) { fx.trigger({ x: 300, y: 940 }); pending = false; triggers++; }
  });
  assert.equal(engine.snapshot().phase, 'contact');
  assert.equal(engine.snapshot().phaseTime, 0);
  assert.ok(fx.elapsed > 0);
  advanceImpactTimeline(engine, fx, 4);
  assert.equal(triggers, 1);
  assert.equal(fx.active, false);
  assert.equal(engine.snapshot().phase, 'complete');
});

test('30, 60 and 144 Hz withhold exactly 70ms; reduced motion fades for 280ms with no stop', () => {
  for (const hz of [30, 60, 144]) {
    const engine = new RescueEngine(); engine.start();
    const fx = new ImpactCutin(meta); fx.trigger({ x: 300, y: 940 });
    for (let i = 0; i < hz; i++) advanceImpactTimeline(engine, fx, 1 / hz);
    close(engine.snapshot().totalTime, 0.93);
    assert.equal(fx.active, false);
  }
  const engine = new RescueEngine(); engine.start();
  const fx = new ImpactCutin(meta, { reducedMotion: true }); fx.trigger({ x: 300, y: 940 });
  advanceImpactTimeline(engine, fx, 0.1);
  close(engine.snapshot().totalTime, 0.1);
  close(fx.sample(768, 1152).width, 768 * 0.78);
  advanceImpactTimeline(engine, fx, 0.18);
  assert.equal(fx.sample(768, 1152), null);
});

test('invalid cutin timing and crop fail during asset readiness instead of during gameplay', () => {
  assert.throws(() => normalizeCutinMeta({ ...raw, timing_ms: { ...raw.timing_ms, total: 999 } }, { naturalWidth: 1254, naturalHeight: 1254 }));
  assert.throws(() => normalizeCutinMeta(raw, { naturalWidth: 100, naturalHeight: 100 }));
  assert.throws(() => normalizeCutinMeta({ ...raw, dim_max_alpha: 0.7 }, { naturalWidth: 1254, naturalHeight: 1254 }));
});
