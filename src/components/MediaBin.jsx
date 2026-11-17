import { useState } from 'react';
import { VOICE_ACCEPT } from '../lib/audio.js';
import { SAMPLE_TIMELINE } from '../lib/constants.js';
import { formatTime, visualDuration } from '../lib/timeline.js';

const SAMPLE_TEXT = JSON.stringify(SAMPLE_TIMELINE, null, 2);

export default function MediaBin({
  audio,
  images,
  slides,
  onFiles,
  onDemo,
  onReset,
  onApplyJson,
  busy,
}) {
  const [jsonText, setJsonText] = useState(SAMPLE_TEXT);
  const visual = visualDuration(slides);
  const delta = audio ? visual - audio.duration : 0;

  return (
    <aside className="bin">
      <div className="bin-head">
        <h2>Media</h2>
        <button type="button" className="text-btn" onClick={onReset} disabled={busy}>Reset</button>
      </div>

      <label className="drop">
        <input
          type="file"
          accept={VOICE_ACCEPT}
          onChange={(event) => {
            onFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <span className="drop-kicker">Voiceover</span>
        <strong>{audio ? audio.name : 'Drop the voice'}</strong>
        <small>{audio ? formatTime(audio.duration) : 'WAV, MPEG, MP3, or M4A'}</small>
      </label>

      <label className="drop">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple
          onChange={(event) => {
            onFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <span className="drop-kicker">Pictures</span>
        <strong>{images.length ? `${images.length} loaded` : 'Name them 1.jpg, 2.jpg'}</strong>
        <small>JPEG, PNG, or WebP</small>
      </label>

      {images.length > 0 && (
        <div className="thumbs">
          {images.map((image) => (
            <figure key={image.key} className="thumb">
              <img src={image.thumb} alt="" />
              <figcaption>{image.key}</figcaption>
            </figure>
          ))}
        </div>
      )}

      <label className="drop">
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            onFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <span className="drop-kicker">Timeline JSON</span>
        <strong>{slides.length ? `${slides.length} slides` : 'image, duration, effect'}</strong>
        <small>
          {slides.length
            ? `Pictures run ${formatTime(visual)}`
            : 'How long each picture stays'}
        </small>
      </label>

      {audio && slides.length > 0 && Math.abs(delta) > 0.25 && (
        <p className="sync-note">
          {delta > 0
            ? `Pictures run ${delta.toFixed(1)}s longer than the voice.`
            : `Voice runs ${Math.abs(delta).toFixed(1)}s longer than the pictures. The last picture will hold.`}
        </p>
      )}

      <label className="paste">
        Paste JSON
        <textarea
          value={jsonText}
          spellCheck={false}
          onChange={(event) => setJsonText(event.target.value)}
        />
      </label>
      <div className="bin-actions">
        <button type="button" onClick={() => onApplyJson(jsonText)} disabled={busy}>Apply JSON</button>
        <button type="button" onClick={onDemo} disabled={busy}>Load demo</button>
      </div>
    </aside>
  );
}
