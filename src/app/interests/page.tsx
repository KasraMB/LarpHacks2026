import { InterestsController } from "@/components/controllers/InterestsController";
import { PageHeader } from "@/components/ui";

export default function InterestsPage() {
  return (
    <section>
      <PageHeader title="Interests">Topics Alias researches online so your story stays current.</PageHeader>
      <InterestsController />
    </section>
  );
}
