import { InterestsController } from "@/components/controllers/InterestsController";

export default function InterestsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Skills library</h1>
      <p className="max-w-prose text-slate-600">Choose a public skill for your people, or create a public or private one. Alias finds sources from the topic when you run research. Your persona and conversations stay private.</p>
      <InterestsController />
    </section>
  );
}
