import type { ApiError, Input, Output } from "../contracts/operations";
import type {
  Card,
  Claim,
  Deck,
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
  state: AsyncData<Interest[]>;
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
};
