"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import UnpaidUpload from "./unpaid-upload";
import ImportRecipients, { type Recipient } from "./import-recipients";

export default function UnpaidAccounts({ ready }: { ready: boolean }) {
  const [uploadTarget, setUploadTarget] = useState<HTMLDivElement | null>(null);
  const [agent, setAgent] = useState("");
  const accounts = useQuery<Recipient[]>({
    queryKey: ["unpaid-accounts"],
    queryFn: async () => {
      const response = await fetch("/api/unpaid/accounts");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load unpaid customers.");
      return data;
    },
  });

  const upload = <><div ref={setUploadTarget} /><UnpaidUpload ready={ready} uploadTarget={uploadTarget} /></>;
  if (accounts.isPending) return <p role="status">Loading unpaid customers…</p>;
  if (accounts.isError) return (
    <><div ref={setUploadTarget} /><UnpaidUpload ready={ready} uploadTarget={uploadTarget} /><section className="sv-panel" role="alert">
      <p>{accounts.error.message}</p>
      <button className="sv-button border-sv-border bg-white" onClick={() => accounts.refetch()}>Try again</button>
    </section></>
  );
  if (!accounts.data.length) return <>{upload}<p className="sv-panel">No customers have an outstanding balance.</p></>;
  const agents = [...new Set(accounts.data.map(row => row.profile?.agent?.trim()).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b));
  const rows = agent ? accounts.data.filter(row => row.profile?.agent?.trim() === agent) : accounts.data;
  return <>
    <div className="flex flex-wrap items-end justify-between gap-3">
    <label className="sv-label w-full max-w-sm">
      Collection agent
      <select className="sv-field" value={agent} onChange={event => setAgent(event.target.value)}>
        <option value="">All agents</option>
        {agents.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
    <div ref={setUploadTarget} />
    </div>
    <UnpaidUpload ready={ready} uploadTarget={uploadTarget} />
    <ImportRecipients key={agent} rows={rows} unpaid accountBalances ready={ready} />
  </>;
}
