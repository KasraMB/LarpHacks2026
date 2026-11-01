import { ResearchController } from "@/components/controllers/ResearchController";

export default async function InterestPage({ params }: { params: Promise<{ interestId: string }> }) {
  const { interestId } = await params;
  return (
    <section>
      <ResearchController key={interestId} interestId={interestId} />
    </section>
  );
}
