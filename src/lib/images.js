import { imageKey } from './timeline.js';

export async function loadImageFile(file) {
  const key = imageKey(file.name);
  if (!key) throw new Error(`${file.name} needs a name like 1.jpg.`);
  const source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const thumbWidth = 280;
  const thumbHeight = Math.max(1, Math.round(source.height * (thumbWidth / source.width)));
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbWidth;
  thumbCanvas.height = thumbHeight;
  const ctx = thumbCanvas.getContext('2d');
  ctx.drawImage(source, 0, 0, thumbWidth, thumbHeight);
  return {
    key,
    name: file.name,
    source,
    file,
    thumb: thumbCanvas.toDataURL('image/jpeg', 0.82),
  };
}
