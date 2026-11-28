import {
  AudioBufferSource,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import { applyVoiceGain, trimAudioBuffer } from './audio.js';
import { createChunkedBytes } from './chunkedFile.js';
import { mixShukkk } from './sfx.js';
import { FPS, HEIGHT, QUALITY_PRESETS, WIDTH } from './constants.js';
import { paintFrame, prepareExportSources } from './render.js';
import { locateSlide, projectDuration } from './timeline.js';

function abortError() {
  return new DOMException('Export cancelled', 'AbortError');
}

function makeCanvas(width, height) {
  const open = (canvas, colorSpace) => {
    try {
      const ctx = canvas.getContext('2d', colorSpace ? { alpha: false, colorSpace } : { alpha: false });
      return ctx ? { canvas, ctx } : null;
    } catch {
      return null;
    }
  };
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const made = open(canvas, 'srgb') || open(canvas, '');
    if (made) return made;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return open(canvas, 'srgb') || open(canvas, '');
}

async function encodePass({
  slides,
  imageMap,
  cues,
  audioBuffer,
  voiceGain,
  offset,
  scale,
  captionStyle,
  bitrateMode,
  videoBitrate,
  audioBitrate,
  previewCanvas,
  onProgress,
  isAborted,
  markStarted,
}) {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('This browser cannot encode video. Open Lumina in Chrome or Edge.');
  }

  const duration = projectDuration(slides, audioBuffer?.duration || 0);
  const frames = Math.max(1, Math.round(duration * FPS));
  const supports = async (options) => {
    try {
      return await canEncodeVideo('avc', options);
    } catch {
      return false;
    }
  };
  const capped = {
    width: WIDTH,
    height: HEIGHT,
    frameRate: FPS,
    quality: new Quality({ bitrate: videoBitrate, bitrateMode: 'constant' }),
    hardwareAcceleration: 'prefer-hardware',
    latencyMode: 'quality',
    contentHint: 'detail',
  };
  const cpuBits = {
    ...capped,
    hardwareAcceleration: 'prefer-software',
  };
  let videoOptions = null;
  if (await supports(capped)) videoOptions = capped;
  else if (await supports(cpuBits)) videoOptions = cpuBits;
  if (!videoOptions) {
    throw new Error('H.264 encoding is not available here. Open Lumina in Chrome or Edge to export MP4.');
  }
  const videoQuality = videoOptions.quality;
  const usingGpu = videoOptions.hardwareAcceleration === 'prefer-hardware';

  const audioQuality = new Quality({ bitrate: audioBitrate, bitrateMode: 'constant' });
  if (audioBuffer) {
    const audioReady = await canEncodeAudio('aac', {
      numberOfChannels: 2,
      sampleRate: 48000,
      quality: audioQuality,
    });
    if (!audioReady) throw new Error('AAC audio encoding is not available in this browser.');
  }

  const { canvas, ctx } = makeCanvas(WIDTH, HEIGHT);
  if (!ctx) throw new Error('Could not start the frame renderer.');

  // Piecewise storage: one ArrayBuffer cannot be turned into a Blob past 2GB,
  // and the in-memory target also stops at 4GB after the frames are already encoded.
  const file = createChunkedBytes();
  const target = new StreamTarget(new WritableStream({
    write(chunk) {
      file.write(chunk.data, chunk.position);
    },
  }));
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target,
  });

  const videoSource = new CanvasSource(canvas, {
    codec: 'avc',
    quality: videoQuality,
    hardwareAcceleration: videoOptions.hardwareAcceleration,
    latencyMode: videoOptions.latencyMode,
    contentHint: 'detail',
    keyFrameInterval: 10,
    alpha: 'discard',
  });
  output.addVideoTrack(videoSource, { frameRate: FPS });

  let audioSource = null;
  if (audioBuffer) {
    audioSource = new AudioBufferSource({
      codec: 'aac',
      quality: audioQuality,
      transform: { numberOfChannels: 2, sampleRate: 48000 },
    });
    output.addAudioTrack(audioSource);
  }

  let lock;
  try {
    lock = await navigator.wakeLock?.request('screen');
  } catch {
    lock = null;
  }

  try {
    await output.start();
    if (isAborted()) {
      await output.cancel();
      throw abortError();
    }

    if (audioSource) {
      onProgress?.(0, 'Encoding the voiceover');
      const trimmed = await trimAudioBuffer(applyVoiceGain(mixShukkk(audioBuffer, slides), voiceGain), duration);
      await audioSource.add(trimmed);
    }

    onProgress?.(0, 'Preparing the pictures');
    const prepared = await prepareExportSources(imageMap, WIDTH, HEIGHT);
    markStarted?.();
    const previewCtx = previewCanvas?.getContext('2d');
    let previousImage = '';
    try {
      for (let index = 0; index < frames; index += 1) {
        if (isAborted()) {
          await output.cancel();
          throw abortError();
        }
        const time = index / FPS;
        paintFrame(ctx, {
          slides,
          imageMap: prepared.imageMap,
          cues,
          time,
          offset,
          scale,
          captionStyle,
          width: WIDTH,
          height: HEIGHT,
          smoothing: 'medium',
        });
        if (previewCtx && (index % 6 === 0 || index === frames - 1)) {
          previewCtx.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
        }
        const image = slides[locateSlide(slides, time)?.index]?.image || '';
        const cut = image !== previousImage;
        previousImage = image;
        await videoSource.add(time, 1 / FPS, cut ? { keyFrame: true } : undefined);
        if (index % 8 === 0 || index === frames - 1) {
          onProgress?.(
            (index + 1) / frames,
            usingGpu ? `GPU · frame ${index + 1} of ${frames}` : `Frame ${index + 1} of ${frames}`,
          );
        }
      }
    } finally {
      prepared.release();
    }

    onProgress?.(1, 'Wrapping the MP4');
    await output.finalize();
    if (!file.size) throw new Error('The encoder finished without a file.');
    const blob = file.toBlob('video/mp4');
    return {
      url: URL.createObjectURL(blob),
      size: file.size,
      frames,
    };
  } catch (error) {
    try { await output.cancel(); } catch { /* already closed */ }
    throw error;
  } finally {
    try { await lock?.release(); } catch { /* ignore */ }
  }
}

export function startExport(options) {
  let aborted = false;
  const preset = QUALITY_PRESETS[options.quality] || QUALITY_PRESETS.high;
  const shared = {
    ...options,
    videoBitrate: preset.videoBitrate,
    audioBitrate: preset.audioBitrate,
    isAborted: () => aborted,
  };

  const promise = (async () => {
    let started = false;
    try {
      return await encodePass({
        ...shared,
        bitrateMode: 'variable',
        markStarted: () => { started = true; },
      });
    } catch (error) {
      if (aborted || started || error?.name === 'AbortError') throw error;
      return encodePass({ ...shared, bitrateMode: 'constant' });
    }
  })();

  return {
    promise,
    cancel() {
      aborted = true;
    },
  };
}
