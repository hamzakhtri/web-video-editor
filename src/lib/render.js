import { cueAt, isRtlText } from './subtitles.js';
import { locateSlide } from './timeline.js';

function smooth(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function coverSize(source, width, height) {
  const scale = Math.max(width / source.width, height / source.height);
  return { w: source.width * scale, h: source.height * scale };
}

function motion(effect, t, speed = 0.75) {
  const p = smooth(t);
  const amount = Math.min(1.6, Math.max(0.25, speed));
  const zoom = 0.1 * amount;
  const drift = 0.34 * amount;
  switch (effect) {
    case 'zoom-out':
      return { scale: 1 + zoom * (1 - p), ax: 0.5, ay: 0.5 };
    case 'pan-left':
      return { scale: 1 + 0.045 * amount, ax: 0.5 - drift / 2 + drift * p, ay: 0.5 };
    case 'pan-right':
      return { scale: 1 + 0.045 * amount, ax: 0.5 + drift / 2 - drift * p, ay: 0.5 };
    case 'ken-burns':
      return {
        scale: 1 + zoom * p,
        ax: 0.5 - drift * 0.35 + drift * 0.7 * p,
        ay: 0.5 + drift * 0.22 - drift * 0.44 * p,
      };
    case 'zoom-in':
    default:
      return { scale: 1 + zoom * p, ax: 0.5, ay: 0.5 };
  }
}

const MAX_ZOOM = 1.2;

export async function prepareExportSources(imageMap, width, height) {
  const prepared = new Map();
  const close = [];
  for (const [key, source] of imageMap || []) {
    const bitmap = await prepareStill(source, width, height);
    prepared.set(key, bitmap);
    if (bitmap && bitmap !== source) close.push(bitmap);
  }
  return {
    imageMap: prepared,
    release() {
      close.forEach((bitmap) => bitmap.close?.());
    },
  };
}

async function prepareStill(source, width, height) {
  if (!source?.width || !source?.height) return source;
  const cover = Math.max(width / source.width, height / source.height);
  const resizeWidth = Math.max(2, Math.round(source.width * cover * MAX_ZOOM));
  const resizeHeight = Math.max(2, Math.round(source.height * cover * MAX_ZOOM));
  if (Math.abs(resizeWidth - source.width) < 4 && Math.abs(resizeHeight - source.height) < 4) return source;
  try {
    return await createImageBitmap(source, { resizeWidth, resizeHeight, resizeQuality: 'high' });
  } catch {
    return source;
  }
}

export function drawEffect(ctx, source, effect, progress, width, height, speed = 0.75) {
  if (!source || !source.width || !source.height) return false;
  const base = coverSize(source, width, height);
  const { scale, ax, ay } = motion(effect, progress, speed);
  const dw = base.w * scale;
  const dh = base.h * scale;
  const dx = -(dw - width) * ax;
  const dy = -(dh - height) * ay;
  ctx.drawImage(source, dx, dy, dw, dh);
  return true;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function layoutLines(ctx, cue, maxWidth) {
  const words = cue.words?.length
    ? cue.words
    : cue.text.split(/\s+/).filter(Boolean).map((text) => ({ text, start: cue.start, end: cue.end }));
  const space = ctx.measureText(' ').width;
  const lines = [];
  let line = [];
  let width = 0;

  for (const word of words) {
    const wordWidth = ctx.measureText(word.text).width;
    const next = line.length ? width + space + wordWidth : wordWidth;
    if (line.length && next > maxWidth) {
      lines.push({ words: line, width });
      line = [word];
      width = wordWidth;
    } else {
      line.push(word);
      width = line.length === 1 ? wordWidth : next;
    }
  }
  if (line.length) lines.push({ words: line, width });
  return lines.slice(0, 2);
}

function hexToRgba(hex, alpha) {
  const raw = String(hex || '#000000').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return `rgba(7, 7, 8, ${alpha})`;
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function drawCue(ctx, cue, time, width, height, style = {}) {
  const rtl = isRtlText(cue.text);
  const scale = style.scale ?? 1;
  const fontSize = Math.round(height * 0.046 * scale);
  ctx.font = `700 ${fontSize}px "Noto Naskh Arabic", Outfit, sans-serif`;
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textBaseline = 'middle';
  ctx.textAlign = rtl ? 'right' : 'left';

  const lines = layoutLines(ctx, cue, width * 0.82);
  if (!lines.length) return;

  const lineHeight = fontSize * 1.28;
  const padX = fontSize * 0.64;
  const padY = fontSize * 0.38;
  const blockWidth = Math.max(...lines.map((line) => line.width)) + padX * 2;
  const blockHeight = lines.length * lineHeight + padY * 2;
  const blockX = (width - blockWidth) / 2;
  const margin = Math.max(16, Math.round(height * 0.018));
  const place = Number.isFinite(style.place)
    ? Math.min(1, Math.max(0, style.place))
    : (style.position === 'top' ? 0 : 1);
  const travel = Math.max(0, height - blockHeight - margin * 2);
  const blockY = margin + travel * place;

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  roundRect(ctx, blockX, blockY, blockWidth, blockHeight, Math.max(10, fontSize * 0.28));
  ctx.fillStyle = hexToRgba(style.background || '#070708', style.backgroundOpacity ?? 0.62);
  ctx.fill();

  const space = ctx.measureText(' ').width;
  const shadow = Math.min(1, Math.max(0, Number.isFinite(style.shadow) ? style.shadow : 0.4));
  ctx.shadowColor = `rgba(0, 0, 0, ${shadow})`;
  ctx.shadowBlur = fontSize * 0.45 * shadow;
  ctx.shadowOffsetY = fontSize * 0.06 * shadow;
  ctx.lineJoin = 'round';

  lines.forEach((line, lineIndex) => {
    const y = blockY + padY + lineHeight * lineIndex + lineHeight / 2;
    let x = rtl
      ? width / 2 + line.width / 2
      : width / 2 - line.width / 2;
    for (const word of line.words) {
      const wordWidth = ctx.measureText(word.text).width;
      const active = time >= word.start && time < word.end + 0.04;
      ctx.fillStyle = active ? (style.highlight || '#ffd7a6') : (style.color || '#fffdf8');
      if (rtl) {
        ctx.fillText(word.text, x, y);
        x -= wordWidth + space;
      } else {
        ctx.fillText(word.text, x, y);
        x += wordWidth + space;
      }
    }
  });

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.direction = 'ltr';
}

function drawMessage(ctx, width, height, title, detail) {
  ctx.fillStyle = '#f6f1e7';
  ctx.font = '560 42px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, width / 2, height / 2 - 16);
  if (detail) {
    ctx.fillStyle = '#b3aa9c';
    ctx.font = '420 24px Outfit, sans-serif';
    ctx.fillText(detail, width / 2, height / 2 + 28);
  }
}

export function paintFrame(ctx, {
  slides,
  imageMap,
  cues,
  time,
  offset = 0,
  scale = 1,
  captionStyle,
  width,
  height,
  smoothing = 'high',
}) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = smoothing;
  ctx.fillStyle = '#090909';
  ctx.fillRect(0, 0, width, height);

  if (!slides?.length) {
    drawMessage(ctx, width, height, 'Lumina', 'Add a voiceover, pictures, and a timeline');
    return;
  }

  const located = locateSlide(slides, time);
  if (!located) return;

  const slide = slides[located.index];
  const source = imageMap?.get(slide.image);
  const fade = Math.min(0.32, located.duration / 3);
  const previous = located.index > 0 ? slides[located.index - 1] : null;
  const fadingIn = previous && located.local < fade && located.local <= located.duration;

  if (fadingIn) {
    const previousSource = imageMap?.get(previous.image);
    if (previousSource) drawEffect(ctx, previousSource, previous.effect, 1, width, height, previous.speed);
    if (source) {
      ctx.globalAlpha = located.local / fade;
      drawEffect(ctx, source, slide.effect, located.progress, width, height, slide.speed);
      ctx.globalAlpha = 1;
    }
  } else if (source) {
    drawEffect(ctx, source, slide.effect, located.progress, width, height, slide.speed);
  } else {
    drawMessage(ctx, width, height, `Missing ${slide.image}`, 'Upload the matching picture, like 1.jpg');
  }

  const cue = cueAt(cues, time, offset);
  if (cue?.text) {
    drawCue(ctx, cue, time - offset, width, height, { scale, ...captionStyle });
  }
}

let fontsPromise;
export function ensureFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      document.fonts.load('700 64px "Noto Naskh Arabic"'),
      document.fonts.load('650 64px Outfit'),
      document.fonts.ready,
    ]).catch(() => undefined);
  }
  return fontsPromise;
}
