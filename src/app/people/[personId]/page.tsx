export default async function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  return <section><h1>Person</h1><p>Profile: {personId}</p></section>;
}
