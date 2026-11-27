"use client";
import toast from "react-hot-toast";
import { useState, useRef } from "react";
import Link from "next/link";
import MessageAttachment, { AttachmentPreview } from "./message-attachment";
import { useMessageImage } from "./use-message-image";
import { render } from "@/lib/domain";
import { defaultPaymentReminder } from "@/lib/message-templates";
export type Recipient = {
  id: string;
  customer_code?: string;
  cin?: string;
  name: string;
  phone: string;
  area: string;
  is_active: boolean;
  opted_out: boolean;
  unpaid_amount?: number;
  payment_status?: string;
  bill_month?: string;
};
export function eligible(r: Recipient, unpaid: boolean) {
  return (
    r.is_active &&
    !r.opted_out &&
    (!unpaid || (Number(r.unpaid_amount) > 0 && r.payment_status !== "PAID"))
  );
}
async function api(path: string, body: unknown) {
  const response = await fetch("/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Please try again.");
  return data;
}
export default function ImportRecipients({
  rows,
  unpaid,
  ready,
  targetAgent,
  directory = false,
  accountBalances = false,
}: {
  rows: Recipient[];
  unpaid: boolean;
  ready: boolean;
  targetAgent?: string;
  directory?: boolean;
  accountBalances?: boolean;
}) {
  const canSelect = (r: Recipient) => eligible(r, unpaid) && (!accountBalances || /^[1-9]\d{10,14}$/.test(r.phone));
  const [selected, setSelected] = useState(() =>
    accountBalances ? [] : rows.filter(canSelect).map((r) => r.id),
  );
  const [search, setSearch] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [campaign, setCampaign] = useState("");
  const lock = useRef(false);
  const [allowResend, setAllowResend] = useState(false);
  const [queueSummary, setQueueSummary] = useState("");
  const {
    image,
    setImage,
    resetImage,
    defaultImage,
    usingDefault,
    loading: imageLoading,
    error: imageError,
    retry: retryImage,
    setReading,
  } = useMessageImage();
  const [template, setTemplate] = useState(
    directory
      ? ""
      : unpaid
        ? defaultPaymentReminder
        : "Dear {{name}}, cable TV service in {{area}} is temporarily unavailable. We are working to restore it. Thank you for your patience.",
  );
  const selectedIds = new Set(selected);
  const recipients = rows.filter(
    (r) => selectedIds.has(r.id) && canSelect(r),
  );
  const visible = rows.filter((r) =>
    `${r.customer_code ?? ""} ${r.name} ${r.cin ?? ""} ${r.phone}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const message = (r: Recipient) =>
    render(template, {
      name: r.name,
      area: r.area || "your area",
      amount: String(r.unpaid_amount ?? 0),
      month: r.bill_month
        ? new Date(r.bill_month + "-01T12:00:00").toLocaleDateString("en-IN", {
            month: "long",
            year: "numeric",
          })
        : "",
    });
  if (done)
    return (
      <section className="sv-panel">
        <h2 className="text-lg font-semibold">Messages queued</h2>
        <p>
          {queueSummary} Processing has started. Follow progress in message
          history.
        </p>
        <Link className="sv-button bg-sv-primary text-white" href="/history">
          View message history
        </Link>
      </section>
    );
  return (
    <section id="import-recipients" className="sv-panel">
      <></>
      <h2 className="text-lg font-semibold">
        {review
          ? "Review before sending"
          : accountBalances
            ? "Customers with an outstanding balance"
          : targetAgent
            ? `Choose recipients assigned to ${targetAgent}`
            : directory
              ? "Selected customers"
              : "Your file is saved. Choose your recipients."}
      </h2>
      <></>
      {error && (
        <p className="border-l-4 border-sv-red bg-red-50 px-3 py-2 text-red-900" role="alert">
          {error}
        </p>
      )}
      {!review ? (
        <>
          <div className="flex flex-wrap items-center gap-2 [&>input]:max-w-xs [&>select]:max-w-xs">
            <input className="sv-field"
              aria-label="Find recipient"
              placeholder={accountBalances ? "Find a customer ID, name, CIN or phone" : "Find a name, CIN or phone number"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="sv-button border-sv-border bg-white text-sv-text"
              onClick={() =>
                setSelected(
                  rows.filter((r) => canSelect(r)).map((r) => r.id),
                )
              }
            >
              Select all eligible
            </button>
            <button
              className="sv-button border-sv-border bg-white text-sv-text"
              onClick={() => setSelected([])}
            >
              Deselect all
            </button>
            <b aria-live="polite">
              {recipients.length} of {rows.length} selected
            </b>
          </div>
          {accountBalances && recipients.length > 10000 && <p role="alert">Select up to 10,000 customers per message campaign.</p>}
          <div className="min-w-0 max-w-full overflow-auto max-h-[60dvh]">
            <table className="w-full border-separate border-spacing-0">
              <thead className="sticky top-0 z-10 bg-sv-primary text-white [&_tr]:bg-sv-primary">
                <tr>
                  <th className="sv-th">Send</th>
                  {accountBalances && <th className="sv-th">Customer ID</th>}
                  <th className="sv-th">Customer</th>
                  <th className="sv-th">CIN</th>
                  <th className="sv-th">Phone</th>
                  <th className="sv-th">{unpaid ? "Amount due" : "Area"}</th>
                  <th className="sv-th">Eligibility</th>
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(odd)]:bg-sv-row-alt [&>tr:nth-child(even)]:bg-sv-page">
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td className="sv-td">
                      <input className="size-3.5 shrink-0 accent-sv-primary"
                        type="checkbox"
                        aria-label={`Send to ${r.name}`}
                        checked={selectedIds.has(r.id)}
                        disabled={!canSelect(r)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, r.id]
                              : selected.filter((id) => id !== r.id),
                          )
                        }
                      />
                    </td>
                    {accountBalances && <td className="sv-td">{r.customer_code}</td>}
                    <td className="sv-td">{r.name}</td>
                    <td className="sv-td">{r.cin || "?"}</td>
                    <td className="sv-td">{r.phone}</td>
                    <td className="sv-td">{unpaid ? `₹${r.unpaid_amount}` : r.area}</td>
                    <td className="sv-td">
                      {canSelect(r)
                        ? "Eligible"
                        : r.opted_out
                          ? "Opted out"
                          : !r.is_active
                            ? "Inactive"
                            : accountBalances ? "Invalid or missing phone" : "No unpaid balance"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {unpaid && !accountBalances && (
            <div className="border-l-4 border-sv-yellow bg-amber-50 px-3 py-2 text-amber-950">
              <label className="sv-label">
                <input className="size-3.5 shrink-0 accent-sv-primary"
                  type="checkbox"
                  checked={allowResend}
                  onChange={(e) => setAllowResend(e.target.checked)}
                />{" "}
                Send another reminder this month
              </label>
              <></>
            </div>
          )}
          <>
            {imageLoading && <p role="status">Loading message image?</p>}
            {imageError && (
              <p className="border-l-4 border-sv-red bg-red-50 px-3 py-2 text-red-900" role="alert">
                {imageError.message}{" "}
                <button className="cursor-pointer text-sv-primary underline underline-offset-2" onClick={retryImage}>
                  Try again
                </button>
              </p>
            )}
            <MessageAttachment
              image={image}
              onChange={setImage}
              onBusyChange={setReading}
              defaultImage={defaultImage}
              usingDefault={usingDefault}
              onUseDefault={resetImage}
            />
          </>
          <label className="sv-label">
            {image ? "Your message / image caption" : "Your message"}
            <textarea className="sv-field h-auto min-h-20 resize-y"
              value={template}
              maxLength={4000}
              onChange={(e) => setTemplate(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sv-grid-border bg-white p-2">
            <button
              className="sv-button bg-sv-primary text-white"
              disabled={
                imageLoading ||
                !!imageError ||
                !recipients.length ||
                (accountBalances && recipients.length > 10000) ||
                !template.trim()
              }
              onClick={() => setReview(true)}
            >
              Review {recipients.length} recipients
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            <b>{recipients.length} selected recipients</b>. No message has been
            sent yet.{" "}
            {accountBalances ? "Outstanding balances and WhatsApp eligibility are checked again when queued." : unpaid
              ? allowResend
                ? "You have chosen to send another reminder this month, including previously contacted customers. Paid, inactive and opted-out customers are still excluded."
                : "Already-reminded customers are skipped. To contact them again, go back and enable Send another reminder this month."
              : "Inactive and opted-out customers are excluded when queued."}
          </p>
          {image && <AttachmentPreview image={image} />}
          <div className="max-h-[60dvh] overflow-auto">
            {recipients.map((r) => (
              <article className="border border-sv-grid-border bg-sv-page p-3 whitespace-pre-wrap" key={r.id}>
                <b>
                  {r.name} · {r.phone}
                </b>
                <p>{message(r)}</p>
              </article>
            ))}
          </div>
          {!ready && (
            <p className="border-l-4 border-sv-yellow bg-amber-50 px-3 py-2 text-amber-950">
              WhatsApp must be connected before sending. Check Settings, then
              return here.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sv-grid-border bg-white p-2">
            <button
              className="sv-button border-sv-border bg-white text-sv-text"
              disabled={busy || !!campaign}
              onClick={() => setReview(false)}
            >
              Back to selection
            </button>
            <button
              className="sv-button bg-sv-primary text-white"
              disabled={
                imageLoading ||
                !!imageError ||
                busy ||
                !ready ||
                !recipients.length
              }
              onClick={async () => {
                if (lock.current) return;
                lock.current = true;
                setBusy(true);
                setError("");
                try {
                  let id = campaign;
                  if (!id) {
                    const created = await api("campaigns", {
                      title:
                        (accountBalances ? "Outstanding balance reminders" : unpaid
                          ? `Payment reminders ${recipients[0].bill_month}`
                          : "Customer service update") +
                        (targetAgent ? ` - ${targetAgent}` : ""),
                      type: unpaid
                        ? "PAYMENT_REMINDER"
                        : directory
                          ? "CUSTOM"
                          : "BREAKDOWN",
                      template,
                      bill_month: unpaid ? recipients[0].bill_month : undefined,
                      target_filter: {
                        ...(accountBalances ? { source: "ACCOUNT_BALANCE" } : {}),
                        ...(image ? { image } : {}),
                        ids: recipients.map((r) => r.id),
                        ...(targetAgent ? { agent: targetAgent } : {}),
                      },
                    });
                    id = created.id;
                    setCampaign(id);
                  }
                  const result = await api(`campaigns/${id}/send`, {
                    confirmed: true,
                    allow_resend: allowResend,
                  });
                  if (result.recipient_count === 0) {
                    setCampaign("");
                    setReview(false);
                    setError(result.message);
                    return;
                  }
                  toast.success(result.message);
                  setQueueSummary(result.message);
                  setDone(true);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Unable to queue messages. Try again.",
                  );
                } finally {
                  setBusy(false);
                  lock.current = false;
                }
              }}
            >
              {busy
                ? "Queuing messages…"
                : `Confirm & queue ${recipients.length} messages`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
