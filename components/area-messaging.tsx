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
export default function AreaMessaging({ ready }: { ready: boolean }) {
  const [area, setArea] = useState("");
  const [audience, setAudience] = useState<{
    area: string;
    rows: Recipient[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const areas = useQuery({
    queryKey: ["areas"],
    queryFn: () => get<string[]>("areas"),
    retry: 1,
  });
  return (
    <>
      <section className="card area-messaging-card">
        <></>
        {/* <h2 className="mb-1">Share a service update with an area</h2> */}
        <></>
        <div className="actions area-selection">
          <label className="area-field">
            <span>Choose area</span>
            
            <select
              disabled={busy || areas.isLoading}
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                setAudience(null);
                setError("");
              }}
            >
              <option value="">
                {areas.isLoading ? "Loading areas…" : "Select an area"}
              </option>
              {areas.data?.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            disabled={!area || busy}
            onClick={async () => {
              setBusy(true);
              setAudience(null);
              setError("");
              try {
                const params = new URLSearchParams({ area, kind: "customers" });
                const rows = await get<Recipient[]>(
                  "area-recipients?" + params,
                );
                setAudience({ area, rows });
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
        {areas.error && (
          <p className="feedback error" role="alert">
            Could not load areas.{" "}
            <button className="text-button" onClick={() => areas.refetch()}>
              Try again
            </button>
          </p>
        )}
        {areas.data?.length === 0 && (
          <p>
            No areas found. Add an Area column when importing your customer
            file.
          </p>
        )}
        {error && (
          <p className="feedback error" role="alert">
            {error}
          </p>
        )}
        {audience && !audience.rows.length && (
          <p className="feedback warning">
            No eligible customers in {audience.area}. No messages will be sent.
          </p>
        )}
      </section>
      {audience && audience.rows.length > 0 && (
        <ImportRecipients
          key={audience.area}
          rows={audience.rows}
          unpaid={false}
          ready={ready}
          targetArea={audience.area}
        />
      )}
    </>
  );
}
