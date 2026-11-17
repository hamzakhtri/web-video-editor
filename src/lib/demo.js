import { audioBufferToWavBlob } from './audio.js';
import { EFFECTS } from './constants.js';

function canvasOf(paint) {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  paint(ctx, canvas.width, canvas.height);
  return canvas;
}

function hill(ctx, color, y, amplitude, steps) {
  ctx.beginPath();
  ctx.moveTo(0, 1080);
  for (let index = 0; index <= steps; index += 1) {
    const x = (1920 / steps) * index;
    const wave = Math.sin(index * 0.55) * amplitude + Math.sin(index * 0.2) * amplitude * 0.35;
    ctx.lineTo(x, y + wave);
  }
  ctx.lineTo(1920, 1080);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function sceneDusk(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, 1080);
  sky.addColorStop(0, '#24324a');
  sky.addColorStop(0.45, '#d58562');
  sky.addColorStop(1, '#f0c38a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1920, 1080);
  const sun = ctx.createRadialGradient(1280, 620, 20, 1280, 620, 220);
  sun.addColorStop(0, '#fff4d8');
  sun.addColorStop(1, 'rgba(255, 244, 216, 0)');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(1280, 620, 220, 0, Math.PI * 2);
  ctx.fill();
  hill(ctx, '#7a3f45', 760, 36, 18);
  hill(ctx, '#3d2a33', 860, 28, 14);
  hill(ctx, '#1b1718', 980, 18, 10);
}

function sceneWindow(ctx) {
  ctx.fillStyle = '#1a1816';
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.fillStyle = '#2a2622';
  ctx.fillRect(180, 80, 1560, 920);
  const light = ctx.createLinearGradient(0, 140, 0, 860);
  light.addColorStop(0, '#f4e2c2');
  light.addColorStop(1, '#e7b07a');
  ctx.fillStyle = light;
  ctx.fillRect(430, 160, 760, 760);
  ctx.fillStyle = 'rgba(28, 24, 20, 0.28)';
  ctx.fillRect(800, 160, 18, 760);
  ctx.fillRect(430, 520, 760, 18);
  ctx.fillStyle = '#142018';
  ctx.beginPath();
  ctx.moveTo(1320, 980);
  ctx.quadraticCurveTo(1500, 620, 1680, 980);
  ctx.fill();
  ctx.fillStyle = '#0e1411';
  ctx.fillRect(1180, 760, 28, 220);
}

function sceneCoast(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, 640);
  sky.addColorStop(0, '#0d1528');
  sky.addColorStop(1, '#1d3c58');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1920, 640);
  ctx.fillStyle = '#071018';
  ctx.fillRect(0, 640, 1920, 440);
  ctx.fillStyle = '#f4efe4';
  ctx.beginPath();
  ctx.arc(1460, 210, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0d1528';
  ctx.beginPath();
  ctx.arc(1492, 196, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(214, 228, 232, 0.35)';
  ctx.lineWidth = 2;
  for (let index = 0; index < 5; index += 1) {
    ctx.beginPath();
    ctx.moveTo(180, 760 + index * 48);
    ctx.bezierCurveTo(620, 730 + index * 48, 1100, 800 + index * 40, 1760, 750 + index * 36);
    ctx.stroke();
  }
}

function scenePaper(ctx) {
  const paper = ctx.createLinearGradient(0, 0, 1920, 1080);
  paper.addColorStop(0, '#efe4d4');
  paper.addColorStop(1, '#d7c3a4');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.fillStyle = '#b4543c';
  ctx.beginPath();
  ctx.arc(620, 540, 210, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b241c';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(980, 260);
  ctx.lineTo(1500, 820);
  ctx.moveTo(1500, 280);
  ctx.lineTo(1040, 800);
  ctx.stroke();
}

async function demoAudio(duration) {
  const rate = 48000;
  const context = new OfflineAudioContext(2, Math.floor(rate * duration), rate);
  const master = context.createGain();
  master.gain.value = 0.16;
  master.connect(context.destination);
  [196, 247, 294, 392].forEach((frequency, index) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = index % 2 ? 'sine' : 'triangle';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, 0.05);
    gain.gain.exponentialRampToValueAtTime(0.35, 1.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, duration - 0.05);
    osc.connect(gain);
    gain.connect(master);
    osc.start(0);
    osc.stop(duration);
  });
  return context.startRendering();
}

export async function createDemoProject() {
  const painters = [sceneDusk, sceneWindow, sceneCoast, scenePaper];
  const images = painters.map((paint, index) => {
    const source = canvasOf(paint);
    return {
      key: String(index + 1),
      name: `${index + 1}.jpg`,
      source,
      thumb: source.toDataURL('image/jpeg', 0.72),
    };
  });
  const slides = [
    { id: crypto.randomUUID(), image: '1', duration: 3, effect: EFFECTS[0].id },
    { id: crypto.randomUUID(), image: '2', duration: 3, effect: EFFECTS[3].id },
    { id: crypto.randomUUID(), image: '3', duration: 3, effect: EFFECTS[4].id },
    { id: crypto.randomUUID(), image: '4', duration: 3, effect: EFFECTS[1].id },
  ];
  const buffer = await demoAudio(12);
  const url = URL.createObjectURL(audioBufferToWavBlob(buffer));
  const cues = [
    { id: crypto.randomUUID(), start: 0.3, end: 2.7, text: 'Four stills. One voice. No server.', edited: false },
    { id: crypto.randomUUID(), start: 3.2, end: 5.7, text: 'Zoom, pan, and Ken Burns, rendered here.', edited: false },
    { id: crypto.randomUUID(), start: 6.1, end: 8.6, text: 'Captions stay locked to the voice.', edited: false },
    { id: crypto.randomUUID(), start: 9.0, end: 11.6, text: 'Then export a 1080p 60fps MP4.', edited: false },
  ].map((cue) => ({
    ...cue,
    words: cue.text.split(' ').map((text, index, all) => {
      const span = (cue.end - cue.start) / all.length;
      return { text, start: cue.start + span * index, end: cue.start + span * (index + 1) };
    }),
  }));
  return {
    images,
    slides,
    audio: { name: 'Demo voice.wav', url, buffer, duration: buffer.duration },
    cues,
  };
}
