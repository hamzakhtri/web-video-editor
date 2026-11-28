import { useEffect, useRef } from 'react';
import { HEIGHT, WIDTH } from '../lib/constants.js';
import { paintFrame } from '../lib/render.js';
import { makeShukkk } from '../lib/sfx.js';
import { formatTime, locateSlide } from '../lib/timeline.js';

export default function PreviewPane({
  dataRef,
  audioUrl,
  playing,
  time,
  revision,
  frozen,
  seekAt,
  voiceGain,
  onTime,
  onPlaying,
  onCanvas,
}) {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const graphRef = useRef(null);
  const sfxRef = useRef(null);
  const heardSlide = useRef(-1);
  const rangeRef = useRef(null);
  const labelRef = useRef(null);
  const timeRef = useRef(time);
  const playingRef = useRef(playing);
  const onTimeRef = useRef(onTime);
  const onPlayingRef = useRef(onPlaying);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { onTimeRef.current = onTime; }, [onTime]);
  useEffect(() => { onPlayingRef.current = onPlaying; }, [onPlaying]);
  useEffect(() => { onCanvas?.(canvasRef.current); }, [onCanvas]);

  const playShukkk = () => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      if (!sfxRef.current) {
        const ctx = new Ctx();
        sfxRef.current = { ctx, buffer: makeShukkk(ctx.sampleRate) };
      }
      const { ctx, buffer } = sfxRef.current;
      ctx.resume?.();
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 0.7 * (Number.isFinite(voiceGain) ? Math.max(0, voiceGain) : 1);
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch {
      /* a missed whoosh should not stop playback */
    }
  };

  const hearSlide = (at, fire) => {
    const located = locateSlide(dataRef.current.slides || [], at);
    if (!located) return;
    const previous = heardSlide.current;
    heardSlide.current = located.index;
    if (!fire) return;
    const slide = dataRef.current.slides[located.index];
    const started = previous < 0 && located.local < 0.2;
    const entered = previous >= 0 && located.index !== previous && located.local < 0.25;
    if ((started || entered) && slide?.sound === 'shukkk') playShukkk();
  };

  const setVoiceGain = (gain) => {
    const audio = audioRef.current;
    if (!audio) return;
    const amount = Number.isFinite(gain) ? Math.max(0, gain) : 1;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      audio.volume = Math.min(1, amount);
      return;
    }
    try {
      if (!graphRef.current) {
        const ctx = new Ctx();
        const source = ctx.createMediaElementSource(audio);
        const node = ctx.createGain();
        source.connect(node);
        node.connect(ctx.destination);
        graphRef.current = { ctx, node };
      }
      graphRef.current.node.gain.value = amount;
      audio.volume = 1;
    } catch {
      audio.volume = Math.min(1, amount);
    }
  };

  useEffect(() => {
    setVoiceGain(voiceGain);
  }, [voiceGain, audioUrl]);

  useEffect(() => {
    const resume = () => { graphRef.current?.ctx.resume?.(); };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    };
  }, []);

  const draw = (at) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    paintFrame(ctx, {
      ...dataRef.current,
      time: at,
      width: WIDTH,
      height: HEIGHT,
    });
  };

  const showTime = (at) => {
    if (labelRef.current) labelRef.current.textContent = formatTime(at);
    const range = rangeRef.current;
    const limit = dataRef.current.duration || 0;
    if (range) {
      range.max = String(limit || 0);
      range.value = String(Math.min(at, limit || 0));
    }
  };

  useEffect(() => {
    if (playing || frozen) return;
    timeRef.current = time;
    showTime(time);
    const audio = audioRef.current;
    if (audio && audioUrl && Number.isFinite(audio.duration) && audio.duration > 0) {
      const next = Math.min(Math.max(0, time), Math.max(0, audio.duration - 0.001));
      if (Math.abs(audio.currentTime - next) > 0.08) audio.currentTime = next;
    }
    draw(time);
  }, [playing, frozen, time, revision, audioUrl]);

  useEffect(() => {
    if (!seekAt) return;
    timeRef.current = time;
    const audio = audioRef.current;
    if (audio && audioUrl && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Math.min(Math.max(0, time), Math.max(0, audio.duration - 0.001));
    }
    showTime(time);
    if (!playingRef.current && !frozen) draw(time);
  }, [seekAt]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!playing || frozen) {
      audio?.pause();
      return undefined;
    }

    const limit = dataRef.current.duration || 0;
    if (timeRef.current >= limit - 0.04) timeRef.current = 0;
    heardSlide.current = -1;
    hearSlide(timeRef.current, true);
    graphRef.current?.ctx.resume?.();
    if (audio && audioUrl) {
      const next = Math.min(timeRef.current, Math.max(0, (audio.duration || limit) - 0.001));
      if (Number.isFinite(next)) audio.currentTime = next;
      if (timeRef.current < (audio.duration || 0)) audio.play().catch(() => {});
    }

    let raf = 0;
    let last = performance.now();
    let lastEmit = 0;
    const loop = (now) => {
      if (!playingRef.current) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const track = audioRef.current;
      const end = dataRef.current.duration || 0;
      let next = timeRef.current;
      if (track && audioUrl && !track.paused && !track.ended && next < (track.duration || 0) - 0.02) {
        next = track.currentTime;
      } else {
        next += dt;
      }
      if (next >= end) {
        next = end;
        timeRef.current = next;
        showTime(next);
        onTimeRef.current(next);
        draw(next);
        track?.pause();
        playingRef.current = false;
        onPlayingRef.current(false);
        return;
      }
      timeRef.current = next;
      showTime(next);
      draw(next);
      hearSlide(next, true);
      if (now - lastEmit > 90) {
        lastEmit = now;
        onTimeRef.current(next);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, frozen, audioUrl]);

  const seek = (value) => {
    const limit = dataRef.current.duration || 0;
    const next = Math.min(limit, Math.max(0, value));
    timeRef.current = next;
    const audio = audioRef.current;
    if (audio && audioUrl && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Math.min(next, Math.max(0, audio.duration - 0.001));
    }
    showTime(next);
    if (!playingRef.current) draw(next);
    onTimeRef.current(next);
  };

  const duration = dataRef.current.duration || 0;

  return (
    <section className="preview">
      <div className="stage">
        <div className="frame">
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="preview-canvas" />
        </div>
      </div>
      <div className="transport">
        <button
          type="button"
          className="play"
          onClick={() => onPlaying(!playing)}
          disabled={duration <= 0}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          ref={rangeRef}
          className="scrub"
          type="range"
          min="0"
          max={duration || 0}
          step="0.01"
          defaultValue="0"
          disabled={duration <= 0}
          onInput={(event) => seek(Number(event.target.value))}
          aria-label="Preview time"
        />
        <span ref={labelRef} className="time">{formatTime(time)}</span>
        <span className="time dim">{formatTime(duration)}</span>
      </div>
      <audio ref={audioRef} src={audioUrl || undefined} preload="auto" />
    </section>
  );
}
