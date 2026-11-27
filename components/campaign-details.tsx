"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import CampaignActions from "./campaign-actions";
import { filterDeliveries, type DeliveryResult } from "@/lib/message-history";
type Detail = {
  campaign: { id: string; title: string; status: string; created_at: string };
  rows: DeliveryResult[];
};
export default function CampaignDetails({ id }: { id: string }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [area, setArea] = useState("");
  const [page, setPage] = useState(0);
  const query = useQuery<Detail>({
    queryKey: ["campaign-details", id],
    queryFn: async () => {
      const response = await fetch(`/api/campaigns/${id}/results`);
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load recipients.");
      return data;
    },
    refetchInterval: 10000,
    retry: 1,
  });
  const rows = query.data?.rows ?? [];
  const filtered = filterDeliveries(rows, search, status, area);
  const lastPage = Math.max(0, Math.ceil(filtered.length / 50) - 1);
  const current = Math.min(page, lastPage);
  const counts = Object.fromEntries(
    [...new Set(rows.map((row) => row.status))]
      .sort()
      .map((state) => [
        state,
        rows.filter((row) => row.status === state).length,
      ]),
  );
  return (
    <section className="sv-panel">
      <Link className="cursor-pointer text-sv-primary underline underline-offset-2" href="/history">
        ← Back to message history
      </Link>
      {query.isLoading ? (
        <p role="status">Loading recipients…</p>
      ) : query.error ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <button className="sv-button border-sv-border bg-white text-sv-text" onClick={() => query.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        query.data && (
          <>
            <div className="flex flex-wrap items-center gap-2 justify-between border-b border-sv-grid-border pb-2">
              <div>
                <h2 className="text-lg font-semibold">{query.data.campaign.title}</h2>
                <p>
                  {new Date(query.data.campaign.created_at).toLocaleString(
                    "en-IN",
                  )}{" "}
                  · {query.data.campaign.status.toLowerCase()}
                </p>
              </div>
              <CampaignActions
                id={id}
                title={query.data.campaign.title}
                status={query.data.campaign.status}
                detail
              />
            </div>
            <p>
              {rows.length} recipients · Updated every 10 seconds. Sent means
              WAHA accepted the message; delivered and read are confirmed by
              WhatsApp acknowledgements. Unknown outcomes require review before
              any resend.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(counts).map(([state, count]) => (
                <button
                  key={state}
                  className="sv-button border-sv-border bg-white text-sv-text text-xs"
                  aria-pressed={status === state}
                  onClick={() => {
                    setStatus(status === state ? "" : state);
                    setPage(0);
                  }}
                >
                  {state.toLowerCase()}: {count}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 [&>input]:max-w-xs [&>select]:max-w-xs">
              <input className="sv-field"
                aria-label="Search recipients"
                placeholder="Search name, CIN, phone, STB / User ID or message"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
              <label className="sv-label">
                Status
                <select className="sv-field"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">All statuses</option>
                  {Object.keys(counts).map((state) => (
                    <option key={state} value={state}>
                      {state.toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sv-label">
                Area
                <select className="sv-field"
                  value={area}
                  onChange={(e) => {
                    setArea(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">All areas</option>
                  {[
                    ...new Set(
                      rows
                        .map((row) => row.customers?.area)
                        .filter((value): value is string => !!value),
                    ),
                  ]
                    .sort()
                    .map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                </select>
              </label>
              <button
                className="sv-button border-sv-border bg-white text-sv-text"
                onClick={() => {
                  setSearch("");
                  setStatus("");
                  setArea("");
                  setPage(0);
                }}
              >
                Clear filters
              </button>
            </div>
            <div className="min-w-0 max-w-full overflow-auto">
              <table className="w-full border-separate border-spacing-0">
                <thead className="sticky top-0 z-10 bg-sv-primary text-white [&_tr]:bg-sv-primary">
                  <tr>
                    <th className="sv-th">Customer</th>
                    <th className="sv-th">CIN</th>
                    <th className="sv-th">Phone</th>
                    <th className="sv-th">Area</th>
                    <th className="sv-th">Status</th>
                    <th className="sv-th">Sent at</th>
                    <th className="sv-th">Message / details</th>
                  </tr>
                </thead>
                <tbody className="[&>tr:nth-child(odd)]:bg-sv-row-alt [&>tr:nth-child(even)]:bg-sv-page">
                  {filtered
                    .slice(current * 50, current * 50 + 50)
                    .map((row) => (
                      <tr key={row.id}>
                        <td className="sv-td">
                          <b>{row.customers?.name ?? "Customer"}</b>
                          <small> {row.customers?.customer_code}</small>
                        </td>
                        <td className="sv-td">{row.customers?.cin || "?"}</td>
                        <td className="sv-td">{row.recipient_phone}</td>
                        <td className="sv-td">{row.customers?.area || "—"}</td>
                        <td className="sv-td">
                          <span className="inline-block rounded-sv border border-sv-border bg-white px-2 py-0.5 text-xs">
                            {row.status.toLowerCase()}
                          </span>
                        </td>
                        <td className="sv-td">
                          {row.sent_at
                            ? new Date(row.sent_at).toLocaleString("en-IN")
                            : "—"}
                        </td>
                        <td className="sv-td">
                          <details>
                            <summary>View message</summary>
                            <p className="whitespace-pre-wrap">
                              {row.rendered_message}
                            </p>
                            {row.last_error && <p>{row.last_error}</p>}
                            {row.waha_message_id && (
                              <p>WAHA ID: {row.waha_message_id}</p>
                            )}
                            {row.delivered_at && (
                              <p>
                                Delivered:{" "}
                                {new Date(row.delivered_at).toLocaleString()}
                              </p>
                            )}
                            {row.read_at && (
                              <p>
                                Read: {new Date(row.read_at).toLocaleString()}
                              </p>
                            )}
                          </details>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!filtered.length && (
              <p>
                {rows.length
                  ? "No recipients match your filters."
                  : "No recipients were queued for this campaign."}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sv-grid-border bg-white p-2">
              <span>
                {filtered.length} matching recipients of {rows.length}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="sv-button border-sv-border bg-white text-sv-text"
                  disabled={!current}
                  onClick={() => setPage(current - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {current + 1} of {lastPage + 1}
                </span>
                <button
                  className="sv-button border-sv-border bg-white text-sv-text"
                  disabled={current >= lastPage}
                  onClick={() => setPage(current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )
      )}
    </section>
  );
}
