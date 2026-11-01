import { IdentityController } from "@/components/controllers/IdentityController";
import { PageHeader } from "@/components/ui";

export default function IdentityPage() {
  return (
    <section>
      <PageHeader title="Cover identity">
        The person you are when you talk to people. Every claim and flashcard is checked against this.
      </PageHeader>
      <IdentityController />
    </section>
  );
}
