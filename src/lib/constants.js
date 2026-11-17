export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 60;
export const DEFAULT_MOTION = 0.75;
export const DEFAULT_QUALITY = 'high';

export const EFFECTS = [
  { id: 'zoom-in', label: 'Zoom in', detail: 'Slow push toward the subject' },
  { id: 'zoom-out', label: 'Zoom out', detail: 'Gentle pull back to the full frame' },
  { id: 'pan-left', label: 'Pan left', detail: 'Smooth drift across the picture' },
  { id: 'pan-right', label: 'Pan right', detail: 'Smooth drift the other way' },
  { id: 'ken-burns', label: 'Ken Burns', detail: 'Zoom with a diagonal drift' },
];

export const LANGUAGES = [
  { id: 'auto', label: 'Default · English' },
  { id: 'english', label: 'English' },
  { id: 'urdu', label: 'Urdu' },
  { id: 'hindi', label: 'Hindi' },
  { id: 'arabic', label: 'Arabic' },
  { id: 'punjabi', label: 'Punjabi' },
  { id: 'bengali', label: 'Bengali' },
  { id: 'spanish', label: 'Spanish' },
  { id: 'french', label: 'French' },
  { id: 'german', label: 'German' },
  { id: 'portuguese', label: 'Portuguese' },
  { id: 'turkish', label: 'Turkish' },
  { id: 'indonesian', label: 'Indonesian' },
  { id: 'chinese', label: 'Chinese' },
];

export const QUALITY_PRESETS = {
  compact: {
    label: 'Compact',
    hint: 'Smaller file. Fine lines soften a little',
    quantizer: null,
    videoBitrate: 8_000_000,
    audioBitrate: 128_000,
    mbPerMin: 61,
  },
  balanced: {
    label: 'Balanced',
    hint: 'Clean pictures, moderate file',
    quantizer: 21,
    videoBitrate: 12_000_000,
    audioBitrate: 160_000,
    mbPerMin: 0,
  },
  high: {
    label: 'High',
    hint: 'Matches the pictures, without a bulky file',
    quantizer: 16,
    videoBitrate: 16_000_000,
    audioBitrate: 192_000,
    mbPerMin: 0,
  },
};

export const DEFAULT_CAPTION_STYLE = {
  color: '#fffdf8',
  highlight: '#ffd7a6',
  background: '#070708',
  backgroundOpacity: 0.62,
  shadow: 0.4,
  position: 'bottom',
  place: 1,
};

export const SAMPLE_TIMELINE = {
  slides: [
    { image: '1', duration: 4.5, effect: 'zoom-in' },
    { image: '2', duration: 5.0, effect: 'pan-right' },
    { image: '3', duration: 4.2, effect: 'ken-burns' },
    { image: '4', duration: 3.8, effect: 'zoom-out' },
    { image: '5', duration: 4.6, effect: 'pan-left' },
  ],
};

export function effectLabel(id) {
  return EFFECTS.find((effect) => effect.id === id)?.label || 'Zoom in';
}
