const HALLUCINATIONS = new Set([
  'thanks for watching',
  'thank you for watching',
  'thanks for listening',
  'thank you for listening',
  'please subscribe',
  'please like and subscribe',
  'subtitles by the amaraorg community',
  'subtitles by the amara org community',
  'subtitle by',
  'translated by',
  'music',
  'applause',
  'silence',
]);

function normalizePhrase(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHallucination(text) {
  const phrase = normalizePhrase(text);
  if (!phrase) return true;
  if (HALLUCINATIONS.has(phrase)) return true;
  if (/^(subtitle|subtitles|caption|captions)\b/.test(phrase) && phrase.length < 48) return true;
  return false;
}

export function isRtlText(text) {
  return /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text || '');
}

export function buildCues(chunks) {
  const words = [];
  for (const chunk of chunks || []) {
    const text = String(chunk?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const stamp = chunk.timestamp || [];
    let start = Number(stamp[0]);
    let end = Number(stamp[1]);
    if (!Number.isFinite(start)) continue;
    if (!Number.isFinite(end) || end <= start) end = start + 0.28;
    words.push({ text, start, end });
  }
  words.sort((a, b) => a.start - b.start);

  const cues = [];
  let current = [];

  const flush = () => {
    if (!current.length) return;
    const text = current.map((word) => word.text).join(' ').replace(/\s+/g, ' ').trim();
    if (text && !isHallucination(text)) {
      cues.push({
        id: crypto.randomUUID(),
        start: current[0].start,
        end: current[current.length - 1].end,
        text,
        words: current.map((word) => ({ ...word })),
        edited: false,
      });
    }
    current = [];
  };

  for (const word of words) {
    if (!current.length) {
      current.push(word);
      continue;
    }
    const previous = current[current.length - 1];
    const joined = `${current.map((item) => item.text).join(' ')} ${word.text}`;
    const gap = word.start - previous.end;
    const duration = word.end - current[0].start;
    const sentence = /[.?!۔؟]$/.test(previous.text);
    if (gap > 0.55 || joined.length > 46 || current.length >= 8 || duration > 3.5 || sentence) {
      flush();
    }
    current.push(word);
  }
  flush();

  for (let index = 0; index < cues.length; index += 1) {
    const next = cues[index + 1];
    const padded = cues[index].end + 0.12;
    cues[index].end = next ? Math.min(padded, next.start) : padded;
    if (cues[index].end < cues[index].start) cues[index].end = cues[index].start + 0.2;
  }

  return cues;
}

export function cueAt(cues, time, offset = 0) {
  const t = time - offset;
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    if (t >= cue.start && t <= cue.end) return cue;
  }
  return null;
}

export function applyTranscriptText(cues, text) {
  const lines = String(text || '').split('\n').map((line) => line.replace(/\s+/g, ' ').trim());
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  const next = [];
  lines.forEach((line, index) => {
    if (!line) return;
    const cue = cues[index];
    if (cue && line === cue.text) {
      next.push(cue);
      return;
    }
    if (cue) {
      next.push({ ...cue, text: line, edited: true, words: retimedWords(cue, line) });
      return;
    }
    const previous = next[next.length - 1];
    const start = previous ? previous.end : 0;
    const created = {
      id: crypto.randomUUID(),
      start,
      end: start + 2,
      text: line,
      edited: true,
      words: [],
    };
    created.words = retimedWords(created, line);
    next.push(created);
  });
  return next;
}

export function retimedWords(cue, text) {
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const span = Math.max(0.05, (cue.end - cue.start) / parts.length);
  return parts.map((word, index) => ({
    text: word,
    start: cue.start + span * index,
    end: cue.start + span * (index + 1),
  }));
}
