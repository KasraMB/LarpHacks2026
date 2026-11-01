import { PeopleController } from "@/components/controllers/PeopleController";
import { PageHeader } from "@/components/ui";

export default function PeoplePage() {
  return (
    <section>
      <PageHeader
        title="People"
        aside={<span className="serial-tag">SECTOR // CONTACTS</span>}
      >
        Everyone who knows you by your cover identity. Alias maintains a separate claims ledger and last-conversation
        cutoff timestamp for each contact.
      </PageHeader>
      <PeopleController />
    </section>
  );
}
