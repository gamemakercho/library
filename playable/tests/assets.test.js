import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpriteMeta, normalizeComicMeta } from '../asset-loader.js';
import { actorPlacement, contactPoint } from '../renderer.js';

const image = { naturalWidth: 1200, naturalHeight: 1000 };
const metadata = {
  reference_frame: 'run_1', reference_height: 400,
  frames: [
    { id: 'run_1', content_rect: [31, 44, 160, 400], anchor_in_content: [80, 400], contact_in_content: [120, 50], duration_ms: 120 },
    { id: 'sit', content_rect: [357, 84, 250, 220], anchor_in_content: [130, 220], contact_in_content: [180, 45], duration_ms: 500 },
  ],
};

test('trimmed sprites use exact crops and seated pose keeps the standing scale', () => {
  const meta = normalizeSpriteMeta(metadata, image);
  const sprite = { image, meta };
  const standing = actorPlacement(sprite, { x: 300, y: 900, facing: 1, action: 'run' }, 310, 0);
  const seated = actorPlacement(sprite, { x: 300, y: 900, facing: 1, action: 'sit' }, 310, 0);
  assert.deepEqual(seated.frame.crop, [357, 84, 250, 220]);
  assert.equal(seated.scale, standing.scale);
  assert.equal(seated.frame.crop[3] * seated.scale, 170.5);
});

test('the measured forehead point follows mirroring without changing its height', () => {
  const sprite = { image, meta: normalizeSpriteMeta(metadata, image) };
  const right = contactPoint(actorPlacement(sprite, { x: 300, y: 900, facing: 1, action: 'run' }, 310, 0));
  const left = contactPoint(actorPlacement(sprite, { x: 300, y: 900, facing: -1, action: 'run' }, 310, 0));
  assert.equal(right.x - 300, 300 - left.x);
  assert.equal(right.y, left.y);
});

test('missing or out-of-bounds metadata fails instead of guessing atlas divisions', () => {
  assert.throws(() => normalizeSpriteMeta({ frames: [] }, image), /비어/);
  assert.throws(() => normalizeSpriteMeta({ frames: [{ id: 'bad', content_rect: [1100, 0, 400, 80] }] }, image), /이미지 밖/);
  assert.throws(() => normalizeComicMeta({ panels: [{ rect: [0, 0, 500, 500] }] }, image), /네 컷/);
});
