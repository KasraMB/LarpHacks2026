import { HomeController } from "@/components/controllers/HomeController";
import { PageHeader } from "@/components/ui";

export default function HomePage() {
  return (
    <section>
      <PageHeader title="Stay in character">
        Keep a cover identity consistent. Track what you follow, who you talk to, and what you have told them,
        then review flashcards before each chat.
      </PageHeader>
      <HomeController />
    </section>
  );
}
