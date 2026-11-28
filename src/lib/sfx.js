import { slideStarts } from './timeline.js';

const LEVEL = 0.7;

export function makeShukkk(sampleRate = 48000) {
  const length = Math.max(1, Math.floor(sampleRate * 0.42));
  const buffer = new AudioBuffer({ length, numberOfChannels: 1, sampleRate });
  const data = buffer.getChannelData(0);
  let color = 0;
  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    const env = Math.min(1, t / 0.008) * Math.exp(-t * 9.5);
    const keep = 0.5 + 0.42 * Math.exp(-t * 7);
    color = color * keep + (Math.random() * 2 - 1) * (1 - keep);
    const tone = Math.sin(2 * Math.PI * (160 + 1500 * Math.exp(-t * 14)) * t);
    data[index] = (color * 0.9 + tone * 0.3) * env;
  }
  return buffer;
}

export function mixShukkk(voice, slides) {
  if (!voice || !slides?.length) return voice;
  const starts = slideStarts(slides);
  const hits = [];
  slides.forEach((slide, index) => {
    if (slide?.sound === 'shukkk') hits.push(starts[index]);
  });
  if (!hits.length) return voice;
  const sound = makeShukkk(voice.sampleRate);
  const out = new AudioBuffer({
    length: voice.length,
    numberOfChannels: voice.numberOfChannels,
    sampleRate: voice.sampleRate,
  });
  for (let channel = 0; channel < voice.numberOfChannels; channel += 1) {
    out.getChannelData(channel).set(voice.getChannelData(channel));
  }
  const fx = sound.getChannelData(0);
  hits.forEach((start) => {
    const offset = Math.floor(Math.max(0, start) * voice.sampleRate);
    if (offset >= voice.length) return;
    for (let channel = 0; channel < out.numberOfChannels; channel += 1) {
      const dst = out.getChannelData(channel);
      const count = Math.min(fx.length, dst.length - offset);
      for (let index = 0; index < count; index += 1) {
        const sample = dst[offset + index] + fx[index] * LEVEL;
        dst[offset + index] = sample > 1 ? 1 : sample < -1 ? -1 : sample;
      }
    }
  });
  return out;
}
