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
        Keep your cover identity consistent. Review what you told each person before your next conversation.
      </PageHeader>
      <HomeController />
    </section>
  );
}
