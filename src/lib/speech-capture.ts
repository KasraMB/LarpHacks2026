/** Browser speech recognition is intentionally optional. Audio is handled by the browser. */
export interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start(): void;
  abort(): void;
}

export type RecognitionConstructor = new () => Recognition;
export type CaptureStatus = "starting" | "listening" | "stopped";

export function createSpeechCapture(options: {
  Recognition: RecognitionConstructor;
  language: string;
  onTranscript(text: string): void;
  onStatus(status: CaptureStatus): void;
  onError(message: string): void;
  initialTranscript?: string;
}) {
  const recognition = new options.Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = options.language;
  let active = false;
  let disposed = false;
  let committed = options.initialTranscript?.slice(-1_600) ?? "";
  let results = new Map<number, string>();
  let restart: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let audioStarted = false;
  let speechStarted = false;
  let emptyRestarts = 0;
  const text = () => [committed, ...results.values()].filter(Boolean).join(" ").trim().slice(-1_600);
  const halt = () => {
    active = false;
    clearTimeout(restart);
    clearTimeout(watchdog);
    try { recognition.abort(); } catch { /* Recognition may already be stopped. */ }
    options.onStatus("stopped");
  };
  const fail = (message: string) => { halt(); options.onError(message); };
  const begin = () => {
    if (!active || disposed) return;
    options.onStatus("starting");
    try { recognition.start(); }
    catch { fail("Listening could not start. Check microphone access and try again, or type below."); }
  };
  recognition.onstart = () => { if (active && !disposed) options.onStatus("listening"); };
  recognition.onaudiostart = () => { if (active && !disposed) audioStarted = true; };
  recognition.onspeechstart = () => { if (active && !disposed) speechStarted = true; };
  recognition.onresult = (event) => {
    if (!active || disposed) return;
    let receivedWords = false;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const value = event.results[i]?.[0]?.transcript;
      if (typeof value === "string") {
        results.set(i, value.slice(-1_600));
        if (value.trim()) receivedWords = true;
      }
    }
    if (receivedWords) { emptyRestarts = 0; clearTimeout(watchdog); }
    // Keep recent segments only, even in a recognition session lasting hours.
    while (results.size > 1 && [...results.values()].join(" ").length > 1_600) results.delete(results.keys().next().value!);
    options.onTranscript(text());
  };
  recognition.onerror = (event) => {
    if (!active || disposed || event.error === "no-speech") return;
    const messages: Record<string, string> = {
      "not-allowed": "Microphone access was denied. Allow it in browser settings and start again, or type below.",
      "service-not-allowed": "Speech recognition is unavailable in this browser. Type what you hear below.",
      "audio-capture": "No microphone is available. Connect one and try again, or type below.",
      network: "Speech recognition lost its connection. Start again, or type below.",
      "language-not-supported": "This recognition language is unavailable. Choose another language or type below.",
    };
    fail(messages[event.error] ?? "Listening stopped unexpectedly. Start again, or type below.");
  };
  recognition.onend = () => {
    if (!active || disposed) return;
    committed = text();
    results = new Map();
    if (++emptyRestarts > 3) { fail("No speech was detected. Check your microphone and start again, or type below."); return; }
    options.onStatus("starting");
    restart = setTimeout(begin, 300);
  };
  return {
    start() {
      if (!disposed && !active) {
        active = true;
        audioStarted = speechStarted = false;
        // Some browsers expose recognition and emit start, then never return
        // either words or an error. Bound that silent failure across restarts.
        watchdog = setTimeout(() => {
          if (!active || disposed) return;
          fail(speechStarted
            ? "Speech was detected, but the browser returned no transcript. Its speech service may be unavailable. Try another browser, or type below."
            : audioStarted
              ? "The microphone opened, but no words were recognized. Check the selected input and speech language, then try again, or type below."
              : "The browser did not start microphone capture. Check site and system microphone permissions, then try again, or type below.");
        }, 20_000);
        begin();
      }
    },
    stop: halt,
    dispose() {
      disposed = true;
      active = false;
      clearTimeout(restart);
      clearTimeout(watchdog);
      recognition.onaudiostart = recognition.onspeechstart = null;
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
      try { recognition.abort(); } catch { /* No active browser session. */ }
    },
  };
}
