import { formatBytes, formatTime } from '../lib/timeline.js';

export default function ExportDialog({ job, onClose, onCancel, onSkipCaptions }) {
  if (!job) return null;
  const running = job.phase === 'prepare' || job.phase === 'transcribe' || job.phase === 'encode';
  const percent = Math.round((job.progress || 0) * 100);

  return (
    <div className="modal-back" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <h2 id="export-title">
          {job.phase === 'done' ? 'Your MP4 is ready' : job.phase === 'error' || job.phase === 'caption-error' ? 'Something stopped the export' : 'Making the video'}
        </h2>
        {running && (
          <>
            <p>{job.label}</p>
            <div className={`bar${job.phase === 'encode' ? '' : ' starting'}`}>
              <span style={job.phase === 'encode' ? { width: `${percent}%` } : undefined} />
            </div>
            {job.phase === 'encode' && <p className="quiet">{percent}%</p>}
            {job.phase === 'transcribe' && percent > 2 && <p className="quiet">{percent}%</p>}
            <div className="row-actions">
              <button type="button" onClick={onCancel}>Cancel</button>
            </div>
          </>
        )}
        {job.phase === 'caption-error' && (
          <>
            <p>{job.error}</p>
            <div className="row-actions">
              <button type="button" className="primary" onClick={onSkipCaptions}>Export without captions</button>
              <button type="button" onClick={onClose}>Close</button>
            </div>
          </>
        )}
        {job.phase === 'error' && (
          <>
            <p>{job.error}</p>
            <div className="row-actions">
              <button type="button" onClick={onClose}>Close</button>
            </div>
          </>
        )}
        {job.phase === 'done' && (
          <>
            <p>{formatBytes(job.size)} · 1080p · 60fps</p>
            <video src={job.url} controls playsInline />
            <div className="row-actions">
              <a className="primary" href={job.url} download={job.filename || 'lumina-1080p60.mp4'}>Download MP4</a>
              <button type="button" onClick={onClose}>Close</button>
            </div>
          </>
        )}
        {job.phase === 'done' && job.duration > 0 && (
          <p className="quiet">Length {formatTime(job.duration)}. Play it here, then download.</p>
        )}
      </div>
    </div>
  );
}
