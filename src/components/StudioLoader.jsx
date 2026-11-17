const RETURNING_KEY = 'lumina-studio';

export function studioWasReady() {
  try {
    return localStorage.getItem(RETURNING_KEY) === 'ready';
  } catch {
    return false;
  }
}

export function markStudioReady() {
  try {
    localStorage.setItem(RETURNING_KEY, 'ready');
  } catch {
    /* private mode */
  }
}

export default function StudioLoader({ model, onEnter }) {
  const returning = studioWasReady();
  const percent = Math.max(0, Math.min(100, Math.round(model.progress || 0)));
  const failed = model.status === 'error';
  const compiling = model.phase === 'start' || percent >= 99;
  const waiting = percent < 2 && !compiling;
  const starting = !failed && (compiling || waiting);
  let detail = 'Downloading Whisper once, then it stays in this browser.';
  if (returning && waiting) detail = 'Whisper is already saved here. Opening it.';
  if (compiling && !failed) detail = 'Download is done. Starting Whisper in this browser.';
  if (failed) detail = model.error || 'Whisper could not start. You can still edit, without captions.';

  return (
    <div className="studio" role="dialog" aria-modal="true" aria-labelledby="studio-title">
      <p className="studio-kicker">Lumina</p>
      <h1 id="studio-title">{returning ? 'Opening your studio' : 'Setting up your studio'}</h1>
      <p className="studio-detail">{detail}</p>
      {!failed && (
        <div className={`studio-bar${starting ? ' starting' : ''}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
          <span style={starting ? undefined : { width: `${Math.max(percent, 6)}%` }} />
        </div>
      )}
      {!failed && (
        <p className="studio-percent">
          {compiling ? 'Starting' : waiting ? (returning ? 'Opening' : 'Preparing') : `${percent}%`}
        </p>
      )}
      {failed && (
        <button type="button" className="primary" onClick={onEnter}>Enter studio</button>
      )}
    </div>
  );
}
