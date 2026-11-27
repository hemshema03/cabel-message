"use client";
import toast from "react-hot-toast";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ImportRecipients from "./import-recipients";
import TamilNameInput from "./tamil-name-input";
import {
  accountForm,
  blankForm,
  columns,
  type Account,
  type Form,
  type Master,
  type Street,
} from "@/lib/customer-profiles";

const masterSections = [
  { kind: "plan", title: "Monthly plans", field: "Plan name" },
  { kind: "channel", title: "Add-on channels", field: "Channel name" },
  { kind: "agent", title: "Collection agents", field: "Agent name" },
  { kind: "street", title: "Streets", field: "Street name" },
] as const;

const tableColumns = [
  ["select", "Select"],
  ["actions", "Actions"],
  ...columns,
  ["cin", "CIN"],
  ["channels", "Add-on channels"],
  ["monthly_total", "Monthly total"],
] as const;
type ColumnKey = (typeof tableColumns)[number][0];
const filterKeys = [
  "customer_code", "name", "mobile", "vc", "box", "mso", "street",
  "plan", "agent", "status", "channels", "cin", "door",
] as const satisfies readonly ColumnKey[];
type FilterKey = (typeof filterKeys)[number];
type Filters = Partial<Record<FilterKey, string>>;
const columnLabels = Object.fromEntries(tableColumns);

function dropdownOptions(key: FilterKey, accounts: Account[], masters: Master[], streets: Street[]) {
  let values: string[];
  switch (key) {
    case "street":
      values = [...streets.map(street => street.name), ...accounts.map(row => row.profile.street ?? "")];
      break;
    case "plan":
    case "agent":
      values = [
        ...masters.filter(item => item.kind === key).map(item => item.name),
        ...accounts.map(row => row.profile[key] ?? ""),
      ];
      break;
    case "channels":
      values = [
        ...masters.filter(item => item.kind === "channel").map(item => item.name),
        ...accounts.flatMap(row => row.profile.channels ?? []),
      ];
      break;
    case "status":
      values = accounts.map(row => row.profile.status || (row.is_active ? "Active" : "Inactive"));
      break;
    default:
      return null;
  }
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function Popup({
  title,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={
        title === "Edit customer"
          ? "sv-dialog w-[calc(100%-16px)] border-sv-edit-header lg:w-[84%]"
          : "sv-dialog w-[calc(100%-20px)] border-sv-primary my-1"
      }
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header
        className={
          title === "Edit customer"
            ? "sticky top-0 z-20 flex h-[54px] items-center justify-between bg-sv-edit-header px-4 text-white"
            : "sticky top-0 z-20 flex items-center justify-between bg-sv-primary px-5 text-white"
        }
      >
        <h2
          className={
            title === "Advanced Filter"
              ? "flex min-h-[70px] items-center text-2xl font-semibold"
              : "py-3.5 text-lg font-semibold"
          }
        >
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close dialog"
          disabled={busy}
          className="px-2 text-2xl"
          onClick={onClose}
        >
          &times;
        </button>
      </header>
      {children}
    </dialog>
  );
}
const optionalColumns = tableColumns.filter(
  ([key]) => key !== "select" && key !== "actions",
);
const columnKeys = optionalColumns.map(([key]) => key);
const preferenceKey = "cable.customer-directory.columns.v1";

function savedColumns(): ColumnKey[] {
  try {
    const saved: unknown = JSON.parse(
      window.localStorage.getItem(preferenceKey) ?? "null",
    );
    if (Array.isArray(saved)) {
      const valid = columnKeys.filter((key) => saved.includes(key));
      if (valid.length) return valid;
    }
  } catch {
    /* Use defaults when browser storage is unavailable. */
  }
  return columnKeys;
}

type Directory = {
  accounts: Account[];
  masters: Master[];
  streets: Street[];
  streetsAvailable: boolean;
};
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});
function monthlyRent(base: string | number, channelFee: number) {
  return (
    (Math.round(Number(base) * 100) + Math.round(Number(channelFee) * 100)) /
    100
  );
}
const idOrder = new Intl.Collator("en-IN", { numeric: true });
async function request(payload?: unknown) {
  const upload = payload instanceof FormData;
  const response = await fetch(
    "/api/customer-accounts",
    payload === undefined
      ? undefined
      : {
          method: "POST",
          headers: upload ? undefined : { "Content-Type": "application/json" },
          body: upload ? payload : JSON.stringify(payload),
        },
  );
  const result = await response.json();
  if (!response.ok)
    throw Error(result.error || "Unable to load customer accounts.");
  return result;
}
function Profile({
  form,
  setForm,
  masters,
  streets,
  editing,
  busy,
  onSave,
  onClose,
}: {
  form: Form;
  setForm: (f: Form) => void;
  masters: Master[];
  streets: Street[];
  editing: boolean;
  busy: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const change = (key: keyof Form, value: string) =>
    setForm({ ...form, [key]: value });
  const [channelSearch, setChannelSearch] = useState("");
  const pickerRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      const picker = pickerRef.current;
      if (
        picker?.open &&
        event.target instanceof Node &&
        !picker.contains(event.target)
      ) {
        picker.open = false;
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, []);
  const channels = masters.filter((item) => item.kind === "channel");
  const channelFee = channels.reduce(
    (sum, item) =>
      form.channels.includes(item.name) ? sum + Number(item.amount) : sum,
    0,
  );
  const matchingChannels = channels.filter((item) =>
    item.name.toLowerCase().includes(channelSearch.trim().toLowerCase()),
  );
  return (
    <form
      className="bg-white"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <fieldset disabled={busy} className="min-w-0">
        <div className="grid items-start gap-[30px] p-4 md:grid-cols-2 lg:p-[22px]">
          {(["Customer details", "Connection details"] as const).map(
            (section) => (
              <section key={section} className="min-w-0 space-y-3">
                <h3 className="font-bold text-sv-muted uppercase">{section}</h3>
                <div
                  className={
                    section === "Connection details"
                      ? "space-y-3 rounded-sv border border-sv-yellow p-4"
                      : "space-y-3"
                  }
                >
                  {section === "Connection details" && (
                    <h4 className="-mx-4 -mt-4 mb-4 bg-sv-yellow px-4 py-3 font-semibold">
                      Connection and package details
                    </h4>
                  )}
                  {columns
                    .filter(
                      ([key]) =>
                        [
                          "box",
                          "vc",
                          "mso",
                          "plan",
                          "agent",
                          "monthly_rent",
                          "balance",
                        ].includes(key) ===
                        (section === "Connection details"),
                    )
                    .map(([key, label]) => (
                      <Fragment key={key}>
                        {key === "door" && (
                          <h3 className="font-bold text-sv-muted uppercase">
                            Contact details
                          </h3>
                        )}
                        {key === "street" ? (
                          <div key={key}>
                            <label className="sv-form-row">
                              Street
                              <select
                                className="sv-field"
                                disabled={!streets.length}
                                value={form.street_id ?? ""}
                                onChange={(event) => {
                                  const street = streets.find(
                                    (item) => item.id === event.target.value,
                                  );
                                  setForm({
                                    ...form,
                                    street_id: street?.id,
                                    street: street?.name ?? "",
                                    area: street?.area ?? "",
                                    city: street?.city ?? "",
                                  });
                                }}
                              >
                                <option value="">
                                  {form.street && !form.street_id
                                    ? form.street
                                    : "Select a street"}
                                </option>
                                {streets.map((street) => (
                                  <option key={street.id} value={street.id}>
                                    {street.name} — {street.area}, {street.city}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {!streets.length && (
                              <small>
                                Add streets in Masters to select one here.
                              </small>
                            )}
                          </div>
                        ) : key === "name" ? (
                          <TamilNameInput
                            key={key}
                            value={form.name}
                            onChange={(value) => change("name", value)}
                          />
                        ) : (
                          <label
                            key={key}
                            className={
                              key === "plan"
                                ? "sv-form-row rounded-sv bg-sv-green p-3 text-white"
                                : "sv-form-row"
                            }
                          >
                            {key === "monthly_rent"
                              ? "BASE PLAN AMOUNT"
                              : label}
                            {key === "plan" || key === "agent" ? (
                              <select
                                className="sv-field"
                                value={form[key]}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  const plan = masters.find(
                                    (m) =>
                                      m.kind === "plan" && m.name === value,
                                  );
                                  setForm({
                                    ...form,
                                    [key]: value,
                                    ...(key === "plan" && plan
                                      ? { monthly_rent: String(plan.amount) }
                                      : {}),
                                  });
                                }}
                              >
                                <option value="">None</option>
                                {masters
                                  .filter((m) => m.kind === key)
                                  .map((m) => (
                                    <option key={m.name}>{m.name}</option>
                                  ))}
                              </select>
                            ) : key === "status" ? (
                              <select
                                className="sv-field"
                                value={form.status}
                                onChange={(e) => change(key, e.target.value)}
                              >
                                {[
                                  ...new Set([
                                    "Active",
                                    "Inactive",
                                    form.status,
                                  ]),
                                ].map((v) => (
                                  <option key={v}>{v}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className="sv-field"
                                required={key === "customer_code"}
                                value={form[key]}
                                readOnly={
                                  (editing && key === "balance") ||
                                  key === "area" ||
                                  key === "city"
                                }
                                type={
                                  key === "monthly_rent" || key === "balance"
                                    ? "number"
                                    : "text"
                                }
                                step="0.01"
                                min={key === "monthly_rent" ? 0 : undefined}
                                onChange={(e) => change(key, e.target.value)}
                              />
                            )}
                          </label>
                        )}
                      </Fragment>
                    ))}
                  {section === "Customer details" && (
                    <label className="sv-form-row">
                      CIN
                      <input
                        className="sv-field"
                        value={form.cin}
                        onChange={(e) => change("cin", e.target.value)}
                      />
                    </label>
                  )}
                </div>
                {section === "Connection details" && (
                  <>
                    <details
                      ref={pickerRef}
                      onBlur={(event) => {
                        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
                          event.currentTarget.open = false;
                        }
                      }}
                      className="relative rounded-sv border border-sv-border [&_summary]:bg-sv-blue [&_summary]:px-3 [&_summary]:py-2 [&_summary]:text-white [&_summary_span]:ml-2 [&>p]:p-3"
                      onToggle={(event) => {
                        if (!event.currentTarget.open) setChannelSearch("");
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Escape" &&
                          event.currentTarget.open
                        ) {
                          event.preventDefault();
                          event.stopPropagation();
                          event.currentTarget.open = false;
                          event.currentTarget.querySelector("summary")?.focus();
                        }
                      }}
                    >
                      <summary>
                        Add-on channels{" "}
                        <span>
                          {form.channels.length
                            ? form.channels.join(", ")
                            : "Select channels"}
                        </span>
                      </summary>
                      {channels.length ? (
                        <div className="grid gap-2 p-2">
                          <input
                            className="sv-field"
                            type="search"
                            aria-label="Search add-on channels"
                            placeholder="Search channels"
                            value={channelSearch}
                            onChange={(event) =>
                              setChannelSearch(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.preventDefault();
                            }}
                          />
                          <div className="max-h-52 overflow-auto">
                            {matchingChannels.map((channel) => (
                              <label className="relative flex items-center gap-2 p-1.5 hover:bg-sv-page" key={channel.name}>
                                <input
                                  className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0"
                                  type="checkbox"
                                  checked={form.channels.includes(channel.name)}
                                  onChange={(event) => {
                                    const selected = event.target.checked
                                      ? [...form.channels, channel.name]
                                      : form.channels.filter(
                                          (name) => name !== channel.name,
                                        );
                                    setForm({ ...form, channels: selected });
                                  }}
                                />
                                <span aria-hidden="true" className="grid size-3.5 shrink-0 place-items-center rounded-[2px] border border-sv-muted text-[11px] leading-none text-transparent peer-checked:border-sv-primary peer-checked:bg-sv-primary peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sv-primary">✓</span>
                                <span>{channel.name}</span>
                                <small className="ml-auto">{currency.format(channel.amount)}</small>
                              </label>
                            ))}
                            {!matchingChannels.length && (
                              <p>No matching channels.</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p>Create channels in Masters to assign them here.</p>
                      )}
                    </details>
                    <p aria-live="polite">
                      <strong>
                        Monthly rent{" "}
                        {currency.format(
                          monthlyRent(form.monthly_rent, channelFee),
                        )}
                      </strong>
                      {" · "}
                      {currency.format(Number(form.monthly_rent))} base +{" "}
                      {currency.format(channelFee)} add-ons
                    </p>
                  </>
                )}
              </section>
            ),
          )}
        </div>
        <div className="sv-footer">
          <button className="sv-button bg-sv-primary text-white">
            Save customer
          </button>
          <button
            type="button"
            className="sv-button border-sv-border bg-white text-sv-text"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export default function CustomerAccounts({
  masterPage,
  ready,
}: {
  masterPage: boolean;
  ready: boolean;
}) {
  const [category, setCategory] = useState<Master["kind"] | "street" | null>(
    null,
  );
  const [shown, setShown] = useState<ColumnKey[]>(savedColumns);
  function showColumns(keys: ColumnKey[]) {
    setShown(keys);
    try {
      window.localStorage.setItem(preferenceKey, JSON.stringify(keys));
    } catch {
      /* The selection still applies for this visit. */
    }
  }
  const cache = useQueryClient();
  const query = useQuery<Directory>({
    queryKey: ["customer-accounts"],
    queryFn: () => request(),
    enabled: !masterPage || category !== null,
    retry: false,
  });
  const [editor, setEditor] = useState<{ id?: string; form: Form } | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  const [draft, setDraft] = useState<Filters | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [descending, setDescending] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [compose, setCompose] = useState(false);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");
  async function save(payload: unknown, done?: () => void) {
    setBusy(true);
    setError("");
    try {
      const result = await request(payload);
      done?.();
      toast.success(result.message);
      await cache.invalidateQueries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  function addMaster(e: FormEvent<HTMLFormElement>, kind: Master["kind"]) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    void save(
      {
        action: "master",
        kind,
        name: values.get("name"),
        amount: Number(values.get("amount") || 0),
      },
      () => form.reset(),
    );
  }
  function openCategory(next: Master["kind"] | "street" | null) {
    setCategory(next);

    setError("");
  }
  if (masterPage && category === null)
    return (
      <nav
        aria-label="Master categories"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {masterSections.map((section) => (
          <button
            key={section.kind}
            type="button"
            className="flex items-center justify-between rounded-sv border border-sv-border border-t-[3px] border-t-sv-primary bg-white px-4 py-5 text-base font-semibold hover:bg-sv-row-alt"
            onClick={() => openCategory(section.kind)}
          >
            {section.title}
            <span aria-hidden="true"> &rarr;</span>
          </button>
        ))}
      </nav>
    );
  const back = masterPage && (
    <button
      className="sv-button border-sv-border bg-white text-sv-text"
      disabled={busy}
      onClick={() => openCategory(null)}
    >
      &larr; Back to Masters
    </button>
  );
  if (query.isPending) return <p role="status">Loading customer accounts…</p>;
  if (!query.data)
    return (
      <>
        {back}
        <p
          className="border-l-4 border-sv-red bg-red-50 px-3 py-2 text-red-900"
          role="alert"
        >
          {query.error?.message}{" "}
          <button onClick={() => query.refetch()}>Retry</button>
        </p>
      </>
    );
  const { accounts, masters, streets = [], streetsAvailable } = query.data;
  const terms = filterKeys.filter((key) => filters[key]?.trim());
  const filtered = accounts.filter((row) => {
    const searchText = search.trim().toLowerCase();
    if (
      searchText &&
      ![
        row.customer_code,
        row.name,
        row.cin,
        row.phone,
        row.area,
        row.profile.agent,
      ].some((v) => v?.toLowerCase().includes(searchText))
    )
      return false;
    if (!terms.length) return true;
    const values = accountForm(row);
    return terms.every((key) => {
      const term = filters[key]!.trim().toLowerCase();
      if (key === "channels")
        return values.channels.some(name => name.trim() === filters[key]);
      if (key === "street" || key === "plan" || key === "agent" || key === "status")
        return values[key].trim() === filters[key];
      return values[key].toLowerCase().includes(term);
    });
  });
  filtered.sort((a, b) =>
    descending
      ? idOrder.compare(b.customer_code, a.customer_code)
      : idOrder.compare(a.customer_code, b.customer_code),
  );
  async function exportCustomers() {
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Customers");
      const visibleColumns = optionalColumns.filter(([key]) => shown.includes(key));
      sheet.columns = visibleColumns.map(([key, label]) => ({ header: label, key, width: 22 }));
      for (const row of filtered) {
        const form = accountForm(row);
        const values: Record<string, string | number> = {};
        for (const [key] of visibleColumns) {
          if (key === "channels") values[key] = form.channels.join(", ");
          else if (key === "monthly_rent" || key === "monthly_total")
            values[key] = monthlyRent(row.monthly_rent, row.channel_fee);
          else if (key === "balance") values[key] = Number(form.balance);
          else if (key !== "select" && key !== "actions") values[key] = form[key] || "?";
        }
        sheet.addRow(values);
      }
      const bytes = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "customers.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Unable to export customers. Please try again.");
    }
  }
  const last = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const current = Math.min(page, last);
  const visible = filtered.slice(current * pageSize, (current + 1) * pageSize);
  const eligible = (r: Account) => r.is_active && !r.opted_out && !!r.phone;
  const chosen = accounts.filter((r) => selected.includes(r.id) && eligible(r));
  const payable = accounts.filter(
    (row) => selected.includes(row.id) && Number(row.balance) > 0,
  );
  async function recordSelectedPayments() {
    if (busy || !payable.length) return;
    const total =
      payable.reduce(
        (sum, row) => sum + Math.round(Number(row.balance) * 100),
        0,
      ) / 100;
    if (
      !window.confirm(
        "Record full payment for " +
          payable.length +
          " selected customers, totaling " +
          currency.format(total) +
          "? Their outstanding balances will be set to zero.",
      )
    )
      return;
    setBusy(true);
    setError("");
    const paid = new Set<string>();
    try {
      const groups = new Map<number, string[]>();
      for (const row of payable) {
        const amount = Number(row.balance);
        const group = groups.get(amount);
        if (group) group.push(row.id);
        else groups.set(amount, [row.id]);
      }
      for (const [balance, ids] of groups) {
        for (let i = 0; i < ids.length; i += 100) {
          const result = await request({
            action: "batch-paid",
            ids: ids.slice(i, i + 100),
            balance,
            confirmed: true,
          });
          for (const id of result.paid) paid.add(id);
        }
      }
      if (paid.size < payable.length)
        setError(
          "Some balances changed. Review the remaining selected customers before recording payment.",
        );
    } catch {
      setError(
        "Payment processing was interrupted. Review the refreshed balances before retrying.",
      );
    } finally {
      if (paid.size)
        toast.success("Payment recorded for " + paid.size + " customer(s).");
      setSelected((ids) => ids.filter((id) => !paid.has(id)));
      setCompose(false);
      try {
        await cache.invalidateQueries();
      } finally {
        setBusy(false);
      }
    }
  }
  const feedback = (
    <>
      {error && (
        <p
          role="alert"
          className="border-l-4 border-sv-red bg-red-50 px-3 py-2 text-red-900"
        >
          {error}
        </p>
      )}
    </>
  );
  if (masterPage) {
    if (category === "street")
      return (
        <>
          {back}
          {feedback}
          <section className="sv-panel">
            <h2 className="text-lg font-semibold">Streets</h2>
            {!streetsAvailable ? (
              <p role="status">Street setup is pending for this database.</p>
            ) : (
              <>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const fields = new FormData(form);
                    void save(
                      {
                        action: "street",
                        name: fields.get("name"),
                        area: fields.get("area"),
                        city: fields.get("city"),
                      },
                      () => form.reset(),
                    );
                  }}
                >
                  <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="sv-label">
                      Street name
                      <input
                        className="sv-field"
                        name="name"
                        required
                        maxLength={1000}
                      />
                    </label>
                    <label className="sv-label">
                      Area
                      <input
                        className="sv-field"
                        name="area"
                        required
                        maxLength={1000}
                      />
                    </label>
                    <label className="sv-label">
                      City
                      <input
                        className="sv-field"
                        name="city"
                        required
                        maxLength={1000}
                      />
                    </label>
                  </div>
                  <button
                    className="sv-button bg-sv-primary text-white"
                    disabled={busy}
                  >
                    Add street
                  </button>
                </form>
                {streets.length ? (
                  <div className="min-w-0 max-w-full overflow-auto">
                    <table
                      className="w-full border-separate border-spacing-0"
                      aria-label="Streets"
                    >
                      <thead className="sticky top-0 z-10 bg-sv-primary text-white [&_tr]:bg-sv-primary">
                        <tr>
                          <th className="sv-th">Street</th>
                          <th className="sv-th">Area</th>
                          <th className="sv-th">City</th>
                        </tr>
                      </thead>
                      <tbody className="[&>tr:nth-child(odd)]:bg-sv-row-alt [&>tr:nth-child(even)]:bg-sv-page">
                        {streets.map((street) => (
                          <tr key={street.id}>
                            <td className="sv-td">{street.name}</td>
                            <td className="sv-td">{street.area}</td>
                            <td className="sv-td">{street.city}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>No streets yet.</p>
                )}
              </>
            )}
          </section>
        </>
      );
    return (
      <>
        {back}
        {feedback}
        {masterSections
          .filter((section) => section.kind !== "street")
          .filter((section) => section.kind === category)
          .map(({ kind, title, field }) => {
            const items = masters.filter((item) => item.kind === kind);
            const priced = kind !== "agent";
            return (
              <section
                className="sv-panel"
                key={kind}
                aria-labelledby={"master-" + kind}
              >
                <h2 className="text-lg font-semibold" id={"master-" + kind}>
                  {title}
                </h2>
                <form onSubmit={(event) => addMaster(event, kind)}>
                  <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="sv-label">
                      {field}
                      <input
                        className="sv-field"
                        name="name"
                        maxLength={200}
                        required
                      />
                    </label>
                    {priced && (
                      <label className="sv-label">
                        Monthly amount (INR)
                        <input
                          className="sv-field"
                          name="amount"
                          type="number"
                          min="0"
                          step="0.01"
                          required
                        />
                      </label>
                    )}
                  </div>
                  <button
                    className="sv-button bg-sv-primary text-white"
                    disabled={busy}
                  >
                    Add {kind}
                  </button>
                </form>
                {items.length ? (
                  <div className="min-w-0 max-w-full overflow-auto">
                    <table
                      className="w-full border-separate border-spacing-0"
                      aria-label={title}
                    >
                      <thead className="sticky top-0 z-10 bg-sv-primary text-white [&_tr]:bg-sv-primary">
                        <tr>
                          <th className="sv-th">{field}</th>
                          {priced && <th className="sv-th">Monthly amount</th>}
                        </tr>
                      </thead>
                      <tbody className="[&>tr:nth-child(odd)]:bg-sv-row-alt [&>tr:nth-child(even)]:bg-sv-page">
                        {items.map((item) => (
                          <tr key={item.name}>
                            <td className="sv-td">{item.name}</td>
                            {priced && (
                              <td className="sv-td">
                                {currency.format(item.amount)}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>No {title.toLowerCase()} yet.</p>
                )}
              </section>
            );
          })}
      </>
    );
  }
  return (
    <>
      {!editor && feedback}
      {editor && (
        <Popup
          title={editor.id ? "Edit customer" : "Add customer"}
          busy={busy}
          onClose={() => setEditor(null)}
        >
          {feedback}
          <Profile
            form={editor.form}
            editing={!!editor.id}
            masters={masters}
            streets={streets}
            busy={busy}
            setForm={(form) => setEditor({ ...editor, form })}
            onClose={() => setEditor(null)}
            onSave={() =>
              save({ action: "save", ...editor }, () => setEditor(null))
            }
          />
        </Popup>
      )}
      {draft && (
        <Popup title="Advanced Filter" onClose={() => setDraft(null)}>
          <form
            className="bg-white"
            onSubmit={(e) => {
              e.preventDefault();
              setFilters(draft);
              setPage(0);
              setDraft(null);
            }}
          >
            <div className="grid gap-x-[38px] gap-y-[26px] p-5 sm:grid-cols-2 lg:grid-cols-3 [&_input]:h-11 [&_select]:h-11">
              {filterKeys.map((key) => {
                const change = (value: string) =>
                  setDraft({ ...draft, [key]: value });
                const options = dropdownOptions(key, accounts, masters, streets);
                return (
                  <label className="sv-label" key={key}>
                    {columnLabels[key]}
                    {options ? (
                      <select
                        className="sv-field"
                        value={draft[key] ?? ""}
                        onChange={(e) => change(e.target.value)}
                      >
                        <option value="">Any</option>
                        {options.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="sv-field"
                        type="text"
                        placeholder="Contains…"
                        value={draft[key] ?? ""}
                        onChange={(e) => change(e.target.value)}
                      />
                    )}
                  </label>
                );
              })}
            </div>
            <div className="sv-footer [&_button]:min-h-11">
              <button className="sv-button bg-sv-primary text-white">
                Apply filters
              </button>
              <button
                type="button"
                className="sv-button border-sv-border bg-white text-sv-text"
                onClick={() => setDraft({})}
              >
                Clear fields
              </button>
              <button
                type="button"
                className="sv-button border-sv-border bg-white text-sv-text"
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Popup>
      )}
      <section
        className="space-y-1.5 bg-sv-page"
        aria-label="Customer directory controls"
      >
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className="sv-button bg-sv-blue text-white" onClick={exportCustomers} disabled={!filtered.length}>Export Excel</button>
            <button
              className="sv-button bg-sv-orange text-white"
              disabled={busy}
              onClick={() => {
                setError("");
                setEditor({ form: blankForm() });
              }}
              aria-label="Add customer"
            >
              <span aria-hidden="true">+</span> Customer
            </button>
            <label className="sv-button bg-sv-blue text-white relative overflow-hidden focus-within:outline-2 [&_input]:absolute [&_input]:inset-0 [&_input]:size-full [&_input]:cursor-pointer [&_input]:opacity-0">
              <span aria-hidden="true">&uarr;</span> Import Excel
              <input
                className="max-w-full"
                type="file"
                accept=".xlsx"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (
                    !window.confirm(
                      "Import new customer IDs from " +
                        file.name +
                        " with their opening balances?",
                    )
                  )
                    return;
                  const data = new FormData();
                  data.set("file", file);
                  void save(data);
                }}
              />
            </label>
            <button
              className="sv-button bg-sv-green text-white"
              onClick={() => {
                setSelected([
                  ...new Set([...selected, ...filtered.map((r) => r.id)]),
                ]);
                setCompose(false);
              }}
              title="Select all matching customers"
            >
              Select all
            </button>
            <button
              className="sv-button bg-sv-sidebar text-white"
              disabled={!selected.length}
              onClick={() => {
                setSelected([]);
                setCompose(false);
              }}
              title="Clear the entire selection"
            >
              Deselect all
            </button>
          </div>
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Selected customer actions"
          >
            <button
              className="sv-button bg-sv-blue text-white"
              disabled={busy || !payable.length}
              onClick={recordSelectedPayments}
            >
              <span aria-hidden="true">&#10003;</span> Mark paid (
              {payable.length})
            </button>
            <button
              className="sv-button bg-sv-purple text-white"
              disabled={busy || !chosen.length}
              onClick={() => {
                setCompose(true);
                requestAnimationFrame(() =>
                  document.getElementById("account-compose")?.scrollIntoView(),
                );
              }}
            >
              <span aria-hidden="true">&#9993;</span> WhatsApp ({chosen.length})
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <button
            className="sv-button bg-sv-primary text-white"
            onClick={() => setDraft({ ...filters })}
          >
            <span aria-hidden="true">&#9662;</span> Filters
            {terms.length > 0 && " (" + terms.length + ")"}
          </button>
          {terms.length > 0 && (
            <button
              className="cursor-pointer text-sv-primary underline underline-offset-2"
              onClick={() => {
                setFilters({});
                setPage(0);
              }}
            >
              Clear filters
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-xs [&_label]:flex [&_label]:items-center [&_label]:gap-1 [&_select]:h-7 [&_select]:w-auto [&_button]:rounded-sv [&_button]:border [&_button]:border-sv-border [&_button]:bg-white [&_button]:px-2 [&_button]:py-1">
            <label className="sv-label">
              Rows
              <select
                className="sv-field"
                aria-label="Rows per page"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(0);
                }}
              >
                {[50, 100, 500, 1000].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={!current}
              onClick={() => setPage(current - 1)}
              aria-label="Previous page"
            >
              Prev
            </button>
            <span>
              Page {current + 1} of {last + 1}
            </span>
            <button
              disabled={current >= last}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">All customers</h1>
          <details className="relative [&_summary]:rounded-sv [&_summary]:border [&_summary]:border-sv-border [&_summary]:bg-white [&_summary]:px-2 [&_summary]:py-1 [&_label]:flex [&_label]:items-center [&_label]:gap-2 [&_label]:py-1">
            <summary>Columns</summary>
            <div className="absolute left-0 top-full z-30 max-h-[50dvh] w-56 overflow-auto border border-sv-border bg-white p-3">
              <fieldset>
                <legend>Columns to display</legend>
                {optionalColumns.map(([key, label]) => (
                  <label className="sv-label" key={key}>
                    <input
                      className="size-3.5 shrink-0 accent-sv-primary"
                      type="checkbox"
                      checked={shown.includes(key)}
                      disabled={shown.length === 1 && shown[0] === key}
                      onChange={(event) =>
                        showColumns(
                          event.target.checked
                            ? [...shown, key]
                            : shown.filter((value) => value !== key),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <button
                type="button"
                className="sv-button border-sv-border bg-white text-sv-text text-xs"
                onClick={() => showColumns(columnKeys)}
              >
                Show all columns
              </button>
            </div>
          </details>
          <div className="flex w-full items-center sm:ml-auto sm:w-[300px]">
            <span
              aria-hidden="true"
              className="grid h-9 w-10 shrink-0 place-items-center border border-r-0 border-sv-border bg-sv-row-alt"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="10" cy="10" r="6" />
                <path d="m15 15 6 6" />
              </svg>
            </span>
            <input
              className="sv-field h-9 rounded-l-none"
              aria-label="Search all customers"
              placeholder="Search customers"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
        </div>
      </section>
      <section className="min-w-0" aria-label="Customer directory">
        <div className="min-w-0 max-w-full max-h-[max(40dvh,calc(100dvh-239px))] overflow-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-sv-primary text-white [&_tr]:bg-sv-primary">
              <tr>
                <th className="sv-th" scope="col">
                  Select
                </th>
                {optionalColumns
                  .filter(([key]) => shown.includes(key))
                  .map(([key, label]) =>
                    key === "customer_code" ? (
                      <th
                        className="sv-th"
                        key={key}
                        scope="col"
                        aria-sort={descending ? "descending" : "ascending"}
                      >
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 uppercase"
                          aria-label={
                            "Sort by Customer ID " +
                            (descending ? "ascending" : "descending")
                          }
                          onClick={() => {
                            setDescending((value) => !value);
                            setPage(0);
                          }}
                        >
                          {label}
                          <span aria-hidden="true">
                            {descending ? "\u2193" : "\u2191"}
                          </span>
                        </button>
                      </th>
                    ) : (
                      <th className="sv-th" key={key} scope="col">
                        {label}
                      </th>
                    ),
                  )}
                <th
                  scope="col"
                  className="sv-th sticky right-0 bg-inherit text-center"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(odd)]:bg-sv-row-alt [&>tr:nth-child(even)]:bg-sv-page">
              {visible.map((row) => {
                const f = accountForm(row);
                return (
                  <tr key={row.id}>
                    <td className="sv-td">
                      <input
                        className="size-3.5 shrink-0 accent-sv-primary"
                        type="checkbox"
                        aria-label={"Select " + row.customer_code}
                        disabled={busy}
                        checked={selected.includes(row.id)}
                        onChange={(e) => {
                          setCompose(false);
                          setSelected(
                            e.target.checked
                              ? [...selected, row.id]
                              : selected.filter((id) => id !== row.id),
                          );
                        }}
                      />
                    </td>
                    {columns
                      .filter(([key]) => shown.includes(key))
                      .map(([key]) => (
                        <td
                          key={key}
                          className={
                            key === "name"
                              ? "sv-td min-w-52 font-bold text-[15px] text-sv-primary"
                              : "sv-td whitespace-nowrap"
                          }
                        >
                          {key === "customer_code" && row.is_active && (
                            <span
                              aria-hidden="true"
                              className="mr-1 inline-block size-3 rounded-full bg-sv-green"
                            />
                          )}
                          {key === "monthly_rent"
                            ? currency.format(
                                monthlyRent(row.monthly_rent, row.channel_fee),
                              )
                            : key === "balance"
                              ? currency.format(Number(f[key]))
                              : f[key] || "—"}
                        </td>
                      ))}
                    {shown.includes("cin") && (
                      <td className="sv-td">{f.cin || "—"}</td>
                    )}
                    {shown.includes("channels") && (
                      <td className="sv-td">{f.channels.join(", ") || "—"}</td>
                    )}
                    {shown.includes("monthly_total") && (
                      <td className="sv-td">
                        {currency.format(
                          monthlyRent(row.monthly_rent, row.channel_fee),
                        )}
                      </td>
                    )}
                    <td className="sv-td sticky right-0 bg-inherit text-center">
                      <div className="flex justify-center gap-1 [&_button]:grid [&_button]:h-6 [&_button]:w-7 [&_button]:place-items-center [&_button]:rounded-sv [&_button]:text-white [&_button:first-child]:bg-sv-yellow [&_button:nth-child(2)]:bg-sv-blue [&_button:last-child]:bg-sv-red [&_svg]:size-4">
                        <button
                          type="button"
                          title="Edit customer"
                          aria-label={"Edit customer " + row.customer_code}
                          disabled={busy}
                          onClick={() => {
                            setError("");
                            setEditor({ id: row.id, form: f });
                          }}
                        >
                          <svg
                            aria-hidden="true"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4 16l-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          title="Mark as paid"
                          aria-label={"Mark as paid " + row.customer_code}
                          disabled={busy || row.balance <= 0}
                          onClick={() => {
                            if (
                              confirm(
                                "Record " +
                                  currency.format(row.balance) +
                                  " as paid for " +
                                  row.name +
                                  "?",
                              )
                            )
                              void save({
                                action: "paid",
                                id: row.id,
                                balance: Number(row.balance),
                              });
                          }}
                        >
                          <svg
                            aria-hidden="true"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 12l6 6L21 6" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          title="Delete customer"
                          aria-label={"Delete customer " + row.customer_code}
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                "Delete " +
                                  row.name +
                                  " (" +
                                  row.customer_code +
                                  ") and their bills?",
                              )
                            )
                              void save({ action: "delete", id: row.id }, () =>
                                setEditor(null),
                              );
                          }}
                        >
                          <svg
                            aria-hidden="true"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visible.length && <p className="p-3">No matching customers.</p>}
        <p className="border border-sv-grid-border bg-white px-3 py-2.5">
          Total customers: <strong>{filtered.length}</strong>
        </p>
      </section>
      {compose && chosen.length > 0 && (
        <div id="account-compose">
          <ImportRecipients
            key={chosen.map((r) => r.id).join(",")}
            rows={chosen}
            directory
            unpaid={false}
            ready={ready}
          />
        </div>
      )}
    </>
  );
}
