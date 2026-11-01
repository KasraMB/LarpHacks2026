import { HomeController } from "@/components/controllers/HomeController";

export default function HomePage() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Alias</h1>
        <p className="text-slate-600">
          Keep a cover identity consistent. Track what you follow, who you talk to, and what you have told them,
          then review flashcards before each chat.
        </p>
      </div>
      <HomeController />
    </section>
  );
}
