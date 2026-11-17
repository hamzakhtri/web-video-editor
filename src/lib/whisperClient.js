let worker;
let readyPromise;
const listeners = new Set();
const state = {
  status: 'idle',
  progress: 0,
  device: '',
  error: '',
  detail: 'Whisper Small',
  phase: 'download',
  listenProgress: null,
  listenLabel: '',
};

let pending = null;

function snapshot() {
  return { ...state };
}

function emit() {
  const next = snapshot();
  [...listeners].forEach((listener) => listener(next));
}

function ensureWorker() {
  if (worker) return;
  worker = new Worker(new URL('../workers/whisper.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => {
    const message = event.data || {};
    if (message.type === 'progress') {
      state.status = 'downloading';
      state.progress = message.progress || 0;
      state.detail = message.file || 'Whisper Small';
      state.phase = message.phase || (state.progress >= 99 ? 'start' : 'download');
      state.error = '';
      emit();
      return;
    }
    if (message.type === 'listen') {
      state.listenProgress = message.progress || 0;
      state.listenLabel = message.label || 'Listening to the voice…';
      emit();
      return;
    }
    if (message.type === 'ready') {
      state.status = 'ready';
      state.progress = 100;
      state.device = message.device || 'CPU';
      state.detail = 'Whisper Small';
      state.error = '';
      if (message.gpu) {
        try {
          localStorage.setItem('lumina-whisper-gpu', message.gpu);
        } catch {
          /* private mode */
        }
      }
      emit();
      return;
    }
    if (message.type === 'result') {
      state.listenProgress = null;
      state.listenLabel = '';
      emit();
      pending?.resolve(message);
      pending = null;
      return;
    }
    if (message.type === 'error') {
      const error = new Error(message.message || 'Whisper failed.');
      state.listenProgress = null;
      state.listenLabel = '';
      if (pending) {
        pending.reject(error);
        pending = null;
        emit();
        return;
      }
      state.status = 'error';
      state.error = error.message;
      emit();
    }
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'The Whisper worker crashed.');
    state.status = 'error';
    state.error = error.message;
    emit();
    pending?.reject(error);
    pending = null;
  };
}

export function subscribeWhisper(listener) {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function preloadWhisper() {
  if (!readyPromise) {
    ensureWorker();
    state.status = 'downloading';
    state.detail = 'Whisper Small';
    emit();
    readyPromise = new Promise((resolve, reject) => {
      const stop = subscribeWhisper((next) => {
        if (next.status === 'ready') {
          stop();
          resolve(next);
        } else if (next.status === 'error') {
          stop();
          readyPromise = null;
          reject(new Error(next.error || 'Whisper failed to load.'));
        }
      });
      let prefer = null;
      try {
        prefer = localStorage.getItem('lumina-whisper-gpu');
      } catch {
        prefer = null;
      }
      if (prefer === 'ok') prefer = null;
      worker.postMessage({ type: 'load', prefer });
    });
  }
  return readyPromise;
}

export async function transcribeAudio(samples, language) {
  await preloadWhisper();
  if (pending) throw new Error('A transcription is already running.');
  ensureWorker();
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    worker.postMessage(
      { type: 'transcribe', samples, language: language || null },
      [samples.buffer],
    );
  });
}
