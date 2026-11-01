import { IdentityController } from "@/components/controllers/IdentityController";
import { PageHeader } from "@/components/ui";

export default function IdentityPage() {
  return (
    <section>
      <PageHeader
        title="Cover identity"
        aside={<span className="serial-tag">SECTOR // ID-01</span>}
      >
        The baseline persona you maintain across conversations. Every logged claim and generated flashcard is verified
        against this cover file.
      </PageHeader>
      <IdentityController />
    </section>
  );
}
