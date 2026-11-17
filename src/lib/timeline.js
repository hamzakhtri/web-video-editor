import { DEFAULT_MOTION, EFFECTS } from './constants.js';

export function imageKey(name) {
  const base = String(name ?? '').trim().replace(/^.*[\\/]/, '');
  return base.replace(/\.[^.]+$/, '').trim();
}

export function visualDuration(slides) {
  return slides.reduce((sum, slide) => sum + Number(slide.duration || 0), 0);
}

export function projectDuration(slides, audioDuration = 0) {
  return Math.max(visualDuration(slides), Number(audioDuration) || 0);
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.0';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeEffect(value, index) {
  if (value == null || value === '') return EFFECTS[index % EFFECTS.length].id;
  const id = String(value).trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!EFFECTS.some((effect) => effect.id === id)) {
    const names = EFFECTS.map((effect) => effect.id).join(', ');
    throw new Error(`Slide ${index + 1} has an unknown effect "${value}". Use one of: ${names}.`);
  }
  return id;
}

export function parseTimeline(data) {
  const slidesIn = Array.isArray(data) ? data : data?.slides;
  if (!Array.isArray(slidesIn) || slidesIn.length === 0) {
    throw new Error('The JSON needs a "slides" array with at least one picture.');
  }

  return slidesIn.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Slide ${index + 1} is not an object.`);
    }
    const image = imageKey(raw.image ?? raw.file ?? raw.name ?? '');
    const duration = Number(raw.duration ?? raw.seconds);
    if (!image) throw new Error(`Slide ${index + 1} is missing an image name.`);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Slide ${index + 1} needs a duration in seconds, greater than 0.`);
    }
    const speed = Number(raw.speed ?? raw.motion);
    return {
      id: crypto.randomUUID(),
      image,
      duration,
      effect: normalizeEffect(raw.effect, index),
      speed: Number.isFinite(speed) ? Math.min(1.6, Math.max(0.25, speed)) : DEFAULT_MOTION,
    };
  });
}

export function buildSlidesFromImages(keys) {
  return keys.map((image, index) => ({
    id: crypto.randomUUID(),
    image,
    duration: 4,
    effect: EFFECTS[index % EFFECTS.length].id,
    speed: DEFAULT_MOTION,
  }));
}

export function fitDurations(slides, audioDuration) {
  const sum = visualDuration(slides);
  if (sum <= 0 || !(audioDuration > 0)) return slides;
  const scale = audioDuration / sum;
  const next = slides.map((slide) => ({
    ...slide,
    duration: Math.max(0.4, Math.round(slide.duration * scale * 1000) / 1000),
  }));
  const drift = audioDuration - visualDuration(next);
  const last = next[next.length - 1];
  next[next.length - 1] = {
    ...last,
    duration: Math.max(0.4, Math.round((last.duration + drift) * 1000) / 1000),
  };
  return next;
}

export function slideStarts(slides) {
  let cursor = 0;
  return slides.map((slide) => {
    const start = cursor;
    cursor += Number(slide.duration) || 0;
    return start;
  });
}

export function locateSlide(slides, time) {
  if (!slides.length) return null;
  let cursor = 0;
  for (let index = 0; index < slides.length; index += 1) {
    const duration = Math.max(0.001, Number(slides[index].duration) || 0);
    const isLast = index === slides.length - 1;
    if (time < cursor + duration || isLast) {
      const local = Math.max(0, time - cursor);
      const progress = isLast && time >= cursor + duration ? 1 : Math.min(1, local / duration);
      return { index, local, progress, duration, start: cursor };
    }
    cursor += duration;
  }
  return null;
}
