import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeSpriteMeta, frameForAction } from '../asset-loader.js';
import { actorPlacement, contactPoint, drawActor, renderScene } from '../renderer.js';
import { RescueEngine } from '../engine.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../assets/librarian-run-8frames.json', import.meta.url)));
const image = { naturalWidth: 1024, naturalHeight: 1536 };
const sprite = { image, meta: normalizeSpriteMeta(raw, image) };

test('normalized run atlas cycles all eight exact crops in 580ms with fixed reference scale', () => {
  assert.deepEqual(sprite.meta.frames.map((f) => f.duration), [0.075, 0.065, 0.07, 0.08, 0.075, 0.065, 0.07, 0.08]);
  let elapsed = 0;
  for (const [i, frame] of sprite.meta.frames.entries()) {
    const placement = actorPlacement(sprite, { x: 500, y: 333, action: 'run', facing: 1 }, 250, elapsed + 0.001);
    assert.equal(placement.frame.id, raw.actions.run[i]);
    assert.deepEqual(placement.frame.crop, raw.frames[i].content_rect);
    assert.deepEqual(placement.frame.clip_polygon_in_content, raw.frames[i].clip_polygon_in_content);
    assert.equal(placement.scale, 250 / 411);
    assert.equal(placement.x, 500);
    assert.equal(placement.y, 333);
    elapsed += frame.duration;
  }
  assert.ok(Math.abs(elapsed - 0.58) < 1e-8);
  assert.equal(frameForAction(sprite.meta, 'run', elapsed + 0.001).id, 'run_01');
});

test('every polygon is drawn in anchor coordinates before the matching atlas image, also when mirrored', () => {
  for (const [i, frame] of sprite.meta.frames.entries()) {
    for (const facing of [-1, 1]) {
      const calls = [];
      const ctx = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, ...args]) });
      const placement = { x: 200, y: 300, rotation: 0, scale: 250 / 411, flip: facing, frame };
      drawActor(ctx, sprite, placement);
      assert.ok(calls.findIndex((c) => c[0] === 'clip') < calls.findIndex((c) => c[0] === 'drawImage'));
      assert.deepEqual(calls.find((c) => c[0] === 'moveTo').slice(1), [frame.clip_polygon_in_content[0][0] - frame.anchor[0], frame.clip_polygon_in_content[0][1] - frame.anchor[1]]);
      const draw = calls.find((c) => c[0] === 'drawImage');
      assert.equal(draw[1], sprite.image);
      assert.deepEqual(draw.slice(2, 6), raw.frames[i].content_rect);
      const right = contactPoint({ ...placement, flip: 1 });
      const left = contactPoint({ ...placement, flip: -1 });
      assert.ok(Math.abs((right.x - placement.x) - (placement.x - left.x)) < 1e-8);
      assert.equal(right.y, left.y);
    }
  }
});

test('only tracking uses the new sheet; idle, slip, contact and sitting retain native action art', () => {
  const oldImage = { naturalWidth: 1254, naturalHeight: 1254 };
  const oldMeta = JSON.parse(fs.readFileSync(new URL('../../assets/librarian-actions.json', import.meta.url)));
  const catMeta = JSON.parse(fs.readFileSync(new URL('../../assets/cat-actions.json', import.meta.url)));
  const old = { image: oldImage, meta: normalizeSpriteMeta(oldMeta, oldImage) };
  const cat = { image: oldImage, meta: normalizeSpriteMeta(catMeta, oldImage) };
  const assets = { background: {}, librarian: old, librarianRun: sprite, cat };
  const ctx = new Proxy({}, { get: (_, key) => key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  const engine = new RescueEngine();
  const cases = [['idle', 'run', 'run_1', 250 / 662], ['tracking', 'run', 'run_01', 250 / 411], ['slip', 'slip', 'slip', 250 / 662], ['contact', 'catch', 'slip', 250 / 662], ['recovery', 'sit', 'sit', 250 / 662]];
  for (const [phase, action, id, scale] of cases) {
    const state = { ...engine.snapshot(), phase, human: { ...engine.snapshot().human, action }, jumpStartX: 382 };
    const placement = renderScene(ctx, assets, state, engine.config).human;
    assert.equal(placement.frame.id, id);
    assert.equal(placement.scale, scale);
    assert.equal(placement.y, state.human.y);
  }
});

test('facing remains stable around each slow turnaround and the last step stays left-facing', () => {
  const engine = new RescueEngine(); engine.start();
  const directions = [];
  while (engine.snapshot().phase !== 'slip') {
    engine.advance(1 / 144);
    const state = engine.snapshot();
    if (state.phase === 'tracking' && directions.at(-1) !== state.human.facing) directions.push(state.human.facing);
  }
  assert.deepEqual(directions, [-1, 1, -1, 1, -1]);
  assert.equal(engine.snapshot().human.facing, -1);
});
