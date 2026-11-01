import { InterestsController } from "@/components/controllers/InterestsController";
import { PageHeader } from "@/components/ui";

export default function InterestsPage() {
  return (
    <section>
      <PageHeader
        title="Interests"
        aside={<span className="serial-tag">SECTOR // FEEDS</span>}
      >
        Topics Alias researches across news feeds, Hacker News, Reddit, and Wikipedia so your cover story stays current
        between conversations.
      </PageHeader>
      <InterestsController />
    </section>
  );
}
