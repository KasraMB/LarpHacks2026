"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveSpeechState } from "@/components/contracts";
import { capPhrase } from "./ndjson";

// Minimal local typing: lib.dom coverage varies and webkitSpeechRecognition is untyped.
type ResultList = ArrayLike<ArrayLike<{ transcript: string }>>;
type Recognizer = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  abort(): void;
  onresult: ((event: { results: ResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognizerConstructor = new () => Recognizer;

function recognizerConstructor(): RecognizerConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerConstructor; webkitSpeechRecognition?: RecognizerConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const errorMessages: Record<string, string> = {
  "not-allowed": "Microphone access was blocked. Allow it in your browser, or type what you hear.",
  "service-not-allowed": "This browser's speech service is unavailable. Type what you hear instead.",
  "audio-capture": "No microphone was found. Type what you hear instead.",
  network: "The browser's speech service could not be reached. Type what you hear instead.",
  "language-not-supported": "Speech recognition does not support this language here. Type instead.",
};

// Only recent speech, so card matches follow what was just said.
const SPEECH_WINDOW = 300;

/** Builds the newest phrase from the latest results, interim ones included. */
function latestPhrase(results: ResultList) {
  let text = "";
  for (let i = results.length - 1; i >= 0 && text.length < SPEECH_WINDOW; i--) {
    text = `${results[i][0]?.transcript ?? ""} ${text}`;
  }
  return capPhrase(text, SPEECH_WINDOW);
}

export function useSpeechRecognition(onPhrase: (text: string) => void) {
  const [state, setState] = useState<LiveSpeechState>({ supported: null, listening: false, heard: "", error: null });
  const recognizer = useRef<Recognizer | null>(null);
  const wanted = useRef(false);
  const onPhraseRef = useRef(onPhrase);
  onPhraseRef.current = onPhrase;

  // Detected after mount so server and first client render agree.
  useEffect(() => {
    setState((s) => ({ ...s, supported: recognizerConstructor() !== null }));
    return () => {
      wanted.current = false;
      recognizer.current?.abort();
      recognizer.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    wanted.current = false;
    const current = recognizer.current;
    recognizer.current = null;
    current?.abort();
    setState((s) => ({ ...s, listening: false }));
  }, []);

  const start = useCallback(() => {
    const Ctor = recognizerConstructor();
    if (!Ctor || recognizer.current) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = document.documentElement.lang || navigator.language;
    let startedAt = 0;
    let quickEnds = 0;

    const begin = () => {
      startedAt = Date.now();
      try {
        rec.start();
        return true;
      } catch {
        return false;
      }
    };
    rec.onresult = (event) => {
      if (recognizer.current !== rec) return;
      const text = latestPhrase(event.results);
      setState((s) => ({ ...s, heard: text }));
      onPhraseRef.current(text);
    };
    rec.onerror = (event) => {
      const message = errorMessages[event.error];
      if (!message || recognizer.current !== rec) return;
      wanted.current = false;
      setState((s) => ({ ...s, error: message }));
    };
    rec.onend = () => {
      if (recognizer.current !== rec) return;
      // Browsers end continuous sessions after silence; restart while the user still wants it,
      // but give up if it keeps ending immediately.
      quickEnds = Date.now() - startedAt < 1500 ? quickEnds + 1 : 0;
      if (wanted.current && quickEnds < 3) {
        setTimeout(() => {
          if (recognizer.current === rec && wanted.current && !begin()) stop();
        }, 300);
        return;
      }
      if (wanted.current) setState((s) => ({ ...s, error: "Speech recognition keeps stopping. Type what you hear instead." }));
      stop();
    };

    recognizer.current = rec;
    wanted.current = true;
    setState((s) => ({ ...s, listening: true, heard: "", error: null }));
    if (!begin()) {
      setState((s) => ({ ...s, error: "Speech recognition could not start. Type what you hear instead." }));
      stop();
    }
  }, [stop]);

  return { state, start, stop };
}
