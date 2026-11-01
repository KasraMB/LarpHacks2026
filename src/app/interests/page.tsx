import { InterestsController } from "@/components/controllers/InterestsController";

export default function InterestsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Interests</h1>
      <p className="max-w-prose text-slate-600">Add a topic and Alias finds sources automatically when you run research. Search terms and custom feeds are optional extras.</p>
      <InterestsController />
    </section>
  );
}
