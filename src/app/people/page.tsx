import { PeopleController } from "@/components/controllers/PeopleController";
import { PageHeader } from "@/components/ui";

export default function PeoplePage() {
  return (
    <section>
      <PageHeader title="People">Everyone who knows you by your cover, and what you have told each of them.</PageHeader>
      <PeopleController />
    </section>
  );
}
