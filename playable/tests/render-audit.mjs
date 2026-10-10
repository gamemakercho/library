/** Static raster/coordinate audit. This is not a browser or touch-device test. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { RescueEngine } from '../engine.js';
import { normalizeSpriteMeta, normalizeComicMeta, normalizeCutinMeta } from '../asset-loader.js';
import { renderScene, actorPlacement, drawActor } from '../renderer.js';
import { ImpactCutin, drawImpactCutin } from '../impact-cutin.js';

const require = createRequire(import.meta.url);
const modules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const { createCanvas, loadImage, GlobalFonts } = require(modules ? path.join(modules, '@napi-rs/canvas') : '@napi-rs/canvas');
// Native Windows raster QA needs the same Korean glyph coverage as the browser.
if (process.platform === 'win32') GlobalFonts.registerFromPath('C:/Windows/Fonts/malgunbd.ttf', 'system-ui');
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
const runImage = await image('librarian-run-8frames.png');
assets.librarianRun = { image: runImage, meta: normalizeSpriteMeta(await json('librarian-run-8frames.json'), runImage) };
const cutinImage = await image('forehead-bump-cutin.png');
assets.cutin = { image: cutinImage, meta: normalizeCutinMeta(await json('forehead-bump-cutin.json'), cutinImage) };
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
for (const time of [0.04, 0.17, 0.3, 0.45, 0.56]) {
  const canvas = createCanvas(engine.config.worldWidth, engine.config.worldHeight);
  const ctx = canvas.getContext('2d');
  renderScene(ctx, assets, engine.snapshot(), engine.config);
  const fx = new ImpactCutin(assets.cutin.meta);
  fx.trigger(contact.humanHead);
  fx.advance(time);
  drawImpactCutin(ctx, assets.cutin.image, fx, engine.config.worldWidth, engine.config.worldHeight);
  const name = `cutin-${Math.round(time * 1000)}ms.png`;
  await fs.writeFile(path.join(out, name), canvas.toBuffer('image/png'));
  audit.files.push({ name, phase: 'contact', cutinTime: time, cutinActive: fx.active });
}
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

const montage = createCanvas(1024, 1240);
const montageCtx = montage.getContext('2d');
montageCtx.fillStyle = '#fff8ed'; montageCtx.fillRect(0, 0, 1024, 1240);
let elapsed = 0;
let clippedOpaquePixels = 0;
for (const [i, frame] of assets.librarianRun.meta.frames.entries()) {
  // Compare real raster pixels with/without the polygon; it removes neighboring poses.
  const [sx, sy, sw, sh] = frame.crop;
  const plain = createCanvas(sw, sh); const masked = createCanvas(sw, sh);
  plain.getContext('2d').drawImage(runImage, sx, sy, sw, sh, 0, 0, sw, sh);
  drawActor(masked.getContext('2d'), assets.librarianRun, { frame, x: frame.anchor[0], y: frame.anchor[1], scale: 1, flip: 1 });
  const a = plain.getContext('2d').getImageData(0, 0, sw, sh).data;
  const b = masked.getContext('2d').getImageData(0, 0, sw, sh).data;
  for (let p = 3; p < a.length; p += 4) if (a[p] > 200 && b[p] === 0) clippedOpaquePixels++;
  for (const [j, facing] of [1, -1].entries()) {
    const x = (i % 4) * 256 + 128;
    const y = (Math.floor(i / 4) * 2 + j) * 310 + 286;
    montageCtx.strokeStyle = '#dbc7ad'; montageCtx.lineWidth = 1;
    montageCtx.beginPath(); montageCtx.moveTo(x - 110, y); montageCtx.lineTo(x + 110, y); montageCtx.stroke();
    const placement = actorPlacement(assets.librarianRun, { x, y, action: 'run', facing }, 250, elapsed + 0.001);
    assert.equal(placement.frame.id, frame.id);
    assert.equal(placement.scale, 250 / 411);
    drawActor(montageCtx, assets.librarianRun, placement);
    montageCtx.fillStyle = '#694a42'; montageCtx.font = '16px sans-serif'; montageCtx.textAlign = 'center';
    montageCtx.fillText(`${frame.id} ${facing > 0 ? 'right' : 'left'}`, x, y + 20);
  }
  elapsed += frame.duration;
}
assert.ok(clippedOpaquePixels > 0, 'Polygon did not exclude any neighboring artwork');
audit.assertions.push({ name: 'all-eight-run-poses-both-directions-fixed-foot-anchor', scale: 250 / 411, cycleSeconds: elapsed, neighboringOpaquePixelsRemoved: clippedOpaquePixels });
await fs.writeFile(path.join(out, 'run-8frames-both-directions.png'), montage.toBuffer('image/png'));
audit.files.push({ name: 'run-8frames-both-directions.png', phase: 'atlas-audit', poseCount: 16 });
await fs.writeFile(path.join(out, 'render-audit.json'), JSON.stringify(audit, null, 2));
console.log(JSON.stringify({ outputDirectory: out, renderCount: audit.files.length, assertions: audit.assertions }, null, 2));
