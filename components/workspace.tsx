"use client";
import toast from "react-hot-toast";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import CustomerAccounts from "./customer-accounts";
import CampaignDetails from "./campaign-details";
import CampaignActions from "./campaign-actions";
import DefaultImageSettings from "./default-image-settings";
import UnpaidAccounts from "./unpaid-accounts";
import UnpaidUpload from "./unpaid-upload";
import AgentMessaging from "./agent-messaging";
type Row = {
  id: string;
  name: string;
  phone: string;
  customer_code: string;
  cin: string;
  area: string;
  is_active: boolean;
  opted_out: boolean;
  unpaid_amount: number;
  payment_status: string;
  status: string;
  title: string;
  file_name: string;
  row_count: number;
  created_at: string;
  customers?: Row;
};
const nav = [
  ["accounts", "All customers", "◎"],
  ["unpaid", "Unpaid bills", "₹"],
  ["customers", "Announcements", "♧"],
  ["masters", "Masters", "◇"],
  ["history", "Message history", "↗"],
  ["settings", "Settings", "⚙"],
];
const titles: Record<string, string> = {
  accounts: "All customers",
  masters: "Masters",
  unpaid: "Unpaid bills",
  customers: "Announcements",
  history: "Every message, accounted for.",
  settings: "Let’s keep you connected.",
};
async function api(path: string, body?: unknown, method = "POST") {
  const r = await fetch(
    "/api/" + path,
    body
      ? {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Please try again.");
  return data;
}
export default function Workspace({
  campaignId,
}: { campaignId?: string } = {}) {
  const { panel } = useParams<{ panel: string }>();
  const current = campaignId ? "history" : panel;
  return (
    <Panel
      key={campaignId ?? current}
      panel={current}
      campaignId={campaignId}
    />
  );
}
function Panel({ panel, campaignId }: { panel: string; campaignId?: string }) {
  const router = useRouter();
  const cache = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const path =
    panel === "unpaid" ? "bills" : panel === "history" ? "campaigns" : panel;
  const query = useQuery({
    queryKey: [path, page],
    queryFn: () => api(`${path}?page=${page}`),
    enabled: !campaignId && panel === "history",
    retry: 1,
    refetchInterval: panel === "history" ? 5000 : false,
  });
  const connection = useQuery({
    queryKey: ["connection"],
    queryFn: () => api("waha/status"),
    retry: false,
    refetchInterval: 30000,
  });
  const ready = connection.data?.status === "WORKING";
  const rows: Row[] = Array.isArray(query.data) ? query.data : [];
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await cache.invalidateQueries();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-dvh bg-sv-page">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-1 focus:left-2 focus:z-50 focus:bg-white focus:p-2"
        href="#main"
      >
        Skip to content
      </a>
      <header className="fixed inset-x-0 top-0 z-30 flex h-sv-header items-center gap-3 bg-sv-primary pr-3 text-white md:gap-5 md:pr-[30px]">
        <Link
          className="flex h-sv-header w-28 shrink-0 items-center justify-center gap-2 bg-sv-sidebar-active text-white md:w-sv-sidebar"
          href="/accounts"
        >
          <span
            className="rounded-sv bg-white px-1.5 text-xl leading-7 font-bold text-sv-primary"
            aria-hidden="true"
          >
            c.
          </span>
          <span className="grid text-lg leading-none font-bold [&_small]:mt-0.5 [&_small]:text-[7px] [&_small]:tracking-wide">
            <span>cable</span>
            <small>CUSTOMER MANAGER</small>
          </span>
        </Link>
        <button
          type="button"
          className="p-1 md:hidden"
          aria-controls="main-nav"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          &#9776;
        </button>
        <Link
          href="/accounts"
          aria-label="Home"
          className="hidden text-xl sm:block"
        >
          &#8962;
        </Link>
        <Link
          className="ml-auto inline-flex items-center gap-2 text-xs sm:text-sm"
          href="/settings"
        >
          <i
            className={
              ready
                ? "size-2 rounded-full bg-green-300"
                : "size-2 rounded-full bg-sv-yellow"
            }
          />
          {connection.isLoading
            ? "Checking WhatsApp…"
            : ready
              ? "WhatsApp connected"
              : "WhatsApp needs attention"}
        </Link>
        <span
          className="hidden border-l border-white/30 pl-4 lg:block"
          title="Secure account"
        >
          Operator workspace
        </span>
      </header>
      <aside
        id="main-nav"
        className={`fixed bottom-0 left-0 top-sv-header z-30 w-sv-sidebar overflow-y-auto bg-sv-sidebar pt-3 text-sm md:block ${menuOpen ? "block" : "hidden"}`}
      >
        <nav aria-label="Main navigation">
          {nav.map(([href, title, icon]) => (
            <Link
              key={href}
              href={"/" + href}
              className={
                panel === href
                  ? "flex h-[47px] items-center gap-3 bg-sv-sidebar-active px-5 text-white"
                  : "flex h-[47px] items-center gap-3 px-5 text-gray-200 hover:bg-sv-sidebar-sub"
              }
              aria-current={panel === href ? "page" : undefined}
            >
              <span className="w-4 text-center text-base" aria-hidden="true">
                {icon}
              </span>
              {title}
              {panel === href && <i />}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 pt-sv-header md:pl-sv-sidebar">
        <main id="main" className="min-w-0 space-y-3 px-3 py-4 lg:px-[30px]">
          {panel !== "accounts" && (
            <h1 className="mb-3 text-2xl font-semibold">
              {titles[panel] ?? "Page not found"}
            </h1>
          )}
          {(error || query.error) && (
            <div
              className="border-l-4 border-sv-red bg-red-50 px-3 py-2 text-red-900"
              role="alert"
            >
              <b>We couldn’t complete that.</b>
              <p>{error || query.error?.message}</p>
              <button
                className="sv-button border-sv-border bg-white text-sv-text"
                onClick={() => {
                  setError("");
                  query.refetch();
                }}
              >
                Try again
              </button>
            </div>
          )}
          {!campaignId && panel !== "unpaid" && query.isLoading && (
            <div className="flex flex-wrap items-center gap-2" role="status">
              <span className="size-4 rounded-full border-2 border-sv-border border-t-sv-primary motion-safe:animate-spin" />{" "}
              Loading your workspace…
            </div>
          )}
          {["accounts", "masters"].includes(panel) && (
            <CustomerAccounts masterPage={panel === "masters"} ready={ready} />
          )}
          {panel === "unpaid" && <>
            <UnpaidAccounts ready={ready} />
            <UnpaidUpload ready={ready} />
          </>}
          {panel === "customers" && <AgentMessaging ready={ready} />}
          {campaignId && <CampaignDetails id={campaignId} />}
          {panel === "history" && !campaignId && (
            <section className="sv-panel">
              <div className="flex flex-wrap items-center gap-2 justify-between border-b border-sv-grid-border pb-2">
                <h2 className="text-lg font-semibold">Message campaigns</h2>
                <span>Updates every 10 seconds</span>
              </div>
              {rows.length ? (
                <div className="min-w-0 max-w-full overflow-auto">
                  <table className="w-full border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10 bg-sv-primary text-white [&_tr]:bg-sv-primary">
                      <tr>
                        <th className="sv-th">Campaign</th>
                        <th className="sv-th">Created</th>
                        <th className="sv-th">Progress</th>
                        <th className="sv-th">Details</th>
                      </tr>
                    </thead>
                    <tbody className="[&>tr:nth-child(odd)]:bg-sv-row-alt [&>tr:nth-child(even)]:bg-sv-page">
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td className="sv-td">
                            <b>{r.title}</b>
                          </td>
                          <td className="sv-td">
                            {new Date(r.created_at).toLocaleDateString("en-IN")}
                          </td>
                          <td className="sv-td">
                            <span className="inline-block rounded-sv border border-sv-border bg-white px-2 py-0.5 text-xs">
                              {r.status.replaceAll("_", " ").toLowerCase()}
                            </span>
                          </td>
                          <td className="sv-td">
                            <Link
                              className="cursor-pointer text-sv-primary underline underline-offset-2"
                              href={`/history/${r.id}`}
                            >
                              View recipients
                            </Link>
                            <CampaignActions
                              id={r.id}
                              title={r.title}
                              status={r.status}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Your messages will appear here"
                  text="When a campaign is created, you can follow its progress here."
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sv-grid-border bg-white p-2">
                <span>Page {page + 1}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="sv-button border-sv-border bg-white text-sv-text"
                    disabled={!page}
                    onClick={() => {
                      setPage(page - 1);
                    }}
                  >
                    Previous
                  </button>
                  <button
                    className="sv-button border-sv-border bg-white text-sv-text"
                    disabled={rows.length < 50}
                    onClick={() => {
                      setPage(page + 1);
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          )}
          {panel === "settings" && (
            <div className="grid gap-4">
              <DefaultImageSettings />
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="sv-panel flex flex-wrap items-start gap-4 [&_button]:ml-auto">
                  <span className="grid size-8 place-items-center bg-sv-sidebar text-white">
                    ↗
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold">
                      WhatsApp connection
                    </h2>
                    <></>
                    <span
                      className={
                        ready
                          ? "font-semibold text-green-800"
                          : "font-semibold text-amber-800"
                      }
                    >
                      {ready ? "Connected" : "Needs attention"}
                    </span>
                    <p className="text-sv-muted">
                      Session: {connection.data?.name ?? "Not available"}
                    </p>
                  </div>
                  <button
                    className="sv-button border-sv-border bg-white text-sv-text"
                    disabled={connection.isFetching}
                    onClick={() => connection.refetch()}
                  >
                    {connection.isFetching ? "Checking…" : "Check again"}
                  </button>
                </section>
                <section className="sv-panel flex flex-wrap items-start gap-4 [&_button]:ml-auto">
                  <span className="grid size-8 place-items-center bg-sv-sidebar text-white">
                    OP
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold">Your account</h2>
                    <p className="text-sv-muted">
                      Manage access to your workspace.
                    </p>
                  </div>
                  <button
                    className="sv-button border-sv-border bg-white text-sv-text"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await api("logout", {});
                        toast.success("Signed out.");
                        router.replace("/login");
                        router.refresh();
                      })
                    }
                  >
                    Sign out
                  </button>
                </section>
              </div>
            </div>
          )}
          <></>
        </main>
      </div>
    </div>
  );
}
function Empty({ title }: { title: string; text: string }) {
  return (
    <div className="p-6 text-center text-sv-muted">
      <span aria-hidden="true">▤</span>
      <h3 className="font-semibold">{title}</h3>
      <></>
    </div>
  );
}
