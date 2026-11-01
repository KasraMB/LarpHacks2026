"use client";

import { IdentityEditor } from "@/components/IdentityEditor";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

export function IdentityController() {
  const identity = useResource("identity", () => api.getIdentity({}));

  return (
    <IdentityEditor
      state={{ data: identity.data, loading: identity.loading, error: identity.error }}
      onSave={async (input) => {
        const saved = await api.saveIdentity(input);
        identity.setData(saved);
        return saved;
      }}
    />
  );
}
