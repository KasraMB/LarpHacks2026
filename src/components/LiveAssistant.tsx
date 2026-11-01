"use client";

import { useEffect, useRef, useState } from "react";
import type { Card, Deck } from "@/contracts";
import { createLiveSession, type LiveEvent } from "@/lib/live-session";
import { createSpeechCapture, type CaptureStatus, type RecognitionConstructor } from "@/lib/speech-capture";
import { matchLiveCards } from "@/lib/live-matching";
import { checkMicrophone } from "@/lib/microphone-check";
import { CardTypeLabel, EvidenceList } from "./Flashcard";
import { Button } from "./ui";

type SpeechWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };

/** The key in LiveMode resets all capture and requests when the deck changes. */
export function LiveAssistant({ deck }: { deck: Deck }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>("stopped");
  const [running, setRunning] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [language, setLanguage] = useState("en-US");
  const [error, setError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [microphoneCheck, setMicrophoneCheck] = useState<string | null>(null);
  const microphoneTest = useRef<ReturnType<typeof checkMicrophone> | null>(null);
  const [matches, setMatches] = useState<Card[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState({ revision: -1, text: "", phrase: "", pending: false, complete: false });
  const session = useRef<ReturnType<typeof createLiveSession> | null>(null);
  const capture = useRef<ReturnType<typeof createSpeechCapture> | null>(null);
  const alive = useRef(true);
  const currentText = useRef("");
  const transcriptField = useRef<HTMLTextAreaElement>(null);
  const cards = useRef(deck.cards);
  cards.current = deck.cards;

  useEffect(() => {
    alive.current = true;
    const browser = window as SpeechWindow;
    setSupported(Boolean(window.isSecureContext && (browser.SpeechRecognition ?? browser.webkitSpeechRecognition)));
    return () => {
      alive.current = false;
      capture.current?.dispose();
      microphoneTest.current?.stop();
      session.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (captureStatus !== "stopped" && transcriptField.current) {
      transcriptField.current.scrollTop = transcriptField.current.scrollHeight;
    }
  }, [transcript, captureStatus]);

  function receive(event: LiveEvent) {
    if (!alive.current) return;
    if (event.type === "delta") {
      setError(null);
      setSuggestion(previous => event.revision === previous.revision ? { ...previous, text: previous.text + event.text } : previous);
    } else if (event.type === "done") {
      setSuggestion(previous => event.revision === previous.revision ? { ...previous, pending: false, complete: true } : previous);
    } else if (event.type === "error") {
      setError(event.error.message);
      setSuggestion(previous => event.revision === previous.revision ? { ...previous, pending: false } : previous);
    }
    // Local snapshot matching is immediate and never replaced by a delayed server match.
  }

  function ensureSession() {
    if (!session.current) {
      session.current = createLiveSession({
        deckId: deck.id,
        retrieve: false,
        onEvent: receive,
        onError: message => {
          if (!alive.current) return;
          setError(message);
          setSuggestion(previous => ({ ...previous, pending: false }));
        },
        onGenerationStart: (revision, phrase) => {
          if (!alive.current) return;
          setError(null);
          setSuggestion({ revision, phrase, text: "", pending: true, complete: false });
        },
      });
    }
    setRunning(true);
    return session.current;
  }

  function updateText(value: string, send: boolean) {
    const bounded = value.slice(-1_600);
    currentText.current = bounded;
    setTranscript(bounded);
    setMatches(matchLiveCards(cards.current, bounded));
    if (send) ensureSession().update(bounded);
  }

  function stop() {
    microphoneTest.current?.stop();
    microphoneTest.current = null;
    setMicrophoneCheck(null);
    capture.current?.dispose();
    capture.current = null;
    session.current?.stop();
    session.current = null;
    setCaptureStatus("stopped");
    setRunning(false);
    setSuggestion(previous => ({ ...previous, pending: false }));
  }

  function startListening() {
    stop();
    setCaptureError(null);
    setMicrophoneCheck(null);
    setError(null);
    const browser = window as SpeechWindow;
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition || !window.isSecureContext) { setSupported(false); return; }
    try {
      capture.current = createSpeechCapture({
        Recognition,
        language,
        initialTranscript: currentText.current,
        onTranscript: value => updateText(value, true),
        onStatus: setCaptureStatus,
        onError: message => {
          setCaptureError(message);
          session.current?.stop();
          session.current = null;
          setRunning(false);
          setSuggestion(previous => ({ ...previous, pending: false }));
        },
      });
      capture.current.start();
    } catch { setCaptureError("Listening could not start. Try again, or type below."); }
  }

  const listening = captureStatus !== "stopped";
  const matched = matches.find(card => card.id === selectedId) ?? matches[0];
  return <div className="space-y-5 border-b border-slate-700 pb-6">
    <div className="space-y-2">
      <h2 className="text-2xl font-semibold">Listen and respond</h2>
      <p className="max-w-prose text-sm text-slate-300">Start listening to get guidance while someone is still speaking. Or type what you hear. Saved cards update immediately; new suggestions stream as they arrive.</p>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <Button variant="secondary" className="min-h-11" disabled={supported !== true || listening} onClick={startListening}>Start listening</Button>
      <Button variant="secondary" className="min-h-11" disabled={!listening && !running && !microphoneCheck} onClick={stop}>Stop</Button>
      <Button variant="secondary" className="min-h-11" onClick={() => {
        stop();
        if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
          setMicrophoneCheck("Microphone checks require HTTPS and browser microphone access.");
          return;
        }
        microphoneTest.current = checkMicrophone({ mediaDevices: navigator.mediaDevices, AudioContext: window.AudioContext,
          onStatus: message => { if (alive.current) setMicrophoneCheck(message); } });
      }}>Check microphone</Button>
      <label className="space-y-1 text-sm">
        <span className="block text-slate-300">Speech language</span>
        <select className="min-h-11 rounded-md bg-white px-3 py-2 text-slate-950" value={language} disabled={listening} onChange={event => setLanguage(event.target.value)}>
          <option value="en-US">English (US)</option><option value="en-GB">English (UK)</option><option value="fr-CA">French (Canada)</option><option value="es-ES">Spanish</option>
        </select>
      </label>
      <p role="status" className="py-2 text-sm text-slate-300">{captureStatus === "starting" ? "Starting microphone…" : captureStatus === "listening" ? "Listening · partial speech updates are on" : running ? "Following typed text · microphone off" : "Microphone off"}</p>
    </div>
    {microphoneCheck ? <p role="status" className="max-w-prose break-words text-sm text-slate-200">{microphoneCheck}</p> : null}
    <div className="space-y-2">
      <label htmlFor="live-transcript" className="block text-sm font-medium">Live transcript</label>
      <textarea ref={transcriptField} id="live-transcript" rows={2} maxLength={1_600} readOnly={listening} value={transcript} onChange={event => updateText(event.target.value, running)} className="w-full resize-y rounded-md border border-slate-500 bg-slate-900 px-3 py-2 text-base text-white placeholder:text-slate-400" placeholder={listening ? "Listening… words appear here as you speak." : "Type what you hear, or start listening."} aria-describedby="transcript-hint" />
      <p id="transcript-hint" className="text-xs text-slate-300">{listening ? "Updates while they speak, before the sentence is finished. Stop listening to edit." : "Type a question, then choose Get suggestions below. Stop ends requests."} Only the latest 1,600 characters are kept here.</p>
    </div>
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">Suggested reply</h3>
      {suggestion.phrase ? <p className="break-words text-xs text-slate-300">For: “{suggestion.phrase.slice(-240)}”</p> : null}
      <p className="min-h-16 whitespace-pre-wrap break-words text-xl leading-relaxed sm:text-2xl">{suggestion.text || (suggestion.pending ? "Finding a response from this deck’s saved context…" : "Listen or enter a question to get a suggested response.")}</p>
      <p role="status" className="text-xs text-slate-300">{suggestion.pending ? "Updating suggestion…" : suggestion.text ? suggestion.complete ? "Suggestion complete." : "Suggestion incomplete." : ""}</p>
      <p className="text-xs text-slate-300">Check before speaking. Suggestions can lag behind speech and may be wrong; they use this deck’s saved context.</p>
    </div>
    <p className="max-w-prose text-xs text-slate-300">Your browser may send audio to its speech service. Alias sends the transcript to its AI provider without saving it. The microphone hears nearby audio; it does not automatically capture another call’s audio.</p>
    {supported === false ? <p className="text-sm text-amber-200">Live speech recognition is unavailable here. Try Chrome or Edge over HTTPS, or use typed text below.</p> : null}
    {captureError ? <p role="alert" className="text-sm text-red-200">{captureError}</p> : null}
    {!listening ? <div className="flex flex-wrap gap-3">
      <Button variant="secondary" className="min-h-11" disabled={transcript.trim().length < 2} onClick={() => { session.current?.stop(); session.current = null; ensureSession().update(currentText.current); }}>Get suggestions</Button>
      <button type="button" className="min-h-11 px-2 text-sm text-sky-300 underline disabled:opacity-50" disabled={!transcript} onClick={() => { stop(); updateText("", false); setSuggestion({ revision: -1, text: "", phrase: "", pending: false, complete: false }); setError(null); setCaptureError(null); }}>Clear conversation</button>
    </div> : null}
    {error ? <p role="alert" className="text-sm text-red-200">{error} Saved cards below still work. Stop and choose Get suggestions to retry.</p> : null}
    {matched ? <div className="space-y-3">
      <h3 className="text-lg font-semibold">Matching saved card</h3>
      {matches.length > 1 ? <div className="flex flex-wrap gap-2" role="group" aria-label="Matching cards">{matches.map(card => <button type="button" key={card.id} aria-pressed={matched.id === card.id} onClick={() => setSelectedId(card.id)} className={`min-h-11 max-w-full break-words rounded-md border px-3 py-2 text-left text-sm ${matched.id === card.id ? "border-white bg-white text-slate-950" : "border-slate-500 hover:bg-slate-800"}`}>{card.prompt}</button>)}</div> : null}
      <CardTypeLabel type={matched.type} />
      <p className="break-words text-xl font-semibold">{matched.prompt}</p>
      <p className="break-words text-xl text-slate-100">{matched.answer}</p>
      <div className="rounded-md bg-white p-3"><EvidenceList evidence={matched.evidence} /></div>
    </div> : transcript.trim() ? <p className="text-sm text-slate-300">No matching saved card yet. Suggestions can still use this deck’s other saved evidence.</p> : null}
  </div>;
}
