import { PersonController } from "@/components/controllers/PersonController";

export default async function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  return <PersonController key={personId} personId={personId} />;
}
