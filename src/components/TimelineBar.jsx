import { effectLabel } from '../lib/constants.js';
import { slideStarts } from '../lib/timeline.js';

export default function TimelineBar({ slides, cues, images, duration, time, selectedId, onSelect, onSeek }) {
  const starts = slideStarts(slides);
  const safe = duration > 0 ? duration : 1;
  const playhead = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;

  return (
    <section className="timeline">
      <div className="film">
        <div className="sprockets" />
        <div className="tracks">
          <div className="track" onClick={(event) => seekFrom(event, duration, onSeek)}>
            {slides.map((slide, index) => {
              const width = ((Number(slide.duration) || 0) / safe) * 100;
              const hasImage = images.some((image) => image.key === slide.image);
              return (
                <button
                  key={slide.id}
                  type="button"
                  className={`clip${slide.id === selectedId ? ' on' : ''}${hasImage ? '' : ' missing'}`}
                  style={{ width: `${width}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(slide.id);
                    onSeek(starts[index]);
                  }}
                >
                  <b>{slide.image}</b>
                  <span>{effectLabel(slide.effect)}</span>
                </button>
              );
            })}
            <i className="playhead" style={{ left: `${playhead}%` }} />
          </div>
          <div className="captions" onClick={(event) => seekFrom(event, duration, onSeek)}>
            {cues.map((cue) => (
              <button
                key={cue.id}
                type="button"
                className="caption-chip"
                style={{
                  left: `${(cue.start / safe) * 100}%`,
                  width: `${(Math.max(0.15, cue.end - cue.start) / safe) * 100}%`,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSeek(cue.start);
                }}
                title={cue.text}
              >
                {cue.text}
              </button>
            ))}
          </div>
        </div>
        <div className="sprockets" />
      </div>
    </section>
  );
}

function seekFrom(event, duration, onSeek) {
  if (!duration) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  onSeek(ratio * duration);
}
