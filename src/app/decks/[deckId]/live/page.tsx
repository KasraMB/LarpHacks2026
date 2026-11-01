import { DeckLiveController } from "@/components/controllers/DeckLiveController";

export default async function LivePage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  return <DeckLiveController deckId={deckId} />;
}
