import { frameForAction } from './asset-loader.js';
import { clamp, lerp, smooth } from './engine.js';

const TAU = Math.PI * 2;

export function actorPlacement(sprite, actor, referenceRenderHeight, time) {
  const frame = frameForAction(sprite.meta, actor.action, time);
  const scale = referenceRenderHeight / sprite.meta.referenceHeight;
  const sourceRight = frame.facing !== 'left';
  const flip = (actor.facing > 0) === sourceRight ? 1 : -1;
  return { ...actor, frame, scale, flip };
}

export function contactPoint(placement) {
  const p = placement.frame.contact || [placement.frame.crop[2] / 2, placement.frame.crop[3] * 0.18];
  const a = placement.frame.anchor;
  const localX = (p[0] - a[0]) * placement.scale * placement.flip;
  const localY = (p[1] - a[1]) * placement.scale;
  const r = placement.rotation || 0;
  return { x: placement.x + Math.cos(r) * localX - Math.sin(r) * localY, y: placement.y + Math.sin(r) * localX + Math.cos(r) * localY };
}

export function drawActor(ctx, sprite, placement) {
  const [sx, sy, sw, sh] = placement.frame.crop;
  const [ax, ay] = placement.frame.anchor;
  ctx.save();
  ctx.translate(placement.x, placement.y);
  ctx.rotate(placement.rotation || 0);
  ctx.scale(placement.flip * placement.scale, placement.scale);
  const polygon = placement.frame.clip_polygon_in_content;
  if (polygon) {
    ctx.beginPath();
    polygon.forEach(([px, py], i) => i ? ctx.lineTo(px - ax, py - ay) : ctx.moveTo(px - ax, py - ay));
    ctx.closePath();
    ctx.clip();
  }
  ctx.drawImage(sprite.image, sx, sy, sw, sh, -ax, -ay, sw, sh);
  ctx.restore();
}

function marker(ctx, data, time, assisted) {
  if (!data) return;
  const alpha = 0.48 + Math.sin(time * 5) * 0.1;
  ctx.save();
  ctx.translate(data.x, data.y);
  ctx.strokeStyle = `rgba(255,237,141,${alpha})`;
  ctx.fillStyle = `rgba(255,246,192,${alpha * 0.17})`;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, 0, data.radius, 17, 0, 0, TAU);
  ctx.fill(); ctx.stroke();
  if (assisted) {
    ctx.fillStyle = '#fff4b5';
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(-10, -47); ctx.lineTo(10, -47); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function soulTrails(ctx, center, progress) {
  const p = clamp(progress, 0, 1);
  const spread = Math.sin(p * Math.PI) * 112;
  const rise = Math.sin(p * Math.PI) * 88;
  for (const [direction, color] of [[1, '#fff1ac'], [-1, '#bcefe2']]) {
    const from = { x: center.x + direction * spread, y: center.y - rise };
    const to = { x: center.x - direction * spread, y: center.y + rise * 0.25 };
    ctx.save();
    ctx.globalAlpha = 0.9 * Math.sin(p * Math.PI);
    ctx.strokeStyle = color; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.bezierCurveTo(center.x + direction * 65, center.y - 115, center.x - direction * 65, center.y + 55, to.x, to.y); ctx.stroke();
    for (let j = 0; j < 4; j++) {
      const u = (p + j * 0.12) % 1;
      const x = lerp(from.x, to.x, u);
      const y = center.y - Math.sin(u * Math.PI) * (70 + j * 8);
      ctx.fillStyle = j % 2 ? '#ffffff' : color;
      ctx.fillRect(Math.round(x / 3) * 3, Math.round(y / 3) * 3, 5, 5);
    }
    ctx.restore();
  }
}

function fitCrop(ctx, image, crop, dest) {
  const [sx, sy, sw, sh] = crop;
  const [dx, dy, dw, dh] = dest;
  const scale = Math.min(dw / sw, dh / sh);
  ctx.drawImage(image, sx, sy, sw, sh, dx + (dw - sw * scale) / 2, dy + (dh - sh * scale) / 2, sw * scale, sh * scale);
}

export function drawFinalPanel(ctx, assets, config) {
  const { worldWidth: w, worldHeight: h } = config;
  ctx.fillStyle = '#fff9ef'; ctx.fillRect(0, 0, w, h);
  const panel = assets.comic.meta.panels.find((p) => p.id === (assets.comic.meta.final_panel || 'panel_4'));
  fitCrop(ctx, assets.comic.image, panel.crop, [18, 70, w - 36, h - 140]);
}

/** Returns the actual forehead location for effect anchoring and audit checks. */
export function renderScene(ctx, assets, state, config) {
  const { worldWidth: w, worldHeight: h } = config;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (state.showComic) { drawFinalPanel(ctx, assets, config); return null; }
  ctx.drawImage(assets.background, 0, 0, w, h);
  marker(ctx, state.landingMarker, state.totalTime, state.phase === 'assist');
  const humanSprite = state.phase === 'tracking' && state.human.action === 'run' ? assets.librarianRun : assets.librarian;
  const human = actorPlacement(humanSprite, state.human, config.librarianRenderHeight, state.phaseTime);
  const cat = actorPlacement(assets.cat, state.cat, config.catRenderHeight, state.totalTime);
  const humanHead = contactPoint(human);
  if (['jump', 'contact'].includes(state.phase)) {
    // Target the forehead coordinates measured on the native illustrations.
    // Cat scale is unchanged; only translation is applied through its one leap.
    const head = contactPoint({ ...cat, x: 0, y: 0 });
    const destination = { x: humanHead.x - head.x, y: humanHead.y - head.y };
    const p = state.phase === 'contact' ? 1 : smooth(state.progress);
    cat.x = lerp(state.jumpStartX, destination.x, p);
    cat.y = lerp(config.floorY, destination.y, p) - Math.sin(p * Math.PI) * 28;
    cat.rotation = 0;
  }
  // The nearer cat remains visible in front of the crouching human.
  drawActor(ctx, humanSprite, human);
  drawActor(ctx, assets.cat, cat);
  if (state.showSoulTrails) soulTrails(ctx, humanHead, state.phaseTime / config.contactSeconds);
  if (state.flashOpacity > 0) {
    const glow = ctx.createRadialGradient(humanHead.x, humanHead.y, 0, humanHead.x, humanHead.y, 95);
    glow.addColorStop(0, `rgba(255,255,244,${state.flashOpacity})`);
    glow.addColorStop(1, 'rgba(255,255,244,0)');
    ctx.fillStyle = glow; ctx.fillRect(humanHead.x - 95, humanHead.y - 95, 190, 190);
  }
  if (state.phase === 'countdown') {
    ctx.save();
    ctx.fillStyle = 'rgba(51,42,54,0.21)'; ctx.fillRect(0, 0, w, h);
    ctx.font = '800 128px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 9; ctx.strokeStyle = '#6f4c36'; ctx.fillStyle = '#fff8de';
    ctx.strokeText(String(state.countdown), w / 2, h * 0.45); ctx.fillText(String(state.countdown), w / 2, h * 0.45);
    ctx.restore();
  }
  return { humanHead, catHead: contactPoint(cat), human, cat };
}

export function renderFullComic(ctx, assets, config) {
  ctx.fillStyle = '#fff9ef'; ctx.fillRect(0, 0, config.worldWidth, config.worldHeight);
  const image = assets.comic.image;
  fitCrop(ctx, image, [0, 0, image.naturalWidth, image.naturalHeight], [8, 8, config.worldWidth - 16, config.worldHeight - 16]);
}
