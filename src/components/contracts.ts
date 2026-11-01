import type { ApiError, Input, Output } from "../contracts/operations";
import type {
  Card,
  Claim,
  Deck,
  Failure,
  Identity,
  Interest,
  Person,
  ResearchFact,
  ResearchRun,
} from "../contracts/domain";

/** Resource state supplied by a page or client controller. Controllers aggregate cursor pages. */
export type AsyncData<T> = {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
};

export type IdentityEditorProps = {
  state: AsyncData<Identity>;
  onSave: (input: Input<"saveIdentity">) => Promise<Output<"saveIdentity">>;
};

export type InterestManagerProps = {
  identityConfigured: boolean | null;
  state: AsyncData<Interest[]>;
  currentUserId: string | null;
  people: AsyncData<Person[]>;
  onSelect: (interestId: string, personId: string) => Promise<void>;
  onCreate: (input: Input<"createInterest">) => Promise<Output<"createInterest">>;
  onUpdate: (input: Input<"updateInterest">) => Promise<Output<"updateInterest">>;
  onDelete: (input: Input<"deleteInterest">) => Promise<Output<"deleteInterest">>;
};

export type PeopleListProps = {
  state: AsyncData<Person[]>;
  onCreate: (input: Input<"createPerson">) => Promise<Output<"createPerson">>;
  onUpdate: (input: Input<"updatePerson">) => Promise<Output<"updatePerson">>;
  onDelete: (input: Input<"deletePerson">) => Promise<Output<"deletePerson">>;
};

export type PersonDetailProps = {
  state: AsyncData<Person>;
  onUpdate: (input: Input<"updatePerson">) => Promise<Output<"updatePerson">>;
  onDelete: (input: Input<"deletePerson">) => Promise<Output<"deletePerson">>;
};

export type ClaimsLedgerProps = {
  personId: string;
  state: AsyncData<Claim[]>;
  onCreate: (input: Input<"createClaim">) => Promise<Output<"createClaim">>;
};

export type ConversationFormProps = {
  personId: string;
  onSubmit: (input: Input<"recordConversation">) => Promise<Output<"recordConversation">>;
  loading: boolean;
  error: ApiError | null;
};

export type ResearchTimelineProps = {
  interestId: string;
  state: AsyncData<{ runs: ResearchRun[]; facts: ResearchFact[] }>;
  onRunNow: (input: Input<"startResearch">) => Promise<Output<"startResearch">>;
};

export type DeckBuilderProps = {
  personId: string;
  state: AsyncData<Deck>;
  onBuild: (input: Input<"buildDeck">) => Promise<Output<"buildDeck">>;
};

export type FlashcardProps = {
  state: AsyncData<Card>;
  answerRevealed: boolean;
  onRevealChange: (revealed: boolean) => void;
};

export type PrepModeProps = {
  state: AsyncData<Deck>;
  activeCard: Card | null;
  answerRevealed: boolean;
  onRevealChange: (revealed: boolean) => void;
  onPrevious: () => Promise<void>;
  onNext: () => Promise<void>;
};

export type LiveModeProps = {
  state: AsyncData<Deck>;
  activeCard: Card | null;
  topics: Interest[];
  activeInterestId: string | null;
  onPrevious: () => Promise<void>;
  onNext: () => Promise<void>;
  onJumpToInterest: (interestId: string) => Promise<void>;
  onJumpToType: (type: Card["type"]) => Promise<void>;
  /** Present when the live suggestions panel should render. */
  suggest?: LiveSuggestPanelProps;
};

export type LiveSuggestMatches = { revision: number; cards: Card[]; warnings: string[] };

/** Provisional model text; never a saved or source-linked card. */
export type LiveSuggestion = {
  revision: number;
  text: string;
  status: "streaming" | "done" | "incomplete";
  error: Failure | null;
};

export type LiveSuggestState = {
  matches: LiveSuggestMatches | null;
  suggestion: LiveSuggestion | null;
  /** Revision of the generation in flight, or null. */
  generatingRevision: number | null;
  /** Request-level failure (non-200 response or network). */
  error: Failure | null;
  /** True after a non-retryable failure; requests resume only on a user action. */
  halted: boolean;
  /** True after a server configuration error; card matching continues, generation waits for Retry. */
  generationPaused: boolean;
};

export type LiveSpeechState = {
  /** null until feature detection runs in the browser. */
  supported: boolean | null;
  listening: boolean;
  heard: string;
  error: string | null;
};

export type LiveSuggestPanelProps = {
  /** False outside the real backend (memory/mock API modes). */
  available: boolean;
  speech: LiveSpeechState;
  state: LiveSuggestState;
  onListenChange: (listen: boolean) => void;
  onTypedChange: (text: string) => void;
  onTypedSubmit: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
  onOpenCard: (cardId: string) => void;
};
