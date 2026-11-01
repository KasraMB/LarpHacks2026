import { InterestsController } from "@/components/controllers/InterestsController";

export default function InterestsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Interests</h1>
      <p className="text-slate-600">Topics Alias researches online so your story stays current.</p>
      <InterestsController />
    </section>
  );
}
