import { IdentityController } from "@/components/controllers/IdentityController";

export default function IdentityPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Cover identity</h1>
      <IdentityController />
    </section>
  );
}
