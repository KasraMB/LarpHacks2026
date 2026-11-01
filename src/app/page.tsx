import { HomeController } from "@/components/controllers/HomeController";

export default function HomePage() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Alias</h1>
        <p className="max-w-prose text-slate-600">
          Keep your cover identity consistent. Review what you told each person before your next conversation.
        </p>
      </div>
      <HomeController />
    </section>
  );
}
