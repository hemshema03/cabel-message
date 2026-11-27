"use client";

import { useQuery } from "@tanstack/react-query";
import ImportRecipients, { type Recipient } from "./import-recipients";

export default function UnpaidAccounts({ ready }: { ready: boolean }) {
  const accounts = useQuery<Recipient[]>({
    queryKey: ["unpaid-accounts"],
    queryFn: async () => {
      const response = await fetch("/api/unpaid/accounts");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load unpaid customers.");
      return data;
    },
  });

  if (accounts.isPending) return <p role="status">Loading unpaid customers…</p>;
  if (accounts.isError) return (
    <section className="sv-panel" role="alert">
      <p>{accounts.error.message}</p>
      <button className="sv-button border-sv-border bg-white" onClick={() => accounts.refetch()}>Try again</button>
    </section>
  );
  if (!accounts.data.length) return <p className="sv-panel">No customers have an outstanding balance.</p>;
  return <ImportRecipients rows={accounts.data} unpaid accountBalances ready={ready} />;
}
