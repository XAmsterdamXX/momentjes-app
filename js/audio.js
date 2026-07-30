/* Momentjes — audio-opname + live transcriptie.
   Opname werkt altijd; live meeschrijven is een extraatje dat netjes
   uitvalt als het toestel het niet ondersteunt. */

const Recorder = (() => {

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    const options = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (const m of options) {
      try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (_) {}
    }
    return ''; // laat de browser kiezen
  }

  function create() {
    const state = {
      stream: null, recorder: null, chunks: [], mime: '',
      audioCtx: null, analyser: null, levelData: null,
      startedAt: 0, elapsedBefore: 0, paused: false,
      onLevel: null, timerId: null, onTick: null,
    };

    async function start() {
      state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.mime = pickMime();
      state.recorder = new MediaRecorder(state.stream, state.mime ? { mimeType: state.mime } : undefined);
      state.chunks = [];
      state.recorder.ondataavailable = (e) => { if (e.data && e.data.size) state.chunks.push(e.data); };
      state.recorder.start(1000);
      state.startedAt = Date.now();
      state.elapsedBefore = 0;
      state.paused = false;

      // Geluidsniveau voor de golfjes
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        state.audioCtx = new AC();
        const src = state.audioCtx.createMediaStreamSource(state.stream);
        state.analyser = state.audioCtx.createAnalyser();
        state.analyser.fftSize = 256;
        state.levelData = new Uint8Array(state.analyser.frequencyBinCount);
        src.connect(state.analyser);
      } catch (_) { /* golfjes zijn optioneel */ }

      state.timerId = setInterval(() => {
        if (state.onTick) state.onTick(elapsed());
        if (state.onLevel && state.analyser && !state.paused) {
          state.analyser.getByteFrequencyData(state.levelData);
          state.onLevel(state.levelData);
        }
      }, 90);
    }

    function elapsed() {
      if (!state.startedAt) return state.elapsedBefore;
      return state.paused ? state.elapsedBefore
        : state.elapsedBefore + (Date.now() - state.startedAt);
    }

    function pause() {
      if (!state.recorder || state.paused) return;
      try { state.recorder.pause(); } catch (_) {}
      state.elapsedBefore = elapsed();
      state.paused = true;
    }

    function resume() {
      if (!state.recorder || !state.paused) return;
      try { state.recorder.resume(); } catch (_) {}
      state.startedAt = Date.now();
      state.paused = false;
    }

    function cleanup() {
      clearInterval(state.timerId);
      if (state.stream) state.stream.getTracks().forEach(t => t.stop());
      if (state.audioCtx) { try { state.audioCtx.close(); } catch (_) {} }
    }

    function stop() {
      return new Promise((resolve) => {
        if (!state.recorder || state.recorder.state === 'inactive') {
          cleanup(); resolve(null); return;
        }
        state.recorder.onstop = () => {
          cleanup();
          const type = state.mime || (state.chunks[0] && state.chunks[0].type) || 'audio/mp4';
          const blob = new Blob(state.chunks, { type });
          resolve({ blob, mime: type, duration: Math.round(elapsed() / 1000) });
        };
        try { state.recorder.stop(); } catch (_) { cleanup(); resolve(null); }
      });
    }

    function cancel() {
      try { if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop(); } catch (_) {}
      cleanup();
    }

    return {
      start, pause, resume, stop, cancel, elapsed,
      set onTick(fn) { state.onTick = fn; },
      set onLevel(fn) { state.onLevel = fn; },
      get paused() { return state.paused; },
    };
  }

  return { create, supported: () => !!(navigator.mediaDevices && typeof MediaRecorder !== 'undefined') };
})();


/* Live transcriptie via het spraak-framework van het toestel zelf
   (op iPhone: Siri's spraakherkenning — er gaat niets naar externe partijen
   buiten wat het besturingssysteem zelf regelt). */
const Speech = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function create(lang = 'nl-NL') {
    if (!SR) return null;
    let rec = null;
    let finalText = '';
    let active = false;
    let handlers = { onUpdate: null, onUnavailable: null };

    function fresh() {
      rec = new SR();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript + ' ';
          else interim += r[0].transcript;
        }
        if (handlers.onUpdate) handlers.onUpdate(finalText.trim(), interim.trim());
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          active = false;
          if (handlers.onUnavailable) handlers.onUnavailable();
        }
        // 'no-speech' en 'aborted' zijn normaal — onend herstart vanzelf
      };
      rec.onend = () => {
        // Safari stopt na een stilte; zolang we opnemen, gewoon doorgaan
        if (active) { try { rec.start(); } catch (_) {} }
      };
    }

    return {
      start() {
        active = true; finalText = finalText || '';
        try { fresh(); rec.start(); } catch (_) {
          active = false;
          if (handlers.onUnavailable) handlers.onUnavailable();
        }
      },
      stop() { active = false; try { rec && rec.stop(); } catch (_) {} },
      get text() { return finalText.trim(); },
      set onUpdate(fn) { handlers.onUpdate = fn; },
      set onUnavailable(fn) { handlers.onUnavailable = fn; },
    };
  }

  return { create, supported: () => !!SR };
})();
