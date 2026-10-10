/** All crops are measured metadata. Never divide a sheet into guessed equal cells. */
export const ASSET_ROOT = new URL('../assets/', globalThis.document?.baseURI || import.meta.url);

export function assetImageSource(name) {
  return globalThis.LIBRARY_ENDING_INLINE_ASSETS?.[name] || new URL(name, ASSET_ROOT).href;
}

function rectArray(rect) {
  if (Array.isArray(rect)) return rect.map(Number);
  if (rect && typeof rect === 'object') return [rect.x, rect.y, rect.w ?? rect.width, rect.h ?? rect.height].map(Number);
  throw new Error('스프라이트의 실제 그림 좌표가 없습니다.');
}

function pointArray(point, fallback) {
  if (Array.isArray(point)) return point.map(Number);
  if (point && typeof point === 'object') return [point.x, point.y].map(Number);
  return fallback;
}

export function normalizeSpriteMeta(meta, image) {
  const entries = Array.isArray(meta.frames)
    ? meta.frames.map((frame, i) => [frame.id || frame.name || `frame_${i}`, frame])
    : Object.entries(meta.frames || {});
  if (!entries.length) throw new Error('스프라이트 프레임이 비어 있습니다.');
  const frames = entries.map(([id, frame]) => {
    const crop = rectArray(frame.content_rect || frame.rect);
    const [x, y, w, h] = crop;
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > image.naturalWidth || y + h > image.naturalHeight) {
      throw new Error(`이미지 밖을 가리키는 프레임: ${id}`);
    }
    let anchor = pointArray(frame.anchor_in_content, null);
    if (!anchor && frame.anchor_in_rect) {
      const outer = rectArray(frame.rect);
      const a = pointArray(frame.anchor_in_rect);
      anchor = [a[0] - (x - outer[0]), a[1] - (y - outer[1])];
    }
    anchor ||= [w / 2, h];
    let contact = pointArray(frame.contact_in_content || frame.forehead_in_content, null);
    if (!contact && (frame.contact_in_rect || frame.forehead_in_rect)) {
      const outer = rectArray(frame.rect);
      const p = pointArray(frame.contact_in_rect || frame.forehead_in_rect);
      contact = [p[0] - (x - outer[0]), p[1] - (y - outer[1])];
    }
    const polygon = frame.clip_polygon_in_content;
    if (polygon && (!Array.isArray(polygon) || polygon.length < 3 || polygon.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || p[0] < 0 || p[1] < 0 || p[0] > w || p[1] > h))) {
      throw new Error(`클리핑 좌표 오류: ${id}`);
    }
    return {
      ...frame, id, crop, anchor, contact,
      duration: Math.max(0.02, Number(frame.duration_ms || meta.duration_ms || 140) / 1000),
      facing: frame.facing || meta.source_facing || meta.facing || 'right',
    };
  });
  const byId = new Map(frames.map((frame) => [frame.id, frame]));
  const reference = byId.get(meta.reference_frame) || frames.find((f) => /run|stand|idle/i.test(f.id)) || frames[0];
  const referenceHeight = Number(meta.reference_height) || reference.crop[3];
  if (!(referenceHeight > 0)) throw new Error('스프라이트 기준 높이가 잘못되었습니다.');
  return { ...meta, frames, byId, referenceHeight, reference };
}

const ACTION_ALIASES = {
  run: ['run', 'running', 'walk', 'step'],
  idle: ['idle', 'stand', 'ready', 'wait'],
  slip: ['slip', 'stumble', 'fall', 'panic'],
  catch: ['catch', 'brace', 'crouch', 'bump', 'contact'],
  jump: ['jump', 'leap', 'rescue', 'catch', 'bump', 'contact'],
  sit: ['sit', 'seated', 'dazed', 'recover'],
  flee: ['flee', 'escape', 'run', 'running'],
};

export function framesForAction(meta, action) {
  const aliases = ACTION_ALIASES[action] || [action];
  for (const alias of aliases) {
    const definition = meta.actions?.[alias] || meta.animations?.[alias];
    if (definition) {
      const ids = Array.isArray(definition) ? definition : definition.frames;
      const matched = (ids || []).map((entry) => meta.byId.get(typeof entry === 'string' ? entry : entry.id)).filter(Boolean);
      if (matched.length) return matched;
    }
    const matches = meta.frames.filter((frame) => frame.action === alias || new RegExp(`(^|[_-])${alias}([_-]|$|\\d)`, 'i').test(frame.id));
    if (matches.length) return matches;
  }
  return [meta.reference];
}

export function frameForAction(meta, action, time) {
  const frames = framesForAction(meta, action);
  const total = frames.reduce((n, frame) => n + frame.duration, 0);
  let t = Math.max(0, time) % total;
  for (const frame of frames) {
    if (t < frame.duration) return frame;
    t -= frame.duration;
  }
  return frames.at(-1);
}

export function normalizeComicMeta(meta, image) {
  const list = meta.panels || meta.frames;
  const entries = Array.isArray(list) ? list.map((p, i) => [p.id || `panel_${i + 1}`, p]) : Object.entries(list || {});
  const panels = entries.map(([id, panel]) => ({
    ...panel, id, crop: rectArray(panel.content_rect || panel.rect),
  }));
  if (panels.length !== 4) throw new Error('엔딩 만화의 네 컷 좌표를 확인해 주세요.');
  panels.forEach(({ id, crop: [x, y, w, h] }) => {
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > image.naturalWidth || y + h > image.naturalHeight) throw new Error(`만화 좌표 오류: ${id}`);
  });
  return { ...meta, panels };
}

export function normalizeCutinMeta(meta, image) {
  const crop = rectArray(meta.content_rect);
  const [x, y, w, h] = crop;
  const pointValid = (p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n) && n >= 0 && n <= 1);
  const timing = meta.timing_ms;
  const ratios = meta.stage_width_ratio;
  if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > image.naturalWidth || y + h > image.naturalHeight ||
      !pointValid(meta.contact_pivot_normalized) || !pointValid(meta.target_stage_normalized) ||
      !timing || !['enter', 'hold', 'exit', 'total', 'hit_stop'].every((key) => Number.isFinite(timing[key]) && timing[key] >= 0) ||
      timing.enter <= 0 || timing.hold <= 0 || timing.exit <= 0 || timing.total !== timing.enter + timing.hold + timing.exit || timing.hit_stop > timing.total ||
      !ratios || !['start', 'peak', 'hold', 'end'].every((key) => Number.isFinite(ratios[key]) && ratios[key] > 0) ||
      !Number.isFinite(meta.dim_max_alpha) || meta.dim_max_alpha < 0 || meta.dim_max_alpha > 0.12) {
    throw new Error('컷인 이미지 또는 연출 좌표를 확인해 주세요.');
  }
  return { ...meta, content_rect: crop };
}

async function readJson(name, signal) {
  const inline = globalThis.LIBRARY_ENDING_INLINE_ASSETS?.[name];
  if (inline !== undefined) return typeof inline === 'string' ? JSON.parse(inline) : inline;
  const response = await fetch(new URL(name, ASSET_ROOT), { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error(`${name} 파일을 불러오지 못했습니다 (${response.status}).`);
  return response.json();
}

async function readImage(name, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error(`${name} 이미지를 불러오지 못했습니다.`)); };
    const abort = () => { cleanup(); image.src = ''; reject(new DOMException('Aborted', 'AbortError')); };
    const cleanup = () => { image.onload = null; image.onerror = null; signal?.removeEventListener('abort', abort); };
    signal?.addEventListener('abort', abort, { once: true });
    image.src = assetImageSource(name);
  });
}

export async function loadAssets(signal) {
  const [background, librarian, cat, comic, librarianMeta, catMeta, comicMeta, librarianRun, librarianRunMeta, cutin, cutinMeta] = await Promise.all([
    readImage('staircase-background.png', signal),
    readImage('librarian-actions.png', signal),
    readImage('cat-actions.png', signal),
    readImage('ending-comic.png', signal),
    readJson('librarian-actions.json', signal),
    readJson('cat-actions.json', signal),
    readJson('ending-comic.json', signal),
    readImage('librarian-run-8frames.png', signal),
    readJson('librarian-run-8frames.json', signal),
    readImage('forehead-bump-cutin.png', signal),
    readJson('forehead-bump-cutin.json', signal),
  ]);
  const runMeta = normalizeSpriteMeta(librarianRunMeta, librarianRun);
  if (framesForAction(runMeta, 'run').length !== 8 || runMeta.frames.some((f) => !f.clip_polygon_in_content)) {
    throw new Error('달리기 8프레임과 폴리곤 좌표를 확인해 주세요.');
  }
  return {
    background, librarian: { image: librarian, meta: normalizeSpriteMeta(librarianMeta, librarian) },
    cat: { image: cat, meta: normalizeSpriteMeta(catMeta, cat) },
    comic: { image: comic, meta: normalizeComicMeta(comicMeta, comic) },
    librarianRun: { image: librarianRun, meta: runMeta },
    cutin: { image: cutin, meta: normalizeCutinMeta(cutinMeta, cutin) },
  };
}
