import { PersonController } from "@/components/controllers/PersonController";

export default async function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  return (
    <section>
      <h1 className="sr-only">Person</h1>
      <PersonController personId={personId} />
    </section>
  );
}
