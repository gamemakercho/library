import { RescueEngine } from './engine.js';
import { assetImageSource, loadAssets } from './asset-loader.js';
import { renderScene } from './renderer.js';
import { INTEGRATION } from './scene-config.js';
import { ImpactCutin, drawImpactCutin, advanceImpactTimeline } from './impact-cutin.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const ctx = canvas.getContext('2d', { alpha: false });
let assets = null;
let loadingController = null;
let loadGeneration = 0;
let lastRaf = null;
let activePointer = null;
let dragOffset = 0;
let currentInstruction = '';
let endingControlsShown = false;
let comicZoom = 1;
let impact = null;
let impactPending = false;
const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const heldKeys = new Set();

const engine = new RescueEngine({
  onComplete(result) {
    $('ending-controls').hidden = false;
    $('keyboard-note').hidden = true;
    $('pause-button').disabled = true;
    endingControlsShown = true;
    document.dispatchEvent(new CustomEvent('library:game-complete', { detail: result }));
    if (typeof window.onGameComplete === 'function') {
      try { window.onGameComplete(result); } catch (error) { console.error('완료 콜백 오류:', error); }
    }
  },
  onEvent(event) {
    if (event.type === 'forehead-bump') impactPending = true;
    if (event.type === 'assist') heldKeys.clear();
  },
});

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
  const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(canvas.width / engine.config.worldWidth, 0, 0, canvas.height / engine.config.worldHeight, 0, 0);
  // DPR affects only rendering. Input always maps to the same 768 × 1152 world.
  if (assets) render();
}

function render() {
  if (!assets) return;
  const state = engine.snapshot();
  canvas.dataset.phase = state.phase;
  canvas.dataset.paused = String(state.paused);
  canvas.dataset.assisted = String(state.assisted);
  ctx.setTransform(canvas.width / engine.config.worldWidth, 0, 0, canvas.height / engine.config.worldHeight, 0, 0);
  const placements = renderScene(ctx, assets, state, engine.config);
  if (impactPending && placements && state.phase === 'contact') {
    impact?.trigger(placements.humanHead);
    impactPending = false;
  }
  if (impact) drawImpactCutin(ctx, assets.cutin.image, impact, engine.config.worldWidth, engine.config.worldHeight);
  canvas.dataset.cutinActive = String(impact?.active || false);
  canvas.dataset.cutinElapsed = String(impact?.elapsed || 0);
  canvas.dataset.cutinPlayed = String(impact?.played || false);
  canvas.dataset.humanFrame = placements?.human.frame.id || '';
  if (state.instruction !== currentInstruction && state.phase !== 'idle') {
    currentInstruction = state.instruction;
    $('instruction').textContent = currentInstruction;
  }
  // The cutin draws the only impact label, inside the clipped gameplay canvas.
  $('bump-label').hidden = true;
  const speaking = ['tracking', 'slip', 'assist', 'jump', 'recovery'].includes(state.phase) && !state.paused;
  $('speech-bubble').hidden = !speaking;
  if (speaking && placements) {
    const point = ['tracking', 'recovery'].includes(state.phase) ? placements.humanHead : placements.catHead;
    $('speech-bubble').textContent = state.phase === 'tracking' ? '냐아!' : state.phase === 'recovery' ? '앗.. 돌아왔다!' : '안 돼!';
    $('speech-bubble').style.left = `${Math.min(87, Math.max(13, point.x / engine.config.worldWidth * 100))}%`;
    $('speech-bubble').style.top = `${Math.max(5, point.y / engine.config.worldHeight * 100 - 3)}%`;
  }
  $('cat-speech-bubble').hidden = state.phase !== 'recovery' || state.paused;
  if (state.phase === 'recovery' && placements) {
    const point = placements.catHead;
    $('cat-speech-bubble').textContent = '야옹~';
    $('cat-speech-bubble').style.left = `${Math.min(89, Math.max(11, point.x / engine.config.worldWidth * 100))}%`;
    $('cat-speech-bubble').style.top = `${Math.max(5, point.y / engine.config.worldHeight * 100 - 3)}%`;
  }
  $('pause-overlay').hidden = !state.paused;
  $('pause-button').textContent = state.paused ? '▶' : 'Ⅱ';
  $('pause-button').setAttribute('aria-label', state.paused ? '게임 이어서 하기' : '게임 잠깐 멈추기');
}

async function prepareAssets() {
  const generation = ++loadGeneration;
  loadingController?.abort();
  loadingController = new AbortController();
  $('start-button').disabled = true;
  $('retry-load-button').hidden = true;
  $('load-status').textContent = '그림을 준비하고 있어요…';
  try {
    const ready = await loadAssets(loadingController.signal);
    if (generation !== loadGeneration) return;
    assets = ready;
    impact = new ImpactCutin(ready.cutin.meta, { reducedMotion: Boolean(motionPreference?.matches) });
    $('comic-image').src = assetImageSource('ending-comic.png');
    $('load-status').textContent = '준비됐어요!';
    $('start-button').disabled = false;
    resizeCanvas();
  } catch (error) {
    if (generation !== loadGeneration || error.name === 'AbortError') return;
    $('load-status').textContent = `${error.message} 파일과 실행 경로를 확인해 주세요.`;
    $('retry-load-button').hidden = false;
    console.error(error);
  }
}

function startRun() {
  if (!assets || engine.snapshot().phase !== 'idle') return;
  resetImpact();
  activePointer = null;
  heldKeys.clear();
  currentInstruction = '';
  $('intro').hidden = true;
  $('ending-controls').hidden = true;
  $('pause-overlay').hidden = true;
  $('bump-label').hidden = true;
  $('keyboard-note').hidden = false;
  $('pause-button').disabled = false;
  $('restart-button').disabled = false;
  endingControlsShown = false;
  lastRaf = null;
  engine.start();
  canvas.focus({ preventScroll: true });
  render();
}

function togglePause(reason = 'manual') {
  clearInput();
  if (engine.snapshot().paused) engine.resume();
  else engine.pause(reason);
  $('pause-message').textContent = reason === 'hidden' ? '화면을 떠난 동안 안전하게 멈춰 뒀어요.' : '준비되면 이어서 도와주세요.';
  lastRaf = null;
  render();
}

function pointerWorldX(event) {
  const rect = canvas.getBoundingClientRect();
  return (event.clientX - rect.left) * engine.config.worldWidth / rect.width;
}

canvas.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || activePointer !== null || !engine.snapshot().inputEnabled) return;
  event.preventDefault();
  const x = pointerWorldX(event);
  const state = engine.snapshot();
  dragOffset = Math.abs(x - state.catX) < 95 ? x - state.catX : 0;
  activePointer = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  engine.moveCat(x - dragOffset);
  render();
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== activePointer) return;
  event.preventDefault();
  engine.moveCat(pointerWorldX(event) - dragOffset);
  render();
});
const releasePointer = (event) => {
  if (event.pointerId !== activePointer) return;
  activePointer = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
};
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('lostpointercapture', () => { activePointer = null; });

window.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || !engine.snapshot().inputEnabled || $('comic-dialog').open) return;
  event.preventDefault();
  heldKeys.add(event.key);
});
window.addEventListener('keyup', (event) => heldKeys.delete(event.key));
function clearInput() {
  heldKeys.clear();
  const pointer = activePointer;
  activePointer = null;
  if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
}

function pauseOnLeave() {
  clearInput();
  lastRaf = null;
  if (engine.pause('hidden')) {
    $('pause-message').textContent = '화면을 떠난 동안 안전하게 멈춰 뒀어요.';
    render();
  }
}
window.addEventListener('blur', pauseOnLeave);
window.addEventListener('pagehide', pauseOnLeave);

function replay() {
  clearInput();
  engine.reset();
  startRun();
}

function resetImpact() {
  impactPending = false;
  impact?.reset();
  if (impact) impact.reducedMotion = Boolean(motionPreference?.matches);
}

motionPreference?.addEventListener('change', () => {
  if (impact) impact.reducedMotion = motionPreference.matches;
});

function setComicZoom(value) {
  comicZoom = Math.min(3, Math.max(1, value));
  $('comic-image').style.width = `${comicZoom * 100}%`;
  $('comic-zoom').textContent = `${Math.round(comicZoom * 100)}%`;
  $('zoom-out-button').disabled = comicZoom === 1;
  $('zoom-in-button').disabled = comicZoom === 3;
  if (comicZoom === 1) $('comic-viewport').scrollTo(0, 0);
}

$('start-button').addEventListener('click', startRun);
$('retry-load-button').addEventListener('click', prepareAssets);
$('pause-button').addEventListener('click', () => togglePause());
$('resume-button').addEventListener('click', () => togglePause());
$('replay-button').addEventListener('click', replay);
$('restart-button').addEventListener('click', replay);
$('comic-button').addEventListener('click', () => {
  if (!endingControlsShown) return;
  setComicZoom(1);
  $('comic-dialog').showModal();
});
$('zoom-in-button').addEventListener('click', () => setComicZoom(comicZoom + 0.5));
$('zoom-out-button').addEventListener('click', () => setComicZoom(comicZoom - 0.5));
$('zoom-reset-button').addEventListener('click', () => setComicZoom(1));
$('close-comic-button').addEventListener('click', () => $('comic-dialog').close());
$('comic-dialog').addEventListener('click', (event) => {
  if (event.target === $('comic-dialog')) $('comic-dialog').close();
});

document.addEventListener('visibilitychange', () => {
  clearInput();
  lastRaf = null;
  if (document.hidden) pauseOnLeave();
});

function animate(now) {
  const dt = lastRaf === null ? 0 : Math.min(0.25, Math.max(0, (now - lastRaf) / 1000));
  lastRaf = now;
  if (assets && !document.hidden) {
    if (engine.snapshot().inputEnabled) {
      const direction = Number(heldKeys.has('ArrowRight')) - Number(heldKeys.has('ArrowLeft'));
      if (direction) engine.moveBy(direction * dt * 490);
    }
    advanceImpactTimeline(engine, impact, dt, () => {
      // Consume the one collision event immediately, using the actual rendered foreheads.
      if (impactPending) render();
    });
    render();
  }
  requestAnimationFrame(animate);
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => { clearInput(); resizeCanvas(); });
if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(canvas);
resizeCanvas();
prepareAssets();
requestAnimationFrame(animate);

// Integration/debug access does not start the game or emit any completion by itself.
window.libraryEndingGame = Object.freeze({
  start: startRun,
  pause: () => { if (!engine.snapshot().paused) togglePause(); },
  resume: () => { if (engine.snapshot().paused) togglePause(); },
  reset: () => { clearInput(); engine.reset(); resetImpact(); lastRaf = null; currentInstruction = ''; endingControlsShown = false; $('comic-dialog').close(); $('intro').hidden = false; $('ending-controls').hidden = true; $('keyboard-note').hidden = false; $('pause-button').disabled = true; $('restart-button').disabled = true; $('instruction').textContent = '고양이와 함께 마지막 사고를 막아 주세요.'; render(); },
  getState: () => engine.snapshot(),
  integration: INTEGRATION,
});
