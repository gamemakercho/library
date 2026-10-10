/** Static raster/coordinate audit. This is not a browser or touch-device test. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { RescueEngine } from '../engine.js';
import { normalizeSpriteMeta, normalizeComicMeta } from '../asset-loader.js';
import { renderScene, actorPlacement } from '../renderer.js';

const require = createRequire(import.meta.url);
const modules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const { createCanvas, loadImage } = require(modules ? path.join(modules, '@napi-rs/canvas') : '@napi-rs/canvas');
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = process.argv[2] || fileURLToPath(new URL('../../../../ending-rescue-qa/', import.meta.url));
await fs.mkdir(out, { recursive: true });

async function image(name) {
  const img = await loadImage(path.join(root, 'assets', name));
  Object.defineProperties(img, { naturalWidth: { value: img.width }, naturalHeight: { value: img.height } });
  return img;
}
async function json(name) { return JSON.parse(await fs.readFile(path.join(root, 'assets', name), 'utf8')); }
const [background, librarianImage, catImage, comicImage, librarianMeta, catMeta, comicMeta] = await Promise.all([
  image('staircase-background.png'), image('librarian-actions.png'), image('cat-actions.png'), image('ending-comic.png'),
  json('librarian-actions.json'), json('cat-actions.json'), json('ending-comic.json'),
]);
const assets = {
  background,
  librarian: { image: librarianImage, meta: normalizeSpriteMeta(librarianMeta, librarianImage) },
  cat: { image: catImage, meta: normalizeSpriteMeta(catMeta, catImage) },
  comic: { image: comicImage, meta: normalizeComicMeta(comicMeta, comicImage) },
};
const audit = { type: 'static-canvas-audit', browserChecked: false, files: [], assertions: [] };
function until(engine, phase) {
  for (let i = 0; i < 6000; i++) { if (engine.snapshot().phase === phase) return; engine.advance(1 / 120); }
  throw new Error(`Never reached ${phase}`);
}
async function render(name, engine) {
  const canvas = createCanvas(engine.config.worldWidth, engine.config.worldHeight);
  const state = engine.snapshot();
  const placements = renderScene(canvas.getContext('2d'), assets, state, engine.config);
  await fs.writeFile(path.join(out, `${name}.png`), canvas.toBuffer('image/png'));
  audit.files.push({ name: `${name}.png`, phase: state.phase, phaseTime: state.phaseTime, human: state.human, cat: state.cat });
  return placements;
}

const engine = new RescueEngine();
await render('01-ready', engine);
engine.start(); until(engine, 'tracking'); engine.advance(4.25);
await render('02-tracking', engine);
until(engine, 'slip'); engine.moveCat(engine.snapshot().landingX); engine.advance(0.4);
await render('03-slip', engine);
until(engine, 'jump'); engine.advance(0.4);
await render('04-rescue-jump', engine);
until(engine, 'contact'); engine.advance(0.26);
const contact = await render('05-forehead-contact', engine);
const distance = Math.hypot(contact.humanHead.x - contact.catHead.x, contact.humanHead.y - contact.catHead.y);
assert.ok(distance < 1e-7, `Foreheads do not meet: ${distance}`);
audit.assertions.push({ name: 'measured-forehead-contact', distancePixels: distance });
until(engine, 'recovery'); engine.advance(0.7);
const recovery = await render('06-recovery', engine);
assert.equal(engine.snapshot().showComic, false);
assert.equal(recovery.human.frame.id, 'sit');
assert.equal(recovery.cat.frame.id, 'flee');
const standing = actorPlacement(assets.librarian, { action: 'run', x: 0, y: 0, facing: 1 }, engine.config.librarianRenderHeight, 0);
assert.equal(standing.scale, recovery.human.scale);
audit.assertions.push({ name: 'recovery-shows-native-sit-and-flee', humanFrame: recovery.human.frame.id, catFrame: recovery.cat.frame.id, fixedHumanScale: recovery.human.scale });
until(engine, 'complete'); await render('07-final-panel', engine);
const assisted = new RescueEngine(); assisted.start(); assisted.advance(20);
assert.equal(assisted.snapshot().phase, 'assist'); await render('08-safe-assist', assisted);
audit.assertions.push({ name: 'untouched-run-stops-for-assistance', phase: assisted.snapshot().phase, catStartX: assisted.config.catStartX, landingX: assisted.snapshot().landingX });
await fs.writeFile(path.join(out, 'render-audit.json'), JSON.stringify(audit, null, 2));
console.log(JSON.stringify({ outputDirectory: out, renderCount: audit.files.length, assertions: audit.assertions }, null, 2));
