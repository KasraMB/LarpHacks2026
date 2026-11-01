"use client";

import { InterestManager } from "@/components/InterestManager";
import { api, apiMode } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { listAll, useResource } from "@/lib/use-resource";

export function InterestsController() {
  return apiMode === "real" ? <SignedInInterests /> : <Library currentUserId={null} />;
}

function SignedInInterests() {
  const session = authClient.useSession();
  return <Library currentUserId={session.data?.user.id ?? null} />;
}

function Library({ currentUserId }: { currentUserId: string | null }) {
  const identity = useResource("library-identity", () => api.getIdentity({}));
  const interests = useResource("interests", () => listAll((cursor) => api.listInterests({ cursor, limit: 100 })));
  const people = useResource("library-people", () => listAll((cursor) => api.listPeople({ cursor, limit: 100 })));

  return (
    <InterestManager
      identityConfigured={identity.loading || identity.error ? null : Boolean(identity.data)}
      state={{ data: interests.data, loading: interests.loading, error: interests.error }}
      currentUserId={currentUserId}
      people={{ data: people.data, loading: people.loading, error: people.error }}
      onSelect={async (interestId, personId) => {
        const person = await api.getPerson({ id: personId });
        await api.updatePerson({ id: personId, data: { name: person.name, notes: person.notes, interestIds: [...new Set([...person.interestIds, interestId])] } });
      }}
      onCreate={async (input) => {
        const created = await api.createInterest(input);
        interests.setData((list) => [...(list ?? []), created]);
        await interests.reload();
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
