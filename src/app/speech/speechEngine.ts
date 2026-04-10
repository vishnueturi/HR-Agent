/**
 * Speech-to-text capture aligned with Recco.App (MediaRecorder → WebSocket chunks).
 * Falls back to the browser Web Speech API when VITE_SPEECH_WEBSOCKET_URL is unset.
 */

const BAR_COUNT = 60;

function pickRecorderMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return undefined;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechEngineMode = 'websocket' | 'browser' | 'none';

export function getSpeechEngineMode(): SpeechEngineMode {
  const ws = import.meta.env.VITE_SPEECH_WEBSOCKET_URL;
  if (typeof ws === 'string' && ws.trim().length > 0) return 'websocket';
  if (getSpeechRecognitionCtor()) return 'browser';
  return 'none';
}

export interface RunningSpeechCapture {
  /** Push frequency data into waveform UI (0–100 per bar). */
  setLevelListener: (fn: ((levels: number[]) => void) | null) => void;
  /** Latest live text (browser STT interim + final). */
  getLiveText: () => string;
  /** Stop capture; returns transcript to put in the composer. */
  finalize: (apply: boolean) => Promise<string>;
}

let sharedSocket: WebSocket | null = null;
let sharedSocketUrl: string | null = null;

function getOrCreateSpeechWebSocket(url: string): WebSocket {
  if (
    sharedSocket &&
    sharedSocketUrl === url &&
    (sharedSocket.readyState === WebSocket.OPEN || sharedSocket.readyState === WebSocket.CONNECTING)
  ) {
    return sharedSocket;
  }
  if (sharedSocket) {
    try {
      sharedSocket.close();
    } catch {
      /* ignore */
    }
    sharedSocket = null;
    sharedSocketUrl = null;
  }
  const ws = new WebSocket(url);
  sharedSocket = ws;
  sharedSocketUrl = url;
  ws.onclose = () => {
    if (sharedSocket === ws) {
      sharedSocket = null;
      sharedSocketUrl = null;
    }
  };
  return ws;
}

async function runWebSocketCapture(
  wsBaseUrl: string,
  onLevels: (levels: number[]) => void
): Promise<RunningSpeechCapture> {
  const transcriptParts: string[] = [];
  let levelListener: ((levels: number[]) => void) | null = onLevels;

  const ws = getOrCreateSpeechWebSocket(wsBaseUrl);

  await new Promise<void>((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    const t = window.setTimeout(() => {
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onErr);
      reject(new Error('Speech service connection timed out.'));
    }, 10_000);
    function onOpen() {
      clearTimeout(t);
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onErr);
      resolve();
    }
    function onErr() {
      clearTimeout(t);
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onErr);
      reject(new Error('Could not connect to speech transcription service.'));
    }
    ws.addEventListener('open', onOpen);
    ws.addEventListener('error', onErr);
  });

  const onWsMessage = (event: MessageEvent) => {
    const text = typeof event.data === 'string' ? event.data : '';
    if (text.trim()) {
      transcriptParts.push(text.trim());
    }
  };
  ws.addEventListener('message', onWsMessage);

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  let raf = 0;
  const tick = () => {
    analyser.getByteFrequencyData(dataArray);
    const step = Math.max(1, Math.floor(dataArray.length / BAR_COUNT));
    const levels: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += dataArray[i * step + j] ?? 0;
      }
      levels.push((sum / step / 255) * 100);
    }
    levelListener?.(levels);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const mimeType = pickRecorderMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
      ws.send(event.data);
    }
  };
  recorder.onerror = (e) => {
    console.error('MediaRecorder error:', e);
  };
  recorder.start(250);

  const cleanupMedia = () => {
    ws.removeEventListener('message', onWsMessage);
    cancelAnimationFrame(raf);
    try {
      recorder.stop();
    } catch {
      /* ignore */
    }
    stream.getTracks().forEach((t) => t.stop());
    source.disconnect();
    void audioCtx.close();
  };

  return {
    setLevelListener: (fn) => {
      levelListener = fn;
    },
    getLiveText: () => transcriptParts.join(' '),
    finalize: async (apply: boolean) => {
      cleanupMedia();
      if (!apply) {
        transcriptParts.length = 0;
        return '';
      }
      await new Promise((r) => setTimeout(r, 200));
      const text = transcriptParts.join(' ').replace(/\s+/g, ' ').trim();
      transcriptParts.length = 0;
      return text;
    },
  };
}

async function runBrowserSpeechCapture(onLevels: (levels: number[]) => void): Promise<RunningSpeechCapture> {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    throw new Error('Speech recognition is not supported in this browser.');
  }

  let levelListener: ((levels: number[]) => void) | null = onLevels;
  let finalText = '';
  let interimText = '';

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  let raf = 0;
  const tick = () => {
    analyser.getByteFrequencyData(dataArray);
    const step = Math.max(1, Math.floor(dataArray.length / BAR_COUNT));
    const levels: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += dataArray[i * step + j] ?? 0;
      }
      levels.push((sum / step / 255) * 100);
    }
    levelListener?.(levels);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const recognition = new Ctor();
  recognition.lang = navigator.language || 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const piece = res[0]?.transcript ?? '';
      if (res.isFinal) {
        finalText += piece;
      } else {
        interimText += piece;
      }
    }
  };

  const startPromise = new Promise<void>((resolve, reject) => {
    recognition.onstart = () => resolve();
    recognition.onerror = (ev: SpeechRecognitionErrorEvent) => {
      console.warn('SpeechRecognition error:', ev.error);
      if (ev.error === 'not-allowed') {
        reject(new Error('Microphone access was denied.'));
      } else if (ev.error === 'service-not-allowed') {
        reject(new Error('Speech recognition is not allowed.'));
      }
    };
  });
  recognition.start();
  try {
    await startPromise;
  } catch (e) {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    source.disconnect();
    void audioCtx.close();
    throw e;
  }

  const cleanupMedia = () => {
    cancelAnimationFrame(raf);
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
    stream.getTracks().forEach((t) => t.stop());
    source.disconnect();
    void audioCtx.close();
  };

  return {
    setLevelListener: (fn) => {
      levelListener = fn;
    },
    getLiveText: () => `${finalText}${interimText}`.replace(/\s+/g, ' ').trim(),
    finalize: async (apply: boolean) => {
      return new Promise((resolve) => {
        recognition.onend = () => {
          const raw = `${finalText}${interimText}`.replace(/\s+/g, ' ').trim();
          cleanupMedia();
          resolve(apply ? raw : '');
        };
        try {
          recognition.stop();
        } catch {
          cleanupMedia();
          resolve(apply ? `${finalText}${interimText}`.replace(/\s+/g, ' ').trim() : '');
        }
      });
    },
  };
}

/** Short, non-technical copy for speech-start failures shown in the chat UI. */
export function formatSpeechStartError(e: unknown): string {
  const micBlocked =
    'Voice input needs your microphone. Please allow access and try again, or type your message instead.';
  const noMic = 'No microphone was found. Check your device and try again, or type your message instead.';
  const generic = 'Voice input isn’t available right now. Please try again or type your message.';

  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
      return micBlocked;
    }
    if (e.name === 'NotFoundError') {
      return noMic;
    }
    if (e.message) return e.message;
  }
  if (e instanceof Error) {
    const m = e.message;
    if (/permission denied/i.test(m) || /microphone access was denied/i.test(m)) {
      return micBlocked;
    }
    return m;
  }
  return generic;
}

/**
 * Begin microphone capture and transcription (WebSocket or browser STT).
 */
export async function startSpeechCapture(
  onLevels: (levels: number[]) => void
): Promise<RunningSpeechCapture> {
  const mode = getSpeechEngineMode();
  if (mode === 'none') {
    throw new Error(
      'No speech engine available. Set VITE_SPEECH_WEBSOCKET_URL or use a browser with Web Speech API (e.g. Chrome).'
    );
  }
  const wsUrl = import.meta.env.VITE_SPEECH_WEBSOCKET_URL;
  if (mode === 'websocket' && typeof wsUrl === 'string' && wsUrl.trim()) {
    return runWebSocketCapture(wsUrl.trim(), onLevels);
  }
  return runBrowserSpeechCapture(onLevels);
}
