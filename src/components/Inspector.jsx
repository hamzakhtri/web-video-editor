import { useEffect, useRef, useState } from 'react';
import { DEFAULT_MOTION, LANGUAGES, QUALITY_PRESETS } from '../lib/constants.js';
import { formatTime } from '../lib/timeline.js';
import EditDialog from './EditDialog.jsx';

function Pencil() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4L18.2 9.8a2.1 2.1 0 0 0 0-3L17.2 5a2.1 2.1 0 0 0-3 0L4 15.2V20z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12.6 6.6l4.8 4.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 16H5.5A1.5 1.5 0 0 1 4 14.5v-9A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export default function Inspector({
  slide,
  slideIndex,
  slideCount,
  images,
  cues,
  language,
  quality,
  captionOffset,
  captionScale,
  captionStyle,
  duration,
  busy,
  canFit,
  listening,
  onLanguage,
  onQuality,
  onOffset,
  onScale,
  onChangeSlide,
  onMove,
  onRemove,
  onAdd,
  onFit,
  onTranscribe,
  onCopyTranscript,
  onCaptionStyle,
  onBeginEdit,
  onEndEdit,
  onEditCue,
  onRemoveCue,
  onSeek,
  onSetTranscript,
}) {
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('home');
  const [lookOpen, setLookOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const transcript = cues.map((cue) => cue.text).join('\n');
  useEffect(() => {
    setDraft(null);
  }, [transcript]);
  useEffect(() => {
    panelRef.current?.scrollTo(0, 0);
  }, [view]);

  const transcriptValue = draft ?? transcript;
  const transcriptDirty = transcriptValue !== transcript;
  const place = Number.isFinite(captionStyle?.place) ? captionStyle.place : 1;
  const thumb = slide ? images.find((image) => image.key === slide.image) : null;
  const percent = Math.round((listening?.progress || 0) * 100);
  const sliding = !listening || listening.progress < 0.02;
  const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.high;
  const estimate = duration > 0 && preset.mbPerMin ? (duration / 60) * preset.mbPerMin : 0;

  const back = (
    <button type="button" className="text-btn back" onClick={() => setView('home')}>← Back</button>
  );

  return (
    <aside className="inspector" ref={panelRef}>
      {view === 'home' && (
        <>
          <div className="panel-head">
            <h2>{slide ? `Slide ${slideIndex + 1}` : 'Picture'}</h2>
            <button type="button" className="icon pencil" onClick={() => setOpen(true)} aria-label="Edit this slide" title="Edit this slide">
              <Pencil />
            </button>
          </div>
          {slide ? (
            <div className={`mini effect-${slide.effect}`}>
              {thumb ? (
                <img
                  src={thumb.thumb}
                  alt=""
                  style={{ animationDuration: `${Math.max(3.5, (12 * DEFAULT_MOTION) / (slide.speed || DEFAULT_MOTION)).toFixed(1)}s` }}
                />
              ) : <span>{slide.image}</span>}
              <button type="button" className="pencil-float" onClick={() => setOpen(true)} aria-label="Edit this slide">
                <Pencil />
              </button>
            </div>
          ) : (
            <p className="quiet">Select a slide on the timeline.</p>
          )}
          {slide && <p className="quiet">{slide.image} · {slide.duration}s · pencil edits this slide only</p>}
          <button type="button" className="ghost" onClick={onAdd} disabled={!images.length || busy}>Add slide</button>

          <div className="nav-rows">
            <button type="button" onClick={() => setView('captions')}>
              <span>Captions</span>
              <small>{listening ? 'Listening…' : cues.length ? `${cues.length} lines` : 'Words, position, and look'}</small>
            </button>
            <button type="button" onClick={() => setView('export')}>
              <span>Export</span>
              <small>{preset.label} · whole video</small>
            </button>
          </div>
        </>
      )}

      {view === 'captions' && (
        <>
          {back}
          <div className="panel-head">
            <h2>Captions</h2>
            <button type="button" className="icon copy" onClick={onCopyTranscript} disabled={!cues.length} aria-label="Copy transcript JSON" title="Copy transcript JSON">
              <CopyIcon />
            </button>
          </div>
          <label>
            Spoken language
            <select value={language} onChange={(event) => onLanguage(event.target.value)}>
              {LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <small>Pick the language being spoken. The default listens in English.</small>
          </label>
          <div className="row-actions">
            <button type="button" onClick={onTranscribe} disabled={busy}>Transcribe again</button>
            <button type="button" onClick={onFit} disabled={!canFit || busy}>Match voice length</button>
          </div>
          {listening && (
            <div className="listen">
              <p>{listening.label || 'Listening to the voice…'}</p>
              <div className={`bar${sliding ? ' starting' : ''}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
                <span style={sliding ? undefined : { width: `${percent}%` }} />
              </div>
              {!sliding && <p className="quiet">{percent}%</p>}
            </div>
          )}
          <div className="transcript">
            <p className="quiet">One line is one caption. Fix any wrong words, then set them on the video.</p>
            <textarea
              value={transcriptValue}
              placeholder="Captions appear here after the voice is heard."
              aria-label="Transcript"
              spellCheck={false}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              type="button"
              className="ghost"
              disabled={!transcriptDirty || busy}
              onClick={() => onSetTranscript(transcriptValue)}
            >
              Set transcript
            </button>
          </div>
          <div className="cues">
            {cues.length === 0 && !listening && <p className="quiet">Captions appear here as soon as the voice is added.</p>}
            {cues.map((cue) => (
              <div key={cue.id} className="cue">
                <button type="button" className="cue-time" onClick={() => onSeek(cue.start)}>
                  {formatTime(cue.start)}
                </button>
                <input
                  value={cue.text}
                  onFocus={onBeginEdit}
                  onBlur={onEndEdit}
                  onChange={(event) => onEditCue(cue.id, event.target.value)}
                  aria-label={`Caption at ${formatTime(cue.start)}`}
                />
                <button type="button" className="icon" onClick={() => onRemoveCue(cue.id)} aria-label="Remove caption">×</button>
              </div>
            ))}
          </div>

          <button type="button" className="ghost" onClick={() => setLookOpen((current) => !current)}>
            {lookOpen ? 'Hide look' : 'Show look'}
          </button>
          {lookOpen && (
            <div className="fold">
              <label>
                Position
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  aria-label="Caption position"
                  value={place}
                  onPointerDown={onBeginEdit}
                  onPointerUp={onEndEdit}
                  onBlur={onEndEdit}
                  onChange={(event) => onCaptionStyle({ place: Number(event.target.value) })}
                />
                <small>{place < 0.34 ? 'Top' : place > 0.66 ? 'Bottom' : 'Between'}</small>
              </label>
              <label>
                Caption delay
                <input
                  type="range"
                  min="-0.6"
                  max="0.6"
                  step="0.02"
                  value={captionOffset}
                  onPointerDown={onBeginEdit}
                  onPointerUp={onEndEdit}
                  onBlur={onEndEdit}
                  onChange={(event) => onOffset(Number(event.target.value))}
                />
                <small>{captionOffset > 0 ? 'Later' : captionOffset < 0 ? 'Earlier' : 'On the word'} · {captionOffset.toFixed(2)}s</small>
              </label>
              <label>
                Caption size
                <input
                  type="range"
                  min="0.8"
                  max="1.35"
                  step="0.01"
                  value={captionScale}
                  onPointerDown={onBeginEdit}
                  onPointerUp={onEndEdit}
                  onBlur={onEndEdit}
                  onChange={(event) => onScale(Number(event.target.value))}
                />
              </label>
              <label>
                Shadow
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  aria-label="Caption shadow"
                  value={Number.isFinite(captionStyle.shadow) ? captionStyle.shadow : 0.4}
                  onPointerDown={onBeginEdit}
                  onPointerUp={onEndEdit}
                  onBlur={onEndEdit}
                  onChange={(event) => onCaptionStyle({ shadow: Number(event.target.value) })}
                />
                <small>{(captionStyle.shadow ?? 0.4) < 0.02 ? 'Off' : 'Black'}</small>
              </label>
              <div className="caption-look">
                <label>
                  Text
                  <input
                    type="color"
                    value={captionStyle.color}
                    onPointerDown={onBeginEdit}
                    onPointerUp={onEndEdit}
                    onBlur={onEndEdit}
                    onChange={(event) => onCaptionStyle({ color: event.target.value })}
                  />
                </label>
                <label>
                  Active word
                  <input
                    type="color"
                    value={captionStyle.highlight}
                    onPointerDown={onBeginEdit}
                    onPointerUp={onEndEdit}
                    onBlur={onEndEdit}
                    onChange={(event) => onCaptionStyle({ highlight: event.target.value })}
                  />
                </label>
                <label>
                  Background
                  <input
                    type="color"
                    value={captionStyle.background}
                    onPointerDown={onBeginEdit}
                    onPointerUp={onEndEdit}
                    onBlur={onEndEdit}
                    onChange={(event) => onCaptionStyle({ background: event.target.value })}
                  />
                </label>
              </div>
              <label>
                Background strength
                <input
                  type="range"
                  min="0"
                  max="0.9"
                  step="0.02"
                  value={captionStyle.backgroundOpacity}
                  onPointerDown={onBeginEdit}
                  onPointerUp={onEndEdit}
                  onBlur={onEndEdit}
                  onChange={(event) => onCaptionStyle({ backgroundOpacity: Number(event.target.value) })}
                />
              </label>
            </div>
          )}
        </>
      )}

      {view === 'export' && (
        <>
          {back}
          <div className="panel-head">
            <h2>Export</h2>
          </div>
          <div className="qualities">
            {Object.entries(QUALITY_PRESETS).map(([id, item]) => (
              <button
                key={id}
                type="button"
                className={quality === id ? 'on' : ''}
                onClick={() => onQuality(id)}
              >
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </button>
            ))}
          </div>
          <p className="quiet">
            1920×1080 · 60fps · H.264 · {preset.hint}
            {estimate > 0 ? ` · about ${estimate.toFixed(0)} MB` : ''}
          </p>
        </>
      )}

      {open && (
        <EditDialog
          slide={slide}
          slideIndex={slideIndex}
          slideCount={slideCount}
          onChangeSlide={onChangeSlide}
          onMove={onMove}
          onRemove={() => {
            onRemove();
            setOpen(false);
          }}
          onBeginEdit={onBeginEdit}
          onEndEdit={onEndEdit}
          onClose={() => setOpen(false)}
        />
      )}
    </aside>
  );
}
