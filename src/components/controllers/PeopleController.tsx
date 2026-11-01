"use client";

import { api } from "@/lib/api";
import { listAll, useResource } from "@/lib/use-resource";
import { PeopleList } from "../PeopleList";

export function PeopleController() {
  const people = useResource("people", () => listAll((cursor) => api.listPeople({ cursor, limit: 100 })));

  return (
    <PeopleList
      state={{ data: people.data, loading: people.loading, error: people.error }}
      onCreate={async (input) => {
        const created = await api.createPerson(input);
        people.setData((list) => [created, ...(list ?? [])]);
        return created;
      }}
      onUpdate={async (input) => {
        const updated = await api.updatePerson(input);
        people.setData((list) => (list ?? []).map((p) => (p.id === updated.id ? updated : p)));
        return updated;
      }}
      onDelete={async (input) => {
        const result = await api.deletePerson(input);
        people.setData((list) => (list ?? []).filter((p) => p.id !== input.id));
        return result;
      }}
    />
  );
}
