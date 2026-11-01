"use client";

import Link from "next/link";
import { Card, ErrorMessage, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { listAll, useResource } from "@/lib/use-resource";

export function HomeController() {
  const overview = useResource("home", async () => {
    const [identity, interests, people] = await Promise.all([
      api.getIdentity({}),
      listAll((cursor) => api.listInterests({ cursor, limit: 100 })),
      listAll((cursor) => api.listPeople({ cursor, limit: 100 })),
    ]);
    return { identity, interestCount: interests.length, peopleCount: people.length };
  });

  if (overview.loading && !overview.data) return <Loading />;
  if (overview.error) return <ErrorMessage error={overview.error} onRetry={overview.reload} />;
  if (!overview.data) return null;
  const { identity, interestCount, peopleCount } = overview.data;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card className="space-y-1">
        <h2 className="text-sm font-medium text-slate-500">Identity</h2>
        {identity ? (
          <p className="font-medium">{identity.name}</p>
        ) : (
          <p className="text-sm text-slate-600">No identity yet.</p>
        )}
        <Link href="/identity" className="text-sm underline">{identity ? "Edit identity" : "Set up your identity"}</Link>
      </Card>
      <Card className="space-y-1">
        <h2 className="text-sm font-medium text-slate-500">Interests</h2>
        <p className="text-2xl font-semibold">{interestCount}</p>
        <Link href="/interests" className="text-sm underline">Manage interests</Link>
      </Card>
      <Card className="space-y-1">
        <h2 className="text-sm font-medium text-slate-500">People</h2>
        <p className="text-2xl font-semibold">{peopleCount}</p>
        <Link href="/people" className="text-sm underline">View people</Link>
      </Card>
    </div>
  );
}
