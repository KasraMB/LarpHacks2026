"use client";

import { InterestManager } from "@/components/InterestManager";
import { api } from "@/lib/api";
import { listAll, useResource } from "@/lib/use-resource";

export function InterestsController() {
  const interests = useResource("interests", () => listAll((cursor) => api.listInterests({ cursor, limit: 100 })));

  return (
    <InterestManager
      state={{ data: interests.data, loading: interests.loading, error: interests.error }}
      onCreate={async (input) => {
        const created = await api.createInterest(input);
        interests.setData((list) => [...(list ?? []), created]);
        return created;
      }}
      onUpdate={async (input) => {
        const updated = await api.updateInterest(input);
        interests.setData((list) => (list ?? []).map((i) => (i.id === updated.id ? updated : i)));
        return updated;
      }}
      onDelete={async (input) => {
        const result = await api.deleteInterest(input);
        interests.setData((list) => (list ?? []).filter((i) => i.id !== input.id));
        return result;
      }}
    />
  );
}
