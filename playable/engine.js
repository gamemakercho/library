import { SCENE, TIMING } from './scene-config.js';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const ACTIVE_PHASES = new Set(['countdown', 'tracking', 'slip', 'assist', 'jump', 'contact', 'recovery']);

/**
 * DOM-free, deterministic finale controller. There is exactly one rescue per run.
 * advance(seconds) uses short substeps so the assisted stop is never skipped.
 */
export class RescueEngine {
  constructor(options = {}) {
    this.config = { ...SCENE, ...TIMING, ...(options.config || {}) };
    this.onComplete = options.onComplete || (() => {});
    this.onEvent = options.onEvent || (() => {});
    this.reset();
  }

  reset() {
    this.state = {
      phase: 'idle', phaseTime: 0, totalTime: 0, catX: this.config.catStartX,
      catFacing: 1, catMovingUntil: 0, paused: false, pauseReason: null,
      humanFacing: -1,
      landingX: null, jumpStartX: null, rescueHumanStart: null, rescueStarted: false,
      completed: false, assisted: false, completionEmitted: false,
    };
    return this.snapshot();
  }

  start() {
    if (this.state.phase !== 'idle') return false;
    this._phase('countdown');
    this.onEvent({ type: 'start' });
    return true;
  }

  pause(reason = 'manual') {
    if (!ACTIVE_PHASES.has(this.state.phase) || this.state.paused) return false;
    this.state.paused = true;
    this.state.pauseReason = reason;
    this.onEvent({ type: 'pause', reason });
    return true;
  }

  resume() {
    if (!this.state.paused) return false;
    const reason = this.state.pauseReason;
    this.state.paused = false;
    this.state.pauseReason = null;
    this.onEvent({ type: 'resume', reason });
    return true;
  }

  moveCat(x) {
    if (this.state.paused || !['countdown', 'tracking', 'slip', 'assist'].includes(this.state.phase)) return false;
    if (!Number.isFinite(x)) return false;
    const next = clamp(x, this.config.catMinX, this.config.catMaxX);
    if (Math.abs(next - this.state.catX) > 0.6) {
      this.state.catFacing = next > this.state.catX ? 1 : -1;
      this.state.catMovingUntil = this.state.totalTime + 0.18;
    }
    this.state.catX = next;
    if (this.state.phase === 'assist' && this._aligned()) this._beginRescue();
    return true;
  }

  moveBy(dx) { return this.moveCat(this.state.catX + dx); }

  advance(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0 || this.state.paused) return this.snapshot();
    let remaining = seconds;
    while (remaining > 1e-8 && ACTIVE_PHASES.has(this.state.phase) && !this.state.paused) {
      const dt = Math.min(remaining, 1 / 120);
      this._step(dt);
      remaining -= dt;
    }
    return this.snapshot();
  }

  _phase(name) {
    this.state.phase = name;
    this.state.phaseTime = 0;
    this.onEvent({ type: 'phase', phase: name });
  }

  _aligned() { return Math.abs(this.state.catX - this.state.landingX) <= this.config.rescueRadius; }

  _beginRescue() {
    if (this.state.rescueStarted) return;
    const human = this.snapshot().human;
    this.state.rescueStarted = true;
    this.state.jumpStartX = this.state.catX;
    this.state.rescueHumanStart = { x: human.x, y: human.y };
    this._phase('jump');
    this.onEvent({ type: 'rescue', assisted: this.state.assisted });
  }

  _step(dt) {
    const c = this.config;
    const s = this.state;
    s.totalTime += dt;
    s.phaseTime += dt;
    switch (s.phase) {
      case 'countdown':
        if (s.phaseTime >= c.countdownSeconds) this._phase('tracking');
        break;
      case 'tracking':
        {
          const before = this._stairPosition(Math.max(0, s.phaseTime - dt) / c.trackingSeconds);
          const after = this._stairPosition(s.phaseTime / c.trackingSeconds);
          const velocity = (after.x - before.x) / dt;
          if (Math.abs(velocity) > c.facingVelocityThreshold) s.humanFacing = velocity > 0 ? 1 : -1;
        }
        if (s.phaseTime >= c.trackingSeconds) {
          // Deterministic last-step slip; it is visible before player alignment matters.
          const last = c.stairWaypoints.at(-1);
          s.landingX = clamp(last.x + c.horizontalFeint, c.landingMinX, c.landingMaxX);
          this._phase('slip');
        }
        break;
      case 'slip': {
        const progress = clamp(s.phaseTime / c.slipSeconds, 0, 1);
        if (progress >= c.rescueEarliestProgress && this._aligned()) this._beginRescue();
        else if (progress >= 1) {
          s.assisted = true;
          this._phase('assist');
          this.onEvent({ type: 'assist' });
        }
        break;
      }
      case 'assist':
        if (this._aligned()) this._beginRescue();
        break;
      case 'jump':
        if (s.phaseTime >= c.jumpSeconds) {
          s.catX = s.landingX;
          this._phase('contact');
          this.onEvent({ type: 'forehead-bump' });
        }
        break;
      case 'contact':
        if (s.phaseTime >= c.contactSeconds) this._phase('recovery');
        break;
      case 'recovery':
        if (s.phaseTime >= c.recoverySeconds) {
          s.completed = true;
          this._phase('complete');
          if (!s.completionEmitted) {
            s.completionEmitted = true;
            const result = Object.freeze({ gameId: 'library-ending-rescue', completed: true, assisted: s.assisted });
            this.onComplete(result);
            this.onEvent({ type: 'complete', ...result });
          }
        }
        break;
    }
  }

  _stairPosition(progress) {
    const points = this.config.stairWaypoints;
    const scaled = clamp(progress, 0, 1) * (points.length - 1);
    const i = Math.min(points.length - 2, Math.floor(scaled));
    const t = smooth(scaled - i);
    return { x: lerp(points[i].x, points[i + 1].x, t), y: lerp(points[i].y, points[i + 1].y, t) };
  }

  snapshot() {
    const s = this.state;
    const c = this.config;
    const first = c.stairWaypoints[0];
    const last = c.stairWaypoints.at(-1);
    let human = { x: first.x, y: first.y, action: 'run', facing: -1, rotation: 0 };
    let cat = { x: s.catX, y: c.floorY, action: s.totalTime < s.catMovingUntil ? 'run' : 'idle', facing: s.catFacing, rotation: 0 };
    let progress = 0;
    let instruction = '고양이를 좌우로 끌어 사서를 따라가세요.';
    if (s.phase === 'tracking') {
      progress = clamp(s.phaseTime / c.trackingSeconds, 0, 1);
      const p = this._stairPosition(progress);
      human = { ...human, ...p, facing: s.humanFacing };
    } else if (['slip', 'assist'].includes(s.phase)) {
      progress = s.phase === 'assist' ? 1 : clamp(s.phaseTime / c.slipSeconds, 0, 1);
      // Stop at the recoverable pose, before the character touches the ground.
      human = {
        ...human, x: lerp(last.x, s.landingX, smooth(progress)),
        y: lerp(last.y, c.rescueHumanFeetY - 45, smooth(progress)),
        action: 'slip', facing: -1, rotation: -Math.sin(progress * Math.PI) * 0.1,
      };
      cat.action = 'run';
      instruction = s.phase === 'assist' ? '고양이를 빛나는 자리로 옮겨 주세요.' : '안 돼! 사서님 아래로 이동해 주세요!';
    } else if (['jump', 'contact'].includes(s.phase)) {
      progress = s.phase === 'contact' ? 1 : clamp(s.phaseTime / c.jumpSeconds, 0, 1);
      const from = s.rescueHumanStart || { x: s.landingX, y: c.rescueHumanFeetY };
      human = { ...human, x: lerp(from.x, s.landingX, smooth(progress)), y: lerp(from.y, c.rescueHumanFeetY, smooth(progress)), action: 'catch', facing: -1 };
      cat = { ...cat, x: lerp(s.jumpStartX, s.landingX, smooth(progress)), y: c.floorY - Math.sin(progress * Math.PI / 2) * 60, action: 'jump', facing: 1 };
      instruction = s.phase === 'contact' ? '쿵! 두 영혼이 다시 제자리로…' : '안 돼!';
    } else if (['recovery', 'complete'].includes(s.phase)) {
      progress = clamp(s.phaseTime / c.recoverySeconds, 0, 1);
      human = { ...human, x: s.landingX, y: c.floorY, action: 'sit', facing: 1 };
      cat = { ...cat, x: lerp(s.landingX, c.catMaxX + 90, progress), action: 'flee', facing: 1 };
      instruction = '사서도 고양이도, 다시 제자리로!';
    }
    return {
      ...s, progress, human, cat, instruction,
      countdown: s.phase === 'countdown' ? Math.max(1, Math.ceil((c.countdownSeconds - s.phaseTime) / (c.countdownSeconds / 3))) : null,
      landingMarker: ['slip', 'assist'].includes(s.phase) ? { x: s.landingX, y: c.landingMarkerY, radius: c.rescueRadius } : null,
      inputEnabled: !s.paused && ['countdown', 'tracking', 'slip', 'assist'].includes(s.phase),
      showComic: s.phase === 'complete',
      showSoulTrails: s.phase === 'contact',
      flashOpacity: s.phase === 'contact' ? Math.max(0, 0.56 * (1 - s.phaseTime / c.flashSeconds)) : 0,
    };
  }
}

export { clamp, lerp, smooth };
