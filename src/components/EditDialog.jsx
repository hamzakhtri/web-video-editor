import { DEFAULT_MOTION, EFFECTS } from '../lib/constants.js';

export default function EditDialog({
  slide,
  slideIndex,
  slideCount,
  onChangeSlide,
  onMove,
  onRemove,
  onBeginEdit,
  onEndEdit,
  onClose,
}) {
  const speed = slide?.speed ?? DEFAULT_MOTION;

  return (
    <div className="modal-back" role="presentation" onMouseDown={onClose}>
      <div
        className="modal edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="edit-title">{slide ? `Slide ${slideIndex + 1}` : 'Edit'}</h2>
          <button type="button" className="icon" onClick={onClose} aria-label="Close">×</button>
        </div>

        {slide ? (
          <>
            <label>
              Seconds on screen
              <input
                type="number"
                min="0.4"
                step="0.1"
                value={slide.duration}
                onFocus={onBeginEdit}
                onBlur={onEndEdit}
                onChange={(event) => onChangeSlide({ duration: Math.max(0.4, Number(event.target.value) || 0.4) })}
              />
            </label>
            <div className="effects" role="listbox" aria-label="Effect">
              {EFFECTS.map((effect) => (
                <button
                  key={effect.id}
                  type="button"
                  className={slide.effect === effect.id ? 'on' : ''}
                  onClick={() => onChangeSlide({ effect: effect.id })}
                >
                  <span>{effect.label}</span>
                  <small>{effect.detail}</small>
                </button>
              ))}
            </div>
            <label>
              Motion
              <input
                type="range"
                min="0.25"
                max="1.6"
                step="0.05"
                value={speed}
                onPointerDown={onBeginEdit}
                onPointerUp={onEndEdit}
                onBlur={onEndEdit}
                onChange={(event) => onChangeSlide({ speed: Number(event.target.value) })}
              />
              <small>{speed < 0.6 ? 'Slow' : speed > 1 ? 'Strong' : 'Gentle'}</small>
            </label>
            <div className="row-actions">
              <button type="button" onClick={() => onMove(-1)} disabled={slideIndex === 0}>Earlier</button>
              <button type="button" onClick={() => onMove(1)} disabled={slideIndex === slideCount - 1}>Later</button>
              <button type="button" onClick={onRemove}>Remove</button>
            </div>
          </>
        ) : (
          <p className="quiet">Select a picture on the timeline, then set its effect and timing here.</p>
        )}
      </div>
    </div>
  );
}
