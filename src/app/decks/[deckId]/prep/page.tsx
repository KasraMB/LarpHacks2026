export default async function PrepPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  return <section><h1>Prep mode</h1><p>Deck: {deckId}</p></section>;
}
