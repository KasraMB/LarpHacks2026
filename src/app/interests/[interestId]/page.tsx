export default async function InterestPage({ params }: { params: Promise<{ interestId: string }> }) {
  const { interestId } = await params;
  return <section><h1>Interest</h1><p>Timeline: {interestId}</p></section>;
}
