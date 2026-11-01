"use client";

import { useEffect, useRef, useState } from "react";
import type { Card, Deck } from "@/contracts";
import { createLiveSession, type LiveEvent } from "@/lib/live-session";
import { createSpeechCapture, type CaptureStatus, type RecognitionConstructor } from "@/lib/speech-capture";
import { matchLiveCards } from "@/lib/live-matching";
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
  const [matches, setMatches] = useState<Card[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState({ revision: -1, text: "", phrase: "", pending: false, complete: false });
  const session = useRef<ReturnType<typeof createLiveSession> | null>(null);
  const capture = useRef<ReturnType<typeof createSpeechCapture> | null>(null);
  const alive = useRef(true);
  const currentText = useRef("");
  const cards = useRef(deck.cards);
  cards.current = deck.cards;

  useEffect(() => {
    alive.current = true;
    const browser = window as SpeechWindow;
    setSupported(Boolean(window.isSecureContext && (browser.SpeechRecognition ?? browser.webkitSpeechRecognition)));
    return () => {
      alive.current = false;
      capture.current?.dispose();
      session.current?.stop();
    };
  }, []);

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
  return <div className="space-y-5 border-b border-night-line pb-6">
    <div className="space-y-2">
      <h2 className="text-2xl font-bold tracking-[-0.02em] text-night-ink">Listen and respond</h2>
      <p className="max-w-prose break-words text-sm text-night-muted">Start listening to get guidance while someone is still speaking. Or type what you hear. Saved cards update immediately; new suggestions stream as they arrive.</p>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <Button variant="secondary" className="min-h-11 border-night-line! bg-night-raised! text-ground! hover:border-night-muted! hover:bg-night-line! active:bg-night-line! disabled:text-night-muted!" disabled={supported !== true || listening} onClick={startListening}>Start listening</Button>
      <Button variant="secondary" className="min-h-11 border-night-line! bg-night-raised! text-ground! hover:border-night-muted! hover:bg-night-line! active:bg-night-line! disabled:text-night-muted!" disabled={!listening && !running} onClick={stop}>Stop</Button>
      <label className="space-y-1 text-sm">
        <span className="block font-mono text-xs font-semibold uppercase text-night-muted">Speech language</span>
        <select className="min-h-11 max-w-full rounded-sm border border-night-line bg-night-raised px-3 py-2 text-base text-night-ink hover:border-night-muted focus:border-night-muted focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal disabled:opacity-50" value={language} disabled={listening} onChange={event => setLanguage(event.target.value)}>
          <option value="en-US">English (US)</option><option value="en-GB">English (UK)</option><option value="fr-CA">French (Canada)</option><option value="es-ES">Spanish</option>
        </select>
      </label>
      <p role="status" className="break-words py-2 font-mono text-xs text-night-muted">{captureStatus === "starting" ? "Starting microphone…" : captureStatus === "listening" ? "Listening · partial speech updates are on" : running ? "Following typed text · microphone off" : "Microphone off"}</p>
    </div>
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold text-night-ink">Suggested reply</h3><span className="rounded-sm border border-dashed border-signal px-2 py-0.5 font-mono text-[11px] font-bold uppercase text-signal">AI SUGGESTION</span></div>
      {suggestion.phrase ? <p className="break-words font-mono text-xs text-night-muted">For: “{suggestion.phrase.slice(-240)}”</p> : null}
      <p className="min-h-16 whitespace-pre-wrap break-words rounded-sm border border-dashed border-signal/60 px-3 py-2.5 text-xl leading-relaxed text-night-ink sm:text-2xl">{suggestion.text || (suggestion.pending ? "Finding a response from this deck’s saved context…" : "Listen or enter a question to get a suggested response.")}</p>
      <p role="status" className={`font-mono text-xs ${suggestion.text && !suggestion.pending && !suggestion.complete ? "font-semibold text-warn-ink" : "text-night-muted"}`}>{suggestion.pending ? "Updating suggestion…" : suggestion.text ? suggestion.complete ? "Suggestion complete." : "Suggestion incomplete." : ""}</p>
      <p className="break-words text-xs text-night-muted">Check before speaking. Suggestions can lag behind speech and may be wrong; they use this deck’s saved context.</p>
    </div>
    <p className="max-w-prose break-words text-xs text-night-muted">Your browser may send audio to its speech service. Alias sends the transcript to its AI provider without saving it. The microphone hears nearby audio; it does not automatically capture another call’s audio.</p>
    {supported === false ? <p className="break-words rounded-sm border border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn-ink">Live speech recognition is unavailable here. Try Chrome or Edge over HTTPS, or use typed text below.</p> : null}
    {captureError ? <p role="alert" className="break-words rounded-sm border border-neg-line bg-neg-bg px-3 py-2 text-sm text-neg-ink">{captureError}</p> : null}
    <label className="block space-y-2">
      <span className="font-mono text-xs font-semibold uppercase text-night-muted">What you hear</span>
      <textarea rows={3} maxLength={1_600} readOnly={listening} value={transcript} onChange={event => updateText(event.target.value, running)} className="w-full resize-y rounded-sm border border-night-line bg-night-raised px-3 py-2 text-base text-night-ink placeholder:text-night-muted/70 hover:border-night-muted focus:border-night-muted focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal read-only:opacity-80" placeholder="For example: What do you like about C++?" aria-describedby="transcript-hint" />
      <span id="transcript-hint" className="block break-words text-xs text-night-muted">{listening ? "Partial speech appears here. Stop listening to edit it." : "Type a question, then choose Get suggestions. Keep typing to update them; Stop ends requests."} Only the latest 1,600 characters are used.</span>
    </label>
    {!listening ? <div className="flex flex-wrap gap-3">
      <Button variant="secondary" className="min-h-11 border-night-line! bg-night-raised! text-ground! hover:border-night-muted! hover:bg-night-line! active:bg-night-line! disabled:text-night-muted!" disabled={transcript.trim().length < 2} onClick={() => { session.current?.stop(); session.current = null; ensureSession().update(currentText.current); }}>Get suggestions</Button>
      <button type="button" className="min-h-11 rounded-sm px-2 text-sm font-semibold text-night-muted underline decoration-night-line underline-offset-4 hover:text-night-ink hover:decoration-night-ink focus-visible:outline-2 focus-visible:outline-signal disabled:opacity-50" disabled={!transcript} onClick={() => { stop(); updateText("", false); setSuggestion({ revision: -1, text: "", phrase: "", pending: false, complete: false }); setError(null); setCaptureError(null); }}>Clear conversation</button>
    </div> : null}
    {error ? <p role="alert" className="break-words rounded-sm border border-neg-line bg-neg-bg px-3 py-2 text-sm text-neg-ink">{error} Saved cards below still work. Stop and choose Get suggestions to retry.</p> : null}
    {matched ? <div className="space-y-3">
      <h3 className="font-mono text-xs font-semibold uppercase text-night-muted">Matching saved card</h3>
      {matches.length > 1 ? <div className="flex flex-wrap gap-2" role="group" aria-label="Matching cards">{matches.map(card => <button type="button" key={card.id} aria-pressed={matched.id === card.id} onClick={() => setSelectedId(card.id)} className={`min-h-11 max-w-full break-words rounded-sm border px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-signal ${matched.id === card.id ? "border-ground bg-ground text-ink" : "border-night-line bg-night-raised text-night-ink hover:border-night-muted"}`}>{card.prompt}</button>)}</div> : null}
      <CardTypeLabel type={matched.type} />
      <p className="break-words text-xl font-bold text-night-ink">{matched.prompt}</p>
      <p className="break-words text-xl text-night-ink">{matched.answer}</p>
      <div className="rounded-sm border border-night-line bg-night-raised p-3"><EvidenceList evidence={matched.evidence} /></div>
    </div> : transcript.trim() ? <p className="break-words text-sm text-night-muted">No matching saved card yet. Suggestions can still use this deck’s other saved evidence.</p> : null}
  </div>;
}
