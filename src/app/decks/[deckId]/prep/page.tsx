import { DeckPrepController } from "@/components/controllers/DeckPrepController";

export default async function PrepPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  return <DeckPrepController deckId={deckId} />;
}
