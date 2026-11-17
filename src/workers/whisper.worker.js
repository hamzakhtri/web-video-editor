import { env, pipeline } from '@huggingface/transformers';

const MODEL = 'onnx-community/whisper-small';
const FALLBACK_MODEL = 'Xenova/whisper-small';

env.allowLocalModels = false;
env.useBrowserCache = true;
if (!self.crossOriginIsolated) {
  env.backends.onnx.wasm.numThreads = 1;
} else {
  env.backends.onnx.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 1);
}

let transcriber = null;
const downloads = new Map();

function report(update) {
  const file = update?.file || update?.name || 'Whisper';
  const current = downloads.get(file) || { loaded: 0, total: 0, progress: 0 };
  if (update?.total) {
    current.total = update.total;
    current.loaded = update.loaded || current.loaded;
  }
  if (typeof update?.progress === 'number') current.progress = update.progress;
  if (update?.status === 'done' || update?.status === 'ready') {
    current.progress = 100;
    if (current.total) current.loaded = current.total;
  }
  downloads.set(file, current);

  const files = [...downloads.values()];
  const measured = files.filter((item) => item.total > 0);
  let progress = 0;
  if (measured.length) {
    const loaded = measured.reduce((sum, item) => sum + item.loaded, 0);
    const total = measured.reduce((sum, item) => sum + item.total, 0);
    progress = total ? (loaded / total) * 100 : 0;
  } else if (files.length) {
    progress = files.reduce((sum, item) => sum + item.progress, 0) / files.length;
  }
  self.postMessage({
    type: 'progress',
    progress: Math.max(0, Math.min(100, progress)),
    file,
    phase: progress >= 99 ? 'start' : 'download',
    status: update?.status || 'progress',
  });
}

async function hasWebGPU() {
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function loadModel(prefer) {
  if (transcriber) return transcriber.device;
  const attempts = [];
  if (prefer !== 'skip' && await hasWebGPU()) {
    if (prefer !== 'q8') attempts.push({ model: MODEL, device: 'webgpu', dtype: 'fp16', label: 'GPU' });
    attempts.push({ model: MODEL, device: 'webgpu', dtype: 'q8', label: 'GPU' });
  }
  attempts.push({ model: MODEL, device: 'wasm', dtype: 'q8', label: 'CPU' });
  attempts.push({ model: FALLBACK_MODEL, device: 'wasm', dtype: 'q8', label: 'CPU' });

  let lastError = null;
  for (const attempt of attempts) {
    downloads.clear();
    try {
      self.postMessage({
        type: 'progress',
        progress: 0,
        file: attempt.label === 'GPU' ? 'Whisper Small on GPU' : 'Whisper Small',
        status: 'initiate',
      });
      const model = await pipeline('automatic-speech-recognition', attempt.model, {
        device: attempt.device,
        dtype: attempt.dtype,
        progress_callback: report,
      });
      transcriber = {
        model,
        device: attempt.label,
        gpu: attempt.label === 'GPU' ? attempt.dtype : 'skip',
      };
      self.postMessage({
        type: 'progress',
        progress: 100,
        file: 'Starting Whisper',
        phase: 'start',
        status: 'ready',
      });
      return attempt.label;
    } catch (error) {
      lastError = error;
      transcriber = null;
    }
  }
  throw lastError || new Error('Whisper could not start on this computer.');
}

function wordsFromChunks(chunks, shift) {
  const words = [];
  for (const chunk of chunks || []) {
    const text = String(chunk?.text || '').replace(/\s+/g, ' ').trim();
    const stamp = chunk?.timestamp || [];
    let start = Number(stamp[0]);
    let end = Number(stamp[1]);
    if (!text || !Number.isFinite(start)) continue;
    if (!Number.isFinite(end) || end <= start) end = start + Math.max(0.2, text.length * 0.04);
    const parts = text.split(' ').filter(Boolean);
    const weights = parts.map((part) => Math.max(1, part.length));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const span = end - start;
    let cursor = start;
    parts.forEach((part, index) => {
      const duration = span * (weights[index] / total);
      words.push({
        text: part,
        timestamp: [cursor + shift, cursor + duration + shift],
      });
      cursor += duration;
    });
  }
  return words;
}

self.onmessage = async (event) => {
  const message = event.data;
  try {
    if (message.type === 'load') {
      const device = await loadModel(message.prefer || null);
      self.postMessage({ type: 'ready', device, gpu: transcriber.gpu });
      return;
    }

    if (message.type === 'transcribe') {
      if (!transcriber) await loadModel();
      const options = {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
        task: 'transcribe',
        temperature: 0,
      };
      if (message.language) options.language = message.language;
      let progress = 0.05;
      self.postMessage({
        type: 'listen',
        progress,
        label: 'Listening to the voice…',
      });
      const pulse = setInterval(() => {
        progress = Math.min(0.92, progress + 0.07);
        self.postMessage({
          type: 'listen',
          progress,
          label: 'Listening to the voice…',
        });
      }, 800);
      try {
        const output = await transcriber.model(message.samples, options);
        const chunks = wordsFromChunks(output?.chunks, 0);
        self.postMessage({
          type: 'result',
          text: chunks.map((chunk) => chunk.text).join(' ').trim(),
          chunks,
        });
      } finally {
        clearInterval(pulse);
      }
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error?.message || 'Whisper failed.',
    });
  }
};
