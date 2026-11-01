import { PersonController } from "@/components/controllers/PersonController";

export default async function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Person</h1>
      <PersonController key={personId} personId={personId} />
    </section>
  );
}
