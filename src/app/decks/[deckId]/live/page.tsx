export default async function LivePage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  return <section><h1>Live mode</h1><p>Deck: {deckId}</p></section>;
}
