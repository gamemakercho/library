const cutinClamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const cutinMix = (a, b, p) => a + (b - a) * p;
const cutinEaseOut = (p) => 1 - Math.pow(1 - cutinClamp(p), 3);

/** Clock is advanced by the game's rAF delta, never by Date.now/setTimeout. */
export class ImpactCutin {
  constructor(meta, { reducedMotion = false } = {}) {
    this.meta = meta;
    this.reducedMotion = reducedMotion;
    this.reset();
  }
  get duration() { return this.reducedMotion ? .28 : this.meta.timing_ms.total / 1000; }
  reset() { this.elapsed = 0; this.played = false; this.active = false; this.origin = null; }
  trigger(point) {
    if (this.played || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    this.played = true; this.active = true; this.elapsed = 0; this.origin = { ...point };
    return true;
  }
  /** Returns delta available to the engine after a short impact freeze. */
  advance(dt, paused = false) {
    if (paused || !Number.isFinite(dt) || dt <= 0) return 0;
    if (!this.active) return dt;
    const before = this.elapsed;
    const hit = this.reducedMotion ? 0 : this.meta.timing_ms.hit_stop / 1000;
    const frozen = Math.max(0, Math.min(before + dt, hit) - Math.min(before, hit));
    this.elapsed = Math.min(this.duration, before + dt);
    if (this.elapsed >= this.duration - 1e-9) this.active = false;
    return Math.max(0, dt - frozen);
  }
  sample(width, height) {
    if (!this.active) return null;
    const m = this.meta, t = this.elapsed;
    const target = { x: width * m.target_stage_normalized[0], y: height * m.target_stage_normalized[1] };
    let ratio, alpha, move;
    if (this.reducedMotion) {
      ratio = .78; move = 1;
      alpha = cutinClamp(t / .045) * (1 - cutinClamp((t - .12) / .16));
    } else {
      const enter = m.timing_ms.enter / 1000, hold = m.timing_ms.hold / 1000;
      const exit = m.timing_ms.exit / 1000, r = m.stage_width_ratio;
      move = cutinEaseOut(t / enter);
      if (t < enter) { ratio = cutinMix(r.start, r.peak, cutinEaseOut(t / enter)); alpha = cutinClamp(t / .03); }
      else if (t < enter + hold) { ratio = cutinMix(r.peak, r.hold, cutinEaseOut((t - enter) / hold)); alpha = 1; }
      else { const p = cutinClamp((t - enter - hold) / exit); ratio = cutinMix(r.hold, r.end, cutinEaseOut(p)); alpha = 1 - p * p; }
    }
    const crop = m.content_rect;
    const w = width * ratio, h = w * crop[3] / crop[2];
    const x = cutinMix(this.origin.x, target.x, move), y = cutinMix(this.origin.y, target.y, move);
    return { alpha, width: w, height: h, x, y, left: x - w * m.contact_pivot_normalized[0], top: y - h * m.contact_pivot_normalized[1], dim: m.dim_max_alpha * alpha };
  }
}

/** Draw last in the gameplay canvas, above characters and existing soul trails. */
export function drawImpactCutin(ctx, image, effect, width, height, { label = true } = {}) {
  const s = effect.sample(width, height);
  if (!s) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
  ctx.fillStyle = `rgba(41,28,34,${s.dim})`; ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = s.alpha;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, ...effect.meta.content_rect, s.left, s.top, s.width, s.height);
  if (label) {
    ctx.translate(cutinClamp(s.x - s.width * .2, 50, width - 50), cutinClamp(s.y - s.height * .33, 70, height - 60));
    ctx.rotate(-.12);
    ctx.font = `900 ${Math.min(100, Math.max(36, width * .12))}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 8;
    ctx.strokeStyle = '#fff6cf'; ctx.fillStyle = '#bf5846';
    ctx.strokeText(effect.meta.text || '쿵!', 0, 0); ctx.fillText(effect.meta.text || '쿵!', 0, 0);
  }
  ctx.restore();
}

/** Stop at the collision substep before advancing the new contact pose again.
 * The effect keeps its own rAF clock; manual/visibility pauses freeze both clocks.
 */
export function advanceImpactTimeline(engine, effect, seconds, afterStep = () => {}) {
  if (!Number.isFinite(seconds) || seconds <= 0 || engine.snapshot().paused) return;
  let remaining = seconds;
  while (remaining > 1e-8) {
    const dt = Math.min(remaining, 1 / 120);
    engine.advance(effect ? effect.advance(dt) : dt);
    afterStep();
    remaining -= dt;
  }
}
