import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';

const VOICE_EXTENSIONS = ['mp3', 'wav', 'wave', 'mpeg', 'mpg', 'mp2', 'mpa', 'm4a', 'aac', 'ogg', 'flac', 'webm'];

export const VOICE_ACCEPT = ['audio/*', 'audio/mpeg', 'video/mpeg', ...VOICE_EXTENSIONS.map((ext) => `.${ext}`)].join(',');

const VOICE_EXT = new RegExp(`\\.(${VOICE_EXTENSIONS.join('|')})$`, 'i');

export function isVoiceFile(file) {
  const type = (file.type || '').toLowerCase();
  if (VOICE_EXT.test(file.name || '')) return true;
  if (type.startsWith('audio/')) return true;
  return type === 'video/mpeg' || type === 'video/mpg';
}

async function decodeWithWebAudio(blob) {
  const copy = await blob.arrayBuffer();
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(copy);
  } finally {
    await context.close();
  }
}

function readU16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function nextStartCode(bytes, from) {
  for (let index = from; index + 3 < bytes.length; index += 1) {
    if (bytes[index] === 0 && bytes[index + 1] === 0 && bytes[index + 2] === 1) return index;
  }
  return bytes.length;
}

function takePesPayload(bytes, start, end) {
  let payload = start;
  if (payload + 3 <= end && (bytes[payload] & 0xc0) === 0x80) {
    payload += 3 + bytes[payload + 2];
    return payload < end ? bytes.subarray(payload, end) : null;
  }
  while (payload < end && bytes[payload] === 0xff) payload += 1;
  if (payload + 1 < end && (bytes[payload] & 0xc0) === 0x40) payload += 2;
  if (payload < end && (bytes[payload] & 0xf0) === 0x20) payload += 5;
  else if (payload < end && (bytes[payload] & 0xf0) === 0x30) payload += 10;
  else if (payload < end && bytes[payload] === 0x0f) payload += 1;
  return payload < end ? bytes.subarray(payload, end) : null;
}

function extractMpegAudio(bytes) {
  if (bytes.length < 16 || bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1) return null;
  const first = bytes[3];
  if (first !== 0xba && (first < 0xc0 || first > 0xdf)) return null;

  const chunks = [];
  let total = 0;
  let audioId = 0;
  let index = 0;
  while (index + 6 < bytes.length) {
    if (bytes[index] !== 0 || bytes[index + 1] !== 0 || bytes[index + 2] !== 1) {
      index = nextStartCode(bytes, index + 1);
      continue;
    }
    const id = bytes[index + 3];
    if (id === 0xb9) break;
    if (id === 0xba) {
      const marker = bytes[index + 4] || 0;
      if ((marker & 0xc0) === 0x40) {
        if (index + 14 > bytes.length) break;
        index += 14 + (bytes[index + 13] & 7);
      } else {
        index += 12;
      }
      continue;
    }
    const size = readU16(bytes, index + 4);
    const start = index + 6;
    const end = size === 0 ? nextStartCode(bytes, start) : Math.min(bytes.length, start + size);
    if (id >= 0xc0 && id <= 0xdf) {
      if (!audioId) audioId = id;
      if (id === audioId) {
        const payload = takePesPayload(bytes, start, end);
        if (payload?.length) {
          chunks.push(payload);
          total += payload.length;
        }
      }
    }
    index = end;
  }
  if (!total) return null;
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
}

async function concatBuffers(pieces) {
  const rate = pieces[0].sampleRate;
  const channels = Math.max(...pieces.map((piece) => piece.numberOfChannels));
  const normalized = [];
  for (const piece of pieces) {
    if (piece.sampleRate === rate && piece.numberOfChannels === channels) {
      normalized.push(piece);
      continue;
    }
    const offline = new OfflineAudioContext(channels, Math.max(1, Math.ceil(piece.duration * rate)), rate);
    const source = offline.createBufferSource();
    source.buffer = piece;
    source.connect(offline.destination);
    source.start(0);
    normalized.push(await offline.startRendering());
  }
  if (normalized.length === 1) return normalized[0];
  const length = normalized.reduce((sum, piece) => sum + piece.length, 0);
  const out = new AudioBuffer({ length, numberOfChannels: channels, sampleRate: rate });
  let offset = 0;
  for (const piece of normalized) {
    for (let channel = 0; channel < channels; channel += 1) {
      out.getChannelData(channel).set(piece.getChannelData(Math.min(channel, piece.numberOfChannels - 1)), offset);
    }
    offset += piece.length;
  }
  return out;
}

async function decodeWithMediabunny(file) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (!(await input.canRead())) return null;
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const pieces = [];
    for await (const wrapped of new AudioBufferSink(track).buffers()) {
      if (wrapped?.buffer?.length) pieces.push(wrapped.buffer);
    }
    return pieces.length ? concatBuffers(pieces) : null;
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

export async function decodeAudioFile(file) {
  try {
    return await decodeWithWebAudio(file);
  } catch {
    // WAV and plain MPEG audio usually stop here. Containers need the fallbacks below.
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const audio = extractMpegAudio(bytes);
    if (audio) return await decodeWithWebAudio(new Blob([audio], { type: 'audio/mpeg' }));
  } catch {
    // Not an MPEG program stream, or the audio inside it is not one this browser decodes.
  }

  const decoded = await decodeWithMediabunny(file);
  if (decoded) return decoded;
  throw new Error(`Could not read ${file.name || 'this audio'}.`);
}

export function audioBufferToWavBlob(buffer) {
  const channels = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const length = buffer.length;
  const blockAlign = channels * 2;
  const dataSize = length * blockAlign;
  const array = new ArrayBuffer(44 + dataSize);
  const view = new DataView(array);
  const write = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, dataSize, true);

  const data = [];
  for (let channel = 0; channel < channels; channel += 1) data.push(buffer.getChannelData(channel));
  let offset = 44;
  for (let index = 0; index < length; index += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, data[channel][index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([array], { type: 'audio/wav' });
}

function normalizePeak(samples) {
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.abs(samples[index]);
    if (value > peak) peak = value;
  }
  if (peak < 0.015 || peak > 0.92) return samples;
  const gain = Math.min(0.92 / peak, 8);
  const out = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    out[index] = Math.max(-1, Math.min(1, samples[index] * gain));
  }
  return out;
}

export async function voiceToWhisperSamples(buffer) {
  const rate = 16000;
  const length = Math.max(1, Math.ceil(buffer.duration * rate));
  const offline = new OfflineAudioContext(1, length, rate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  const copy = new Float32Array(rendered.getChannelData(0));
  return normalizePeak(copy);
}

export async function trimAudioBuffer(buffer, seconds) {
  const frames = Math.min(buffer.length, Math.max(1, Math.floor(seconds * buffer.sampleRate)));
  if (frames >= buffer.length - 1) return buffer;
  const offline = new OfflineAudioContext(buffer.numberOfChannels, frames, buffer.sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}
