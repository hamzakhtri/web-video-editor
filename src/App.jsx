import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExportDialog from './components/ExportDialog.jsx';
import Inspector from './components/Inspector.jsx';
import StudioLoader, { markStudioReady } from './components/StudioLoader.jsx';
import MediaBin from './components/MediaBin.jsx';
import PreviewPane from './components/PreviewPane.jsx';
import TimelineBar from './components/TimelineBar.jsx';
import { audioBufferToWavBlob, clampVoiceGain, decodeAudioFile, isVoiceFile, voiceToWhisperSamples } from './lib/audio.js';
import { DEFAULT_CAPTION_STYLE, DEFAULT_MOTION, DEFAULT_QUALITY, EFFECTS, QUALITY_PRESETS } from './lib/constants.js';
import { createDemoProject } from './lib/demo.js';
import { startExport } from './lib/exportMp4.js';
import { loadImageFile } from './lib/images.js';
import { ensureFonts } from './lib/render.js';
import { applyTranscriptText, buildCues, cuesFromTranscriptJson, retimedWords } from './lib/subtitles.js';
import {
  buildSlidesFromImages,
  fitDurations,
  formatBytes,
  parseTimeline,
  projectDuration,
  visualDuration,
} from './lib/timeline.js';
import { clearProject, loadMedia, readMeta, saveMedia, writeMeta } from './lib/projectStore.js';
import { preloadWhisper, subscribeWhisper, transcribeAudio } from './lib/whisperClient.js';

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.focus();
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

const savedMeta = readMeta() || {};

function savedStyle(style) {
  const next = { ...DEFAULT_CAPTION_STYLE, ...(style || {}) };
  if (!Number.isFinite(next.place)) next.place = next.position === 'top' ? 0 : 1;
  return next;
}

function modelLabel(model) {
  if (model.status === 'ready') return `Whisper Small · ${model.device || 'ready'}`;
  if (model.status === 'downloading') return `Whisper ${Math.round(model.progress || 0)}%`;
  if (model.status === 'error') return 'Whisper unavailable';
  return 'Whisper';
}

export default function App() {
  const [audio, setAudio] = useState(null);
  const [images, setImages] = useState([]);
  const [slides, setSlides] = useState(Array.isArray(savedMeta.slides) ? savedMeta.slides : []);
  const [cues, setCues] = useState(Array.isArray(savedMeta.cues) ? savedMeta.cues : []);
  const [selectedId, setSelectedId] = useState(savedMeta.selectedId || null);
  const [language, setLanguage] = useState(savedMeta.language || 'auto');
  const [quality, setQuality] = useState(QUALITY_PRESETS[savedMeta.quality] ? savedMeta.quality : DEFAULT_QUALITY);
  const [captionOffset, setCaptionOffset] = useState(Number.isFinite(savedMeta.captionOffset) ? savedMeta.captionOffset : 0);
  const [captionScale, setCaptionScale] = useState(Number.isFinite(savedMeta.captionScale) ? savedMeta.captionScale : 1);
  const [captionStyle, setCaptionStyle] = useState(savedStyle(savedMeta.captionStyle));
  const [voiceGain, setVoiceGain] = useState(clampVoiceGain(savedMeta.voiceGain));
  const [mediaReady, setMediaReady] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [lastExport, setLastExport] = useState(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [time, setTime] = useState(0);
  const [seekAt, setSeekAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [model, setModel] = useState({ status: 'idle', progress: 0, device: '', error: '', detail: '' });
  const [notice, setNotice] = useState('');
  const [job, setJob] = useState(null);
  const [working, setWorking] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const dataRef = useRef({});
  const previewCanvasRef = useRef(null);
  const cancelRef = useRef(() => {});
  const abortRef = useRef(false);
  const runningRef = useRef(false);
  const outputUrlRef = useRef('');
  const studioShownAt = useRef(Date.now());
  const imagesRef = useRef(images);
  const audioRef = useRef(audio);
  const slidesRef = useRef(slides);
  const cuesRef = useRef(cues);
  const languageRef = useRef(language);
  const historyRef = useRef([]);
  const editingRef = useRef(false);
  const heardRef = useRef(savedMeta.cues?.length ? 'pending' : '');
  const mediaSig = useRef('');
  const allowMediaSave = useRef(false);
  const listenRef = useRef(null);
  const chainRef = useRef(Promise.resolve());
  const genRef = useRef(0);
  const startListenRef = useRef(() => Promise.resolve(null));
  const undoRef = useRef(() => {});
  const rememberRef = useRef(() => {});
  const freshArm = useRef(0);
  imagesRef.current = images;
  audioRef.current = audio;
  slidesRef.current = slides;
  cuesRef.current = cues;
  languageRef.current = language;

  const duration = projectDuration(slides, audio?.duration || 0);
  dataRef.current = {
    slides,
    imageMap: new Map(images.map((image) => [image.key, image.source])),
    cues,
    offset: captionOffset,
    scale: captionScale,
    captionStyle,
    duration,
  };

  const revision = useMemo(() => [
    slides.map((slide) => `${slide.id}:${slide.image}:${slide.duration}:${slide.effect}:${slide.speed}`).join('|'),
    images.map((image) => image.key).join(','),
    cues.map((cue) => `${cue.id}:${cue.start}:${cue.end}:${cue.text}`).join('|'),
    captionOffset,
    captionScale,
    captionStyle.color,
    captionStyle.highlight,
    captionStyle.background,
    captionStyle.backgroundOpacity,
    captionStyle.shadow,
    captionStyle.position,
    captionStyle.place,
    fontsReady,
  ].join('~'), [slides, images, cues, captionOffset, captionScale, captionStyle, fontsReady]);

  const missing = useMemo(() => {
    const have = new Set(images.map((image) => image.key));
    return [...new Set(slides.map((slide) => slide.image).filter((key) => !have.has(key)))];
  }, [images, slides]);

  const selectedIndex = slides.findIndex((slide) => slide.id === selectedId);
  const selected = selectedIndex >= 0 ? slides[selectedIndex] : null;
  const busy = working;
  const blockReason = !audio
    ? 'Add a voiceover to generate.'
    : !slides.length
      ? 'Add pictures or a timeline JSON.'
      : missing.length
        ? `Still need ${missing.map((key) => `${key}.jpg`).join(', ')}.`
        : '';

  useEffect(() => {
    ensureFonts().then(() => setFontsReady(true));
    preloadWhisper().catch(() => {});
    return subscribeWhisper(setModel);
  }, []);

  useEffect(() => {
    if (model.status !== 'ready') return undefined;
    markStudioReady();
    const elapsed = Date.now() - studioShownAt.current;
    const timer = setTimeout(() => setStudioOpen(true), Math.max(800, 1400 - elapsed));
    return () => clearTimeout(timer);
  }, [model.status]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bin = await loadMedia();
        if (cancelled) return;
        if (!bin) {
          allowMediaSave.current = true;
          return;
        }
        let loaded = [];
        let audioIdentity = '';
        if (bin.images?.length) {
          for (const item of bin.images) {
            const file = new File([item.blob], item.name || `${item.key}.jpg`, { type: item.blob.type || 'image/png' });
            loaded.push(await loadImageFile(file));
          }
          loaded.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
          if (!cancelled) setImages(loaded);
        }
        if (bin.audio?.blob) {
          const file = new File([bin.audio.blob], bin.audio.name || 'voice.wav', { type: bin.audio.blob.type || 'audio/wav' });
          const buffer = await decodeAudioFile(file);
          audioIdentity = `${file.name}:${file.size}:${buffer.duration.toFixed(3)}`;
          heardRef.current = savedMeta.cues?.length ? `${audioIdentity}|${savedMeta.language || 'auto'}` : '';
          if (!cancelled) {
            setAudio({
              name: file.name,
              url: URL.createObjectURL(file),
              buffer,
              duration: buffer.duration,
              file,
              id: audioIdentity,
              demo: Boolean(bin.audio.demo),
            });
          }
        }
        if (!cancelled) {
          mediaSig.current = `${audioIdentity}|${loaded.map((image) => image.key).join(',')}`;
          allowMediaSave.current = true;
        }
      } catch {
        /* keep the pictures already stored instead of replacing them with an empty project */
      } finally {
        if (!cancelled) setMediaReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mediaReady) return undefined;
    const timer = setTimeout(() => {
      writeMeta({
        version: 1,
        slides,
        cues,
        selectedId,
        language,
        quality,
        captionOffset,
        captionScale,
        captionStyle,
        voiceGain,
      });
      const signature = `${audio?.id || ''}|${images.map((image) => image.key).join(',')}`;
      if (!allowMediaSave.current || signature === mediaSig.current) return;
      mediaSig.current = signature;
      const blob = audio?.file || (audio?.buffer ? audioBufferToWavBlob(audio.buffer) : null);
      saveMedia({ audio, images, audioBlob: blob }).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [mediaReady, slides, cues, selectedId, language, quality, captionOffset, captionScale, captionStyle, voiceGain, audio, images]);

  useEffect(() => {
    if (model.listenProgress == null) return;
    setJob((current) => {
      if (!current || current.phase !== 'transcribe') return current;
      return {
        ...current,
        progress: model.listenProgress,
        label: model.listenLabel || 'Listening to the voice…',
      };
    });
  }, [model.listenProgress, model.listenLabel]);

  useEffect(() => {
    if (!mediaReady || !audio || audio.demo) return;
    const token = `${audio.id}|${language}`;
    if (heardRef.current === token) return;
    heardRef.current = token;
    startListenRef.current();
  }, [mediaReady, audio, language]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoRef.current();
        return;
      }
      if (!studioOpen || event.target.closest('input, textarea, select')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [studioOpen]);

  const releaseAudio = (clip) => {
    if (clip?.url) URL.revokeObjectURL(clip.url);
  };

  const releaseImages = (list) => {
    list.forEach((image) => image.source?.close?.());
  };

  const capture = () => ({
    slides,
    images,
    audio,
    cues,
    selectedId,
    language,
    quality,
    captionOffset,
    captionScale,
    captionStyle,
    voiceGain,
  });

  const remember = () => {
    historyRef.current.push(capture());
    if (historyRef.current.length > 50) historyRef.current.shift();
    setUndoCount(historyRef.current.length);
  };

  const beginEdit = () => {
    if (editingRef.current) return;
    editingRef.current = true;
    remember();
  };

  const endEdit = () => {
    editingRef.current = false;
  };

  const commit = (apply) => {
    if (!editingRef.current) remember();
    apply();
  };

  const undo = () => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    editingRef.current = false;
    setSlides(prev.slides);
    setImages(prev.images);
    setAudio(prev.audio);
    setCues(prev.cues);
    setSelectedId(prev.selectedId);
    setLanguage(prev.language);
    setQuality(prev.quality);
    setCaptionOffset(prev.captionOffset);
    setCaptionScale(prev.captionScale);
    setCaptionStyle(prev.captionStyle);
    setVoiceGain(clampVoiceGain(prev.voiceGain));
    setUndoCount(historyRef.current.length);
    if (prev.audio) heardRef.current = `${prev.audio.id}|${prev.language}`;
    setNotice('Last change undone.');
  };
  undoRef.current = undo;
  rememberRef.current = remember;

  const startFresh = async () => {
    if (Date.now() - freshArm.current > 4000) {
      freshArm.current = Date.now();
      setNotice('Click Start fresh again to clear this project and reload.');
      return;
    }
    await clearProject();
    window.location.reload();
  };

  const handleFiles = useCallback(async (fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;
    rememberRef.current();
    const problems = [];
    const jsonFile = [...files].reverse().find((file) => file.name.toLowerCase().endsWith('.json'));
    const audioFile = [...files].reverse().find((file) => isVoiceFile(file));
    const pictureFiles = files.filter((file) => !isVoiceFile(file) && (file.type.startsWith('image/') || IMAGE_EXT.test(file.name)));

    if (jsonFile) {
      try {
        const data = JSON.parse(await jsonFile.text());
        const next = parseTimeline(data);
        setSlides(next);
        setSelectedId(next[0]?.id || null);
        setTime(0);
        setSeekAt(Date.now());
        setPlaying(false);
        setNotice(`Timeline loaded. ${next.length} pictures, ${visualDuration(next).toFixed(1)}s total.`);
      } catch (error) {
        problems.push(error.message);
      }
    }

    if (audioFile) {
      try {
        const buffer = await decodeAudioFile(audioFile);
        const url = URL.createObjectURL(audioFile);
        const id = `${audioFile.name}:${audioFile.size}:${buffer.duration.toFixed(3)}`;
        setAudio((current) => {
          releaseAudio(current);
          return { name: audioFile.name, url, buffer, duration: buffer.duration, file: audioFile, id, demo: false };
        });
        setCues([]);
        setTime(0);
        setSeekAt(Date.now());
        setPlaying(false);
      } catch {
        problems.push(`Could not read ${audioFile.name}.`);
      }
    }

    if (pictureFiles.length) {
      const loaded = [];
      for (const file of pictureFiles) {
        try {
          loaded.push(await loadImageFile(file));
        } catch (error) {
          problems.push(error.message);
        }
      }
      if (loaded.length) {
        const merged = new Map(imagesRef.current.map((image) => [image.key, image]));
        loaded.forEach((image) => {
          merged.get(image.key)?.source?.close?.();
          merged.set(image.key, image);
        });
        const nextImages = [...merged.values()].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
        setImages(nextImages);
        if (!jsonFile && slidesRef.current.length === 0) {
          const built = buildSlidesFromImages(nextImages.map((image) => image.key));
          setSlides(built);
          setSelectedId(built[0]?.id || null);
          setNotice('Pictures added. Each one starts at 4 seconds — import JSON or match the voice length.');
        }
      }
    }

    if (!jsonFile && !audioFile && !pictureFiles.length) {
      problems.push('Use a voiceover, pictures named 1.jpg, or a timeline JSON file.');
    }
    if (problems.length) setNotice(problems.join(' '));
  }, []);

  const applyJson = (text) => {
    try {
      remember();
      const next = parseTimeline(JSON.parse(text));
      setSlides(next);
      setSelectedId(next[0]?.id || null);
      setTime(0);
      setSeekAt(Date.now());
      setPlaying(false);
      setNotice(`Timeline loaded. ${next.length} pictures, ${visualDuration(next).toFixed(1)}s total.`);
    } catch (error) {
      setNotice(error instanceof SyntaxError ? 'That text is not valid JSON.' : error.message);
    }
  };

  useEffect(() => {
    let depth = 0;
    const over = (event) => event.preventDefault();
    const enter = (event) => {
      event.preventDefault();
      depth += 1;
      setDragOver(true);
    };
    const leave = (event) => {
      event.preventDefault();
      depth -= 1;
      if (depth <= 0) {
        depth = 0;
        setDragOver(false);
      }
    };
    const drop = (event) => {
      event.preventDefault();
      depth = 0;
      setDragOver(false);
      handleFiles(event.dataTransfer?.files);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [handleFiles]);

  const seek = (value) => {
    const limit = dataRef.current.duration || 0;
    const next = Math.min(limit, Math.max(0, value));
    setTime(next);
    setSeekAt(Date.now());
  };

  const loadDemo = async () => {
    if (busy) return;
    remember();
    setPlaying(false);
    const demo = await createDemoProject();
    releaseImages(imagesRef.current);
    releaseAudio(audioRef.current);
    setImages(demo.images);
    setSlides(demo.slides);
    setAudio({ ...demo.audio, id: 'demo', demo: true });
    heardRef.current = `demo|${languageRef.current}`;
    setCues(demo.cues);
    setSelectedId(demo.slides[0].id);
    setTime(0);
    setSeekAt(Date.now());
    setNotice('Demo loaded. These captions are written in, so you can preview before Whisper finishes.');
  };

  const resetProject = () => {
    if (busy) return;
    remember();
    setPlaying(false);
    heardRef.current = '';
    releaseImages(imagesRef.current);
    releaseAudio(audioRef.current);
    setImages([]);
    setSlides([]);
    setAudio(null);
    setCues([]);
    setSelectedId(null);
    setTime(0);
    setSeekAt(Date.now());
    setNotice('');
  };

  const updateSlide = (patch) => {
    commit(() => setSlides((current) => current.map((slide) => (
      slide.id === selectedId ? { ...slide, ...patch } : slide
    ))));
  };

  const moveSlide = (direction) => {
    remember();
    setSlides((current) => {
      const index = current.findIndex((slide) => slide.id === selectedId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = current.slice();
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const removeImage = (key) => {
    if (busy || !imagesRef.current.some((image) => image.key === key)) return;
    remember();
    setImages((current) => current.filter((image) => image.key !== key));
  };

  const clearImages = () => {
    if (busy || !imagesRef.current.length) return;
    remember();
    setImages([]);
  };

  const addSlide = () => {
    if (!images.length) return;
    remember();
    const used = new Set(slides.map((slide) => slide.image));
    const image = images.find((item) => !used.has(item.key))?.key || images[0].key;
    const slide = {
      id: crypto.randomUUID(),
      image,
      duration: 4,
      effect: EFFECTS[slides.length % EFFECTS.length].id,
      speed: DEFAULT_MOTION,
    };
    setSlides((current) => [...current, slide]);
    setSelectedId(slide.id);
  };

  const startListen = () => {
    if (!audioRef.current) return Promise.reject(new Error('Add a voiceover first.'));
    const generation = ++genRef.current;
    const token = `${audioRef.current.id}|${languageRef.current}`;
    const task = chainRef.current.catch(() => {}).then(async () => {
      if (generation !== genRef.current || !audioRef.current) return null;
      if (`${audioRef.current.id}|${languageRef.current}` !== token) return null;
      const samples = await voiceToWhisperSamples(audioRef.current.buffer);
      if (generation !== genRef.current || !audioRef.current) return null;
      const spoken = languageRef.current === 'auto' ? null : languageRef.current;
      const result = await transcribeAudio(samples, spoken);
      if (generation !== genRef.current || !audioRef.current) return null;
      if (`${audioRef.current.id}|${languageRef.current}` !== token) return null;
      const next = buildCues(result.chunks);
      setCues(next);
      setNotice(next.length
        ? `${next.length} captions ready. Fix any line before you generate.`
        : 'Whisper did not return any words. Check the language, or export without captions.');
      return next;
    });
    chainRef.current = task.then(() => {}, () => {});
    const tracked = task.then((value) => value, (error) => { throw error; });
    listenRef.current = tracked;
    tracked.then(() => {}, () => {}).then(() => {
      if (listenRef.current === tracked) listenRef.current = null;
    });
    return task;
  };
  startListenRef.current = startListen;

  const transcribeNow = () => {
    if (!audioRef.current) {
      setNotice('Add a voiceover first.');
      return;
    }
    remember();
    heardRef.current = `${audioRef.current.id}|${languageRef.current}`;
    startListen();
  };

  const handleGenerate = async (skipCaptions = false) => {
    if (blockReason || runningRef.current) return;
    runningRef.current = true;
    abortRef.current = false;
    setWorking(true);
    setPlaying(false);
    setJob({ phase: 'prepare', progress: 0, label: 'Preparing the timeline…', error: '' });
    try {
      let burned = cuesRef.current;
      if (!skipCaptions && burned.length === 0) {
        setJob({
          phase: 'transcribe',
          progress: 0,
          label: 'Listening to the voice…',
          error: '',
        });
        try {
          burned = await (listenRef.current || startListen());
          if (!burned?.length) burned = cuesRef.current;
        } catch (error) {
          setJob({
            phase: 'caption-error',
            progress: 0,
            label: '',
            error: error.message || 'Whisper could not transcribe this voiceover.',
          });
          runningRef.current = false;
          setWorking(false);
          return;
        }
      }
      if (abortRef.current) {
        setJob(null);
        runningRef.current = false;
        setWorking(false);
        return;
      }
      if (skipCaptions) burned = [];
      await ensureFonts();
      const task = startExport({
        slides,
        imageMap: dataRef.current.imageMap,
        cues: burned,
        audioBuffer: audioRef.current.buffer,
        voiceGain,
        offset: captionOffset,
        scale: captionScale,
        captionStyle,
        quality,
        previewCanvas: previewCanvasRef.current,
        onProgress: (progress, label) => {
          setJob((current) => {
            if (!current || !['prepare', 'transcribe', 'encode'].includes(current.phase)) return current;
            return { phase: 'encode', progress, label, error: '' };
          });
        },
      });
      cancelRef.current = task.cancel;
      const result = await task.promise;
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
      outputUrlRef.current = result.url;
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const filename = `lumina-${stamp}.mp4`;
      const saved = { url: result.url, size: result.size, duration, filename };
      setLastExport(saved);
      setJob({
        phase: 'done',
        progress: 1,
        label: 'Ready',
        error: '',
        ...saved,
      });
    } catch (error) {
      if (error?.name === 'AbortError') setJob(null);
      else setJob({ phase: 'error', progress: 0, label: '', error: error.message || 'Export failed.' });
    } finally {
      runningRef.current = false;
      setWorking(false);
    }
  };

  const takeCanvas = useCallback((canvas) => {
    previewCanvasRef.current = canvas;
  }, []);

  return (
    <div className="app">
      <div className="mast">
      <header className="topbar">
        <div className="brand">
          <strong>Lumina</strong>
          <span>Pictures, voice, captions</span>
        </div>
        <p className="specs">1080p · 60fps · nothing leaves this browser</p>
        <button type="button" className="text-btn" onClick={undo} disabled={!undoCount}>Undo</button>
        <button type="button" className="text-btn" onClick={startFresh}>Start fresh</button>
        {lastExport && (
          <button
            type="button"
            className="last-download"
            onClick={() => setJob({
              phase: 'done',
              progress: 1,
              label: 'Ready',
              error: '',
              url: lastExport.url,
              size: lastExport.size,
              duration: lastExport.duration,
              filename: lastExport.filename,
            })}
          >
            Last MP4 · {formatBytes(lastExport.size)}
          </button>
        )}
        {model.listenProgress != null && job?.phase !== 'transcribe' && (
          <span className="model downloading" title={model.listenLabel}>
            <i />
            {model.listenLabel || 'Listening…'}
          </span>
        )}
        <div className={`model ${model.status}`} title={model.error || model.detail || ''}>
          <i />
          {modelLabel(model)}
        </div>
        <div className="generate-wrap">
          {blockReason && <span className="why">{blockReason}</span>}
          <button
            type="button"
            className="primary"
            disabled={Boolean(blockReason) || busy}
            onClick={() => handleGenerate(false)}
          >
            {busy ? 'Working' : 'Generate MP4'}
          </button>
        </div>
      </header>
      {notice && (
        <div className="banner">
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">×</button>
        </div>
      )}
      </div>

      <div className="workspace">
        <MediaBin
          audio={audio}
          images={images}
          slides={slides}
          onFiles={handleFiles}
          onDemo={loadDemo}
          onReset={resetProject}
          onApplyJson={applyJson}
          voiceGain={voiceGain}
          onVoiceGain={(value) => commit(() => setVoiceGain(clampVoiceGain(value)))}
          onBeginEdit={beginEdit}
          onEndEdit={endEdit}
          onRemoveImage={removeImage}
          onClearImages={clearImages}
          busy={busy}
        />
        <PreviewPane
          dataRef={dataRef}
          audioUrl={audio?.url || ''}
          playing={playing}
          time={time}
          revision={revision}
          frozen={busy}
          seekAt={seekAt}
          voiceGain={voiceGain}
          onTime={setTime}
          onPlaying={setPlaying}
          onCanvas={takeCanvas}
        />
        <Inspector
          slide={selected}
          slideIndex={Math.max(0, selectedIndex)}
          slideCount={slides.length}
          images={images}
          cues={cues}
          language={language}
          quality={quality}
          captionOffset={captionOffset}
          captionScale={captionScale}
          duration={duration}
          busy={busy}
          canFit={Boolean(audio && slides.length)}
          listening={model.listenProgress == null || job?.phase === 'transcribe' ? null : {
            progress: model.listenProgress,
            label: model.listenLabel,
          }}
          onLanguage={(value) => commit(() => setLanguage(value))}
          onQuality={(value) => commit(() => setQuality(value))}
          onOffset={(value) => commit(() => setCaptionOffset(value))}
          onScale={(value) => commit(() => setCaptionScale(value))}
          onChangeSlide={updateSlide}
          onMove={moveSlide}
          onRemove={() => {
            commit(() => {
              setSlides((current) => current.filter((slide) => slide.id !== selectedId));
              setSelectedId(null);
            });
          }}
          onAdd={addSlide}
          onFit={() => {
            if (!audio) return;
            commit(() => {
              setSlides((current) => fitDurations(current, audio.duration));
              setNotice('Slide lengths now add up to the voiceover.');
            });
          }}
          onTranscribe={transcribeNow}
          onBeginEdit={beginEdit}
          onEndEdit={endEdit}
          captionStyle={captionStyle}
          onCaptionStyle={(patch) => commit(() => setCaptionStyle((current) => ({ ...current, ...patch })))}
          onCopyTranscript={async () => {
            if (!cues.length) {
              setNotice('Transcribe the voice first, then copy the timings.');
              return;
            }
            const payload = {
              voiceDuration: Number((audio?.duration || cues[cues.length - 1].end).toFixed(2)),
              cues: cues.map((cue) => ({
                start: Number(cue.start.toFixed(2)),
                end: Number(cue.end.toFixed(2)),
                duration: Number((cue.end - cue.start).toFixed(2)),
                text: cue.text,
              })),
            };
            const text = JSON.stringify(payload, null, 2);
            const copied = await copyText(text);
            setNotice(copied
              ? 'Transcript JSON copied. Paste it into ChatGPT so each picture can match the words.'
              : 'Could not copy. Allow clipboard access and try the copy icon again.');
          }}
          onSetTranscript={(text) => {
            beginEdit();
            commit(() => setCues((current) => applyTranscriptText(current, text)));
            endEdit();
            setNotice('Transcript set. The video now uses these words.');
          }}
          onSetCaptionJson={(text) => {
            try {
              const next = cuesFromTranscriptJson(text);
              beginEdit();
              commit(() => setCues(next));
              endEdit();
              setNotice(`Captions set from JSON. ${next.length} lines.`);
            } catch (error) {
              setNotice(error.message);
            }
          }}
          onEditCue={(id, text) => {
            commit(() => setCues((current) => current.map((cue) => (
              cue.id === id ? { ...cue, text, edited: true, words: retimedWords(cue, text) } : cue
            ))));
          }}
          onRemoveCue={(id) => commit(() => setCues((current) => current.filter((cue) => cue.id !== id)))}
          onSeek={seek}
        />
      </div>

      <TimelineBar
        slides={slides}
        cues={cues}
        images={images}
        duration={duration}
        time={time}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onSeek={seek}
      />

      {dragOver && <div className="drop-overlay">Drop the voice, pictures, or JSON</div>}

      {!studioOpen && (
        <StudioLoader model={model} onEnter={() => setStudioOpen(true)} />
      )}

      <ExportDialog
        job={job}
        onClose={() => setJob(null)}
        onCancel={() => {
          abortRef.current = true;
          cancelRef.current();
          setJob(null);
        }}
        onSkipCaptions={() => handleGenerate(true)}
      />
    </div>
  );
}
