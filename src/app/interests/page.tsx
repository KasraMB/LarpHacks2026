import { InterestsController } from "@/components/controllers/InterestsController";
import { PageHeader } from "@/components/ui";

export default function InterestsPage() {
  return (
    <section>
      <PageHeader
        title="Skills library"
        aside={<span className="serial-tag">SECTOR // FEEDS</span>}
      >
        Choose a public skill for your people, or create a public or private one. Alias finds sources from the topic
        when you run research. Your persona and conversations stay private.
      </PageHeader>
      <InterestsController />
    </section>
  );
}
