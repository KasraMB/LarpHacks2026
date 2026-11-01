import { HomeController } from "@/components/controllers/HomeController";
import { PageHeader } from "@/components/ui";

export default function HomePage() {
  return (
    <section>
      <PageHeader
        title="Stay in character"
        aside={
          <span className="serial-tag">
            DATUM REGISTER // ACTIVE
          </span>
        }
      >
        Keep a cover identity consistent across repeat conversations. Anchor every contact to their last-conversation
        cutoff, audit new claims against earlier ones, and brief yourself before the next call.
      </PageHeader>
      <HomeController />
    </section>
  );
}
