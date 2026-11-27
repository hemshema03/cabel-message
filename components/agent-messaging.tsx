"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ImportRecipients, { type Recipient } from "./import-recipients";
async function get<T>(path: string): Promise<T> {
  const response = await fetch("/api/" + path);
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || "Unable to load customers. Please try again.",
    );
  return data;
}
export default function AgentMessaging({ ready }: { ready: boolean }) {
  const [agent, setAgent] = useState("");
  const [audience, setAudience] = useState<{
    agent: string;
    rows: Recipient[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const agents = useQuery({
    queryKey: ["collection-agents"],
    queryFn: () => get<string[]>("collection-agents"),
    retry: 1,
  });
  return (
    <>
      <section className="sv-panel">
        <div className="flex flex-wrap items-center gap-2 items-end">
          <label className="sv-label w-full sm:max-w-md">
            <span>Choose collection agent</span>
            
            <select className="sv-field"
              disabled={busy || agents.isLoading}
              value={agent}
              onChange={(e) => {
                setAgent(e.target.value);
                setAudience(null);
                setError("");
              }}
            >
              <option value="">
                {agents.isLoading ? "Loading agents…" : "Select a collection agent"}
              </option>
              {agents.data?.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <button
            className="sv-button bg-sv-primary text-white"
            disabled={!agent || busy}
            onClick={async () => {
              setBusy(true);
              setAudience(null);
              setError("");
              try {
                const params = new URLSearchParams({ agent });
                const rows = await get<Recipient[]>(
                  "agent-recipients?" + params,
                );
                setAudience({ agent, rows });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Loading customers…" : "Choose recipients & write message"}
          </button>
        </div>
        {agents.error && (
          <p className="border-l-4 border-sv-red bg-red-50 px-3 py-2 text-red-900" role="alert">
            Could not load agents.{" "}
            <button className="cursor-pointer text-sv-primary underline underline-offset-2" onClick={() => agents.refetch()}>
              Try again
            </button>
          </p>
        )}
        {agents.data?.length === 0 && (
          <p>
            No collection agents found. Add one in Masters to get started.
          </p>
        )}
        {error && (
          <p className="border-l-4 border-sv-red bg-red-50 px-3 py-2 text-red-900" role="alert">
            {error}
          </p>
        )}
        {audience && !audience.rows.length && (
          <p className="border-l-4 border-sv-yellow bg-amber-50 px-3 py-2 text-amber-950">
            No eligible customers are assigned to {audience.agent}.
          </p>
        )}
      </section>
      {audience && audience.rows.length > 0 && (
        <ImportRecipients
          key={audience.agent}
          rows={audience.rows}
          unpaid={false}
          ready={ready}
          targetAgent={audience.agent}
        />
      )}
    </>
  );
}
