"use client";

import { useState } from "react";
import type { LiveSuggestPanelProps } from "./contracts";
import { CardTypeLabel, EvidenceList } from "./Flashcard";
import { AlertIcon, formatSerial } from "./ui";

const tag = "rounded-sm bg-night px-2 py-0.5 font-mono text-[11px] font-semibold text-night-muted";
const quietButton =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-sm border border-night-line bg-night px-3 text-sm font-semibold text-ground transition-colors hover:border-night-muted focus-visible:outline-ground disabled:cursor-not-allowed disabled:opacity-50";

export function LiveSuggestPanel({
  available,
  speech,
  state,
  onListenChange,
  onTypedChange,
  onTypedSubmit,
  onStop,
  onRetry,
  onOpenCard,
}: LiveSuggestPanelProps) {
  const [typed, setTyped] = useState("");
  const { matches, suggestion, generatingRevision, error, halted, generationPaused } = state;
  const canListen = available && speech.supported === true;
  const generating = generatingRevision !== null;
  const updating = generating && suggestion !== null && suggestion.revision !== generatingRevision;
  const busy = speech.listening || generating;

  return (
    <section
      aria-labelledby="live-suggest-heading"
      className="space-y-3.5 rounded-sm border border-night-line bg-night-raised p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="live-suggest-heading" className="flex items-center gap-2 text-sm font-bold">
          <span>Live assist</span>
          <span className={tag}>TRANSCRIPT // CARD MATCH</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={speech.listening}
            disabled={!canListen}
            onClick={() => onListenChange(!speech.listening)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-sm border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-ground disabled:cursor-not-allowed disabled:opacity-50 ${
              speech.listening
                ? "border-stamp bg-stamp text-night-ink"
                : "border-ground bg-ground text-ink hover:bg-raised"
            }`}
          >
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${speech.listening ? "pulse-dot bg-night-ink" : "bg-stamp"}`}
            />
            {speech.listening ? "Listening. Stop" : "Listen"}
          </button>
          {busy ? (
            <button type="button" onClick={onStop} className={quietButton}>
              Stop
            </button>
          ) : null}
        </div>
      </div>

      {!available ? (
        <p className="rounded-sm border border-dashed border-night-line px-3 py-2.5 text-sm text-night-muted">
          Live suggestions need the real backend. They are off in the in-memory and mock API modes.
        </p>
      ) : speech.supported === false ? (
        <p className="text-sm text-night-muted">
          This browser has no speech recognition. Type what you hear below to match saved cards.
        </p>
      ) : !speech.listening && speech.supported ? (
        <p className="text-[13px] leading-relaxed text-night-muted">
          Listen uses your browser&apos;s speech recognition, and some browsers send the audio to a remote speech
          service to turn it into text. Only the text goes to this app, and nothing is saved. It hears this
          device&apos;s microphone, not the other side of your call unless that plays out loud.
        </p>
      ) : null}

      {speech.error ? (
        <p role="alert" className="flex items-start gap-2 rounded-sm border border-neg-line bg-neg-bg px-3 py-2 text-sm text-neg-ink">
          <AlertIcon className="mt-0.5 shrink-0" />
          {speech.error}
        </p>
      ) : null}

      {speech.listening || speech.heard ? (
        <div className="space-y-1">
          <p className="font-mono text-[11px] font-semibold text-night-muted">HEARD</p>
          <p className="line-clamp-3 break-words whitespace-pre-wrap text-sm text-night-ink">
            {speech.heard || "Waiting for speech..."}
          </p>
        </div>
      ) : null}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (typed.trim().length >= 2) onTypedSubmit(typed);
        }}
      >
        <label htmlFor="live-typed" className="sr-only">
          Type what you hear
        </label>
        <input
          id="live-typed"
          type="text"
          value={typed}
          maxLength={1600}
          disabled={!available}
          autoComplete="off"
          placeholder="Or type what they said..."
          onChange={(event) => {
            setTyped(event.target.value);
            onTypedChange(event.target.value);
          }}
          className="h-11 min-w-0 flex-1 rounded-sm border border-night-line bg-night px-3 text-[15px] text-ground placeholder:text-night-muted hover:border-night-muted focus:border-night-muted focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ground disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button type="submit" disabled={!available || typed.trim().length < 2} className={`${quietButton} min-h-11`}>
          Ask
        </button>
      </form>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-neg-line bg-neg-bg px-3 py-2 text-sm text-neg-ink"
        >
          <span className="flex items-start gap-2">
            <AlertIcon className="mt-0.5 shrink-0" />
            {error.message}
          </span>
          {halted ? (
            <button type="button" onClick={onRetry} className="min-h-9 rounded-sm px-2 font-semibold underline underline-offset-4">
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {matches ? (
        <div className="space-y-2">
          <p className="flex items-center justify-between gap-2 font-mono text-[11px] font-semibold text-night-muted">
            <span>SAVED CARDS // SOURCE-LINKED</span>
            <span>{matches.cards.length} MATCHED</span>
          </p>
          {matches.cards.length === 0 ? (
            <p className="text-sm text-night-muted">No saved card matches these words yet.</p>
          ) : (
            <ul className="space-y-2" aria-live="polite">
              {matches.cards.slice(0, 3).map((card) => (
                <li key={card.id} className="card-in space-y-2.5 rounded-sm border border-night-line bg-night p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTypeLabel type={card.type} />
                    <button
                      type="button"
                      onClick={() => onOpenCard(card.id)}
                      className="min-h-9 rounded-sm font-mono text-[11px] font-semibold text-night-muted underline decoration-night-line underline-offset-4 hover:text-ground focus-visible:outline-ground"
                    >
                      {formatSerial("CRD", card.position + 1)} // SHOW IN DECK
                    </button>
                  </div>
                  <p className="break-words text-sm font-semibold text-night-muted">{card.prompt}</p>
                  <p className="break-words text-[17px] font-semibold leading-snug text-ground">{card.answer}</p>
                  <EvidenceList evidence={card.evidence} />
                </li>
              ))}
            </ul>
          )}
          {matches.warnings.length > 0 ? (
            <ul className="space-y-1 text-[13px] text-night-muted">
              {matches.warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-1.5">
                  <AlertIcon className="mt-0.5 shrink-0" />
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {suggestion || generating ? (
        <div className="space-y-2 rounded-sm border border-dashed border-night-muted p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-night-ink">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-stamp" />
              AI SUGGESTION // NOT A SAVED CARD
            </p>
            <p role="status" className="font-mono text-[11px] font-semibold text-night-muted">
              {suggestionStatus(suggestion?.status, generating, updating)}
            </p>
          </div>
          {suggestion?.text ? (
            <p
              aria-busy={suggestion.status === "streaming"}
              className={`break-words whitespace-pre-wrap text-[15px] leading-relaxed ${updating ? "text-night-muted" : "text-ground"}`}
            >
              {suggestion.text}
            </p>
          ) : generating ? (
            <p className="flex items-center gap-2 text-sm text-night-muted">
              <span aria-hidden="true" className="pulse-dot size-1.5 rounded-full bg-signal" />
              Thinking...
            </p>
          ) : suggestion?.status === "done" ? (
            <p className="text-sm text-night-muted">No suggestion this time. Use the saved cards.</p>
          ) : null}
          {suggestion?.status === "incomplete" && !updating ? (
            <p className="rounded-sm border border-warn-line bg-warn-bg px-2.5 py-1.5 text-[13px] text-warn-ink">
              {suggestion.error?.message ?? "This suggestion stopped before it finished. Treat it as incomplete."}
            </p>
          ) : null}
          {generationPaused ? (
            <button type="button" onClick={onRetry} className={quietButton}>
              Retry suggestion
            </button>
          ) : null}
          <p className="text-[12px] text-night-muted">
            Unverified advice from the model, based on the transcript. It is not saved and has no sources.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function suggestionStatus(status: "streaming" | "done" | "incomplete" | undefined, generating: boolean, updating: boolean) {
  if (updating) return "UPDATING...";
  if (status === "streaming" || (generating && !status)) return "STREAMING...";
  if (status === "done") return "COMPLETE";
  if (status === "incomplete") return "INCOMPLETE";
  return "";
}
