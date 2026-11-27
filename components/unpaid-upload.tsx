"use client";
import toast from "react-hot-toast";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import MessageAttachment from "./message-attachment";
import { useMessageImage } from "./use-message-image";
import {
  unpaidRecipient,
  uploadedMessage,
  type UnpaidPreview,
} from "@/lib/unpaid-upload";
import { defaultPaymentReminder } from "@/lib/message-templates";

async function post(path: string, body: unknown) {
  const response = await fetch("/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to send. Try again.");
  return data;
}
export default function UnpaidUpload({ ready, uploadTarget }: { ready: boolean; uploadTarget: HTMLElement | null }) {
  const [rows, setRows] = useState<UnpaidPreview[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [fileName, setFileName] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [campaign, setCampaign] = useState("");
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
  const lock = useRef(false);
  const [template, setTemplate] = useState(defaultPaymentReminder);
  const recipients = rows.filter(
    (row) => !row.error && selected.includes(row.rowNumber),
  );
  const visible = rows.filter((row) =>
    `${row.data.name} ${row.data.phone} ${row.data.customer_code} ${row.data.cin ?? ""} ${row.data.area}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section className={rows.length || error || done ? "sv-panel" : ""}>
      {uploadTarget && createPortal(<div>

        <label className="sv-button bg-sv-blue text-white relative overflow-hidden focus-within:outline-2 [&_input]:absolute [&_input]:inset-0 [&_input]:size-full [&_input]:cursor-pointer [&_input]:opacity-0">
          {busy ? "Please wait…" : "Upload Excel"}
          <input className="max-w-full"
            aria-label="Upload unpaid Excel"
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file || lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              setRows([]);
              setSelected([]);
              setFileName("");
              setDone("");
              setCampaign("");
              setSearch("");
              resetImage();
              try {
                const form = new FormData();
                form.set("file", file);
                form.set("kind", "UNPAID");
                const response = await fetch("/api/imports/preview", {
                  method: "POST",
                  body: form,
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                setRows(data.rows);
                setSelected(
                  data.rows
                    .filter((row: UnpaidPreview) => !row.error)
                    .map((row: UnpaidPreview) => row.rowNumber),
                );
                setFileName(file.name);
                toast.success("Unpaid list loaded.");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Unable to read Excel.",
                );
              } finally {
                setBusy(false);
                lock.current = false;
              }
            }}
          />
        </label>
      </div>, uploadTarget)}
      {error && (
        <p className="border-l-4 border-sv-red bg-red-50 px-3 py-2 text-red-900" role="alert">
          {error}
        </p>
      )}
      {done ? (
        <div className="sv-panel">
          <h3 className="font-semibold">Queue result</h3>
          <p>
            {done} Processing has started. Follow progress in message history.
          </p>
          <Link href="/history" className="sv-button border-sv-border bg-white text-sv-text">
            View message history
          </Link>
          <p>Upload a new Excel file above for your next send.</p>
        </div>
      ) : (
        fileName && (
          <>
            <p className="font-semibold">
              <b>{fileName}</b> · {rows.length} rows · {recipients.length}{" "}
              selected
            </p>
            {rows.some((row) => row.error) && (
              <p className="border-l-4 border-sv-yellow bg-amber-50 px-3 py-2 text-amber-950">
                {rows.filter((row) => row.error).length} invalid or repeated
                rows cannot be selected. Correct them in Excel and upload again.
              </p>
            )}
            {!rows.length && <p>No customers found in this file.</p>}
            <fieldset
              disabled={busy || !!campaign}
              className="min-w-0 space-y-3"
            >
              <legend className="sr-only">
                Choose recipients and compose your reminder
              </legend>
              <div className="flex flex-wrap items-center gap-2 [&>input]:max-w-xs [&>select]:max-w-xs">
                <input className="sv-field"
                  aria-label="Find uploaded customer"
                  placeholder="Search name, CIN, phone, STB / User ID or area"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button
                  type="button"
                  className="sv-button border-sv-border bg-white text-sv-text"
                  onClick={() =>
                    setSelected(
                      rows
                        .filter((row) => !row.error)
                        .map((row) => row.rowNumber),
                    )
                  }
                >
                  Select all valid
                </button>
                <button
                  type="button"
                  className="sv-button border-sv-border bg-white text-sv-text"
                  onClick={() => setSelected([])}
                >
                  Deselect all
                </button>
              </div>
              <div className="min-w-0 max-w-full overflow-auto max-h-[60dvh]">
                <table className="w-full border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10 bg-sv-primary text-white [&_tr]:bg-sv-primary">
                    <tr>
                      <th className="sv-th">Send</th>
                      <th className="sv-th">Customer</th>
                      <th className="sv-th">CIN</th>
                      <th className="sv-th">Phone</th>
                      <th className="sv-th">Balance from Excel</th>
                      <th className="sv-th">Review</th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr:nth-child(odd)]:bg-sv-row-alt [&>tr:nth-child(even)]:bg-sv-page">
                    {visible.map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="sv-td">
                          <input className="size-3.5 shrink-0 accent-sv-primary"
                            type="checkbox"
                            aria-label={`Send to ${row.data.name}`}
                            disabled={!!row.error}
                            checked={selected.includes(row.rowNumber)}
                            onChange={(e) =>
                              setSelected((current) =>
                                e.target.checked
                                  ? [...current, row.rowNumber]
                                  : current.filter(
                                      (id) => id !== row.rowNumber,
                                    ),
                              )
                            }
                          />
                        </td>
                        <td className="sv-td">
                          <b>{String(row.data.name)}</b>
                          <small> {String(row.data.customer_code)}</small>
                        </td>
                        <td className="sv-td">{String(row.data.cin || "?")}</td>
                        <td className="sv-td">{String(row.data.phone)}</td>
                        <td className="sv-td">₹{String(row.data.unpaid_amount)}</td>
                        <td className="sv-td">{row.error || "Ready"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                Message
                <textarea className="sv-field h-auto min-h-20 resize-y"
                  value={template}
                  maxLength={4000}
                  onChange={(e) => setTemplate(e.target.value)}
                />
              </label>
              <p>
                Use {"{{name}}"}, {"{{amount}}"} and {"{{area}}"} from this
                file.
              </p>
              {recipients[0] && (
                <article className="border border-sv-grid-border bg-sv-page p-3 whitespace-pre-wrap">
                  <b>Message preview</b>
                  <p>
                    {uploadedMessage(
                      template,
                      unpaidRecipient.parse(recipients[0].data),
                    )}
                  </p>
                </article>
              )}
            </fieldset>
            {!ready && (
              <p className="border-l-4 border-sv-yellow bg-amber-50 px-3 py-2 text-amber-950">
                Connect WhatsApp in Settings before sending.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sv-grid-border bg-white p-2">
              <p>
                Only selected rows from this upload will be sent. Inactive and
                opted-out customers are skipped.
              </p>
              <button
                className="sv-button bg-sv-primary text-white"
                disabled={
                  imageLoading ||
                  !!imageError ||
                  busy ||
                  !ready ||
                  !recipients.length ||
                  !template.trim()
                }
                onClick={async () => {
                  if (lock.current) return;
                  lock.current = true;
                  setBusy(true);
                  setError("");
                  const id = campaign || crypto.randomUUID();
                  setCampaign(id);
                  try {
                    await post("unpaid/campaigns", {
                      id,
                      file_name: fileName,
                      template,
                      image,
                      rows: recipients.map((row) => row.data),
                    });
                    const result = await post(`campaigns/${id}/send`, {
                      confirmed: true,
                    });
                    const summary = `${result.recipient_count} message(s) queued; ${result.skipped_count} inactive or opted-out customer(s) skipped.`;
                    setDone(summary);
                    if (result.recipient_count > 0) toast.success(summary);
                    else toast(summary);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Unable to send. Try again.",
                    );
                  } finally {
                    lock.current = false;
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? "Preparing messages…"
                  : campaign
                    ? "Retry sending selected messages"
                    : `Send to ${recipients.length} selected customers`}
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}
