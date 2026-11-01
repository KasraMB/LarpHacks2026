import { PeopleController } from "@/components/controllers/PeopleController";

export default function PeoplePage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">People</h1>
      <PeopleController />
    </section>
  );
}
