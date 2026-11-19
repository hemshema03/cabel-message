# Cable Customer WhatsApp Management System

## 1. Goal
Build a local-first web dashboard for a cable TV operator to import customer records from Excel, send WhatsApp payment reminders to unpaid customers, broadcast service outage notices to all customers, and review message results by month.

## 2. Technology
- Next.js (App Router) + TypeScript
- Tailwind CSS (simple responsive dashboard)
- TanStack Query (`@tanstack/react-query`) for API state, mutations, retries and cache invalidation
- Supabase PostgreSQL + Supabase Auth, using `@supabase/supabase-js` and `@supabase/ssr` (no Prisma or SQLite)
- `xlsx` / SheetJS or `exceljs` for spreadsheet import; `zod` for validation
- WAHA (WhatsApp HTTP API), already running in Docker
- Optional: `date-fns`, `lucide-react`, `react-hook-form`

**Important:** The web app does not connect directly to Docker from the browser. Next.js server-side route handlers call WAHA over HTTP. If Next.js runs on the host, use `http://127.0.0.1:3000` for WAHA, assuming port 3000 is published. If Next.js runs in Docker on the same network, use `http://waha:3000`. Run Next.js on port **3001** to avoid the WAHA port conflict. Confirm the actual WAHA port, API key, session name and engine/API version before using the integration.

## 3. Main navigation (three panels)

### Panel 1: Dashboard (`/dashboard`)
- Cards: total customers, unpaid customers for selected month, outstanding balance, reminders sent, failed, pending and delivered (when supported).
- Month/year filter and monthly summary.
- Recent campaign runs, latest imports, WAHA connection/session indicator.
- Quick actions: Upload Unpaid Excel, Upload All Customers Excel, Create Breakdown Announcement.

### Panel 2: Unpaid Customers (`/unpaid`)
- Upload Excel `.xlsx`/`.xls` (optionally `.csv`).
- Map columns from uploaded spreadsheet to: customer code, name, WhatsApp number, address, unpaid amount, bill month, due date, optional area and notes.
- Show preview, validation errors, duplicate detection and confirm import before saving.
- Table: checkbox, code, name, phone, address, month, unpaid amount, due date, send status, sent time, last error.
- Filters: month/year, search, area, payment state, message status.
- Send reminder to one customer, selected customers, or all eligible unpaid customers.
- Edit message template before sending; preview per customer.
- Mark as paid manually or update via a subsequent Excel import; paid customers are excluded from new reminder runs.
- Download monthly results as Excel, including failed/unsent rows.

**Default payment reminder**

> Hi {{name}}, your pending cable TV payment for {{month}} is ₹{{amount}}. Please pay as soon as possible. Thank you.

Example:

> Hi Sandy, your pending cable TV payment for November 2026 is ₹450. Please pay as soon as possible. Thank you.

### Panel 3: All Customers (`/customers`)
- Upload complete customer directory from Excel, with preview and mapping.
- Columns: code, name, phone, address, area, active/inactive, optional notes.
- Add/edit/deactivate customers manually; search and filter by area.
- Compose an announcement for all active customers or a selected area/customer group.
- Announcement types: service breakdown, scheduled maintenance, service restored, custom message.
- Preview recipient count and message; require explicit confirmation before sending.
- Per-customer send result and history; export results.

**Default outage announcement**

> Dear {{name}}, cable TV service in {{area}} may be unavailable from {{startTime}} to {{endTime}} on {{date}} due to {{reason}}. We apologize for the inconvenience. Thank you.

**Service restored template**

> Dear {{name}}, cable TV service in {{area}} has been restored. Thank you for your patience.

## 4. Screen layout (basic UI)

```text
+--------------------------------------------------------------------------+
| Cable WhatsApp Manager                WAHA: Connected       [Settings]    |
+----------------------+---------------------------------------------------+
| Dashboard            | Summary cards / monthly filter                    |
| Unpaid Customers     | Search / Import Excel / Message Preview / Send    |
| All Customers        | Customer list / Broadcast composer / Send status  |
| Message History      | Campaign details / recipient results / export     |
+----------------------+---------------------------------------------------+
```

Message History can be a secondary route linked from all three panels, not a fourth primary panel.

## 5. Excel templates

### Unpaid customers upload (`unpaid-customers.xlsx`)
| customer_code | name | phone | address | area | unpaid_amount | bill_month | due_date |
|---|---|---|---|---|---:|---|---|
| C001 | Sandy | 919876543210 | 10 Main Road | North | 450 | 2026-11 | 2026-11-25 |
| C002 | Priya | 919876543211 | 12 Park Street | South | 300 | 2026-11 | 2026-11-25 |

### All customers upload (`all-customers.xlsx`)
| customer_code | name | phone | address | area | active |
|---|---|---|---|---|---|
| C001 | Sandy | 919876543210 | 10 Main Road | North | TRUE |
| C002 | Priya | 919876543211 | 12 Park Street | South | TRUE |

- The sample numbers are placeholders, not real recipients.
- Store `customer_code` and `phone` as **text** in Excel. Normalize Indian numbers to digits with country code (e.g. `91XXXXXXXXXX`) before WAHA use. Validate rather than blindly adding `91` to every number.
- Keep original imported values in a staging preview; report invalid/missing phone numbers, missing codes, duplicate codes and invalid amounts.
- Match customers by unique `customer_code` on re-import, update changed contact information and retain prior message history.
- For unpaid imports, identify the bill month using `YYYY-MM`; upsert each `(customer_id, bill_month)` balance, never overwrite history from other months. A new monthly file should not automatically erase old outstanding balances.
- Decide how absent rows are treated: default **do not delete or mark paid**. A payment status update must be explicit.
- Prevent spreadsheet formula injection in exports: escape text beginning with `=`, `+`, `-`, or `@`.

## 6. Suggested folder structure

```text
cable-whatsapp-manager/
├── .env.local.example
├── .gitignore
├── README.md
├── package.json
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs
├── supabase/
│   └── migrations/
│       └── 0001_initial.sql
├── public/
│   └── templates/
│       ├── unpaid-customers.xlsx
│       └── all-customers.xlsx
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── providers.tsx
│   │   ├── page.tsx                 # redirect to /dashboard
│   │   ├── dashboard/page.tsx
│   │   ├── unpaid/page.tsx
│   │   ├── customers/page.tsx
│   │   ├── history/page.tsx
│   │   ├── settings/page.tsx
│   │   └── api/
│   │       ├── dashboard/route.ts
│   │       ├── customers/route.ts
│   │       ├── customers/[id]/route.ts
│   │       ├── bills/route.ts
│   │       ├── bills/[id]/route.ts
│   │       ├── imports/preview/route.ts
│   │       ├── imports/commit/route.ts
│   │       ├── campaigns/route.ts
│   │       ├── campaigns/[id]/route.ts
│   │       ├── campaigns/[id]/send/route.ts
│   │       ├── campaigns/[id]/results/route.ts
│   │       ├── waha/status/route.ts
│   │       └── waha/webhook/route.ts
│   ├── components/
│   │   ├── layout/sidebar.tsx
│   │   ├── layout/header.tsx
│   │   ├── dashboard/stat-card.tsx
│   │   ├── customers/customer-table.tsx
│   │   ├── unpaid/unpaid-table.tsx
│   │   ├── import/excel-uploader.tsx
│   │   ├── import/column-mapper.tsx
│   │   ├── import/import-preview.tsx
│   │   ├── messaging/message-editor.tsx
│   │   ├── messaging/message-preview.tsx
│   │   ├── messaging/send-confirm-dialog.tsx
│   │   ├── messaging/status-badge.tsx
│   │   └── ui/...
│   ├── hooks/
│   │   ├── use-customers.ts
│   │   ├── use-unpaid-bills.ts
│   │   ├── use-dashboard.ts
│   │   └── use-campaigns.ts
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   └── admin.ts
│   │   ├── query-client.ts
│   │   ├── waha.ts
│   │   ├── excel.ts
│   │   ├── phone.ts
│   │   ├── templates.ts
│   │   ├── validation.ts
│   │   └── auth.ts
│   ├── server/
│   │   ├── services/customer-service.ts
│   │   ├── services/billing-service.ts
│   │   ├── services/import-service.ts
│   │   ├── services/campaign-service.ts
│   │   └── jobs/send-queue.ts
│   └── types/
│       ├── customer.ts
│       ├── billing.ts
│       └── messaging.ts
└── scripts/
    └── run-worker.ts
```

## 7. Database design

**Customer**
- `id` UUID primary key
- `customerCode` unique string
- `name`, `phone`, `address`, `area`, `notes`
- `isActive` boolean; `createdAt`, `updatedAt`

**MonthlyBill**
- `id` UUID, `customerId` foreign key
- `billMonth` string (`YYYY-MM`)
- `unpaidAmount` decimal (store money precisely)
- `dueDate` optional date
- `paymentStatus` enum: `UNPAID`, `PAID`, `PARTIAL`
- `updatedAt`
- unique `(customerId, billMonth)`

**ImportBatch**
- `id`, `kind` (`CUSTOMERS` or `UNPAID`), `fileName`, `billMonth` optional
- `rowCount`, `validCount`, `errorCount`, `importedAt`

**Campaign**
- `id`, `type` (`PAYMENT_REMINDER`, `BREAKDOWN`, `MAINTENANCE`, `RESTORED`, `CUSTOM`)
- `title`, `template`, `billMonth` optional, `createdAt`, `startedAt`, `finishedAt`
- `status`: `DRAFT`, `QUEUED`, `RUNNING`, `COMPLETED`, `PARTIAL_FAILURE`, `CANCELLED`
- `targetFilter` JSON (month, area, selected IDs)

**MessageDelivery**
- `id`, `campaignId`, `customerId`, `monthlyBillId` nullable
- `recipientPhone`, `renderedMessage`, `wahaMessageId` nullable
- `status`: `QUEUED`, `SENDING`, `ACCEPTED`, `SENT`, `DELIVERED`, `READ`, `FAILED`, `SKIPPED`
- `attemptCount`, `lastError`, `createdAt`, `sentAt`, `deliveredAt`, `readAt`
- unique `(campaignId, customerId)` for deduplication within a campaign

**WebhookEvent** (optional)
- `id`, `eventId` or dedupe hash, `wahaMessageId`, `eventType`, `receivedAt`, `payload` JSON

Distinguish **WAHA API accepted** from **WhatsApp sent/delivered/read**. Only display delivery states actually supported and reported by the running WAHA engine. A successful API response is not proof of recipient delivery.


## 7A. Supabase implementation requirements

- Create a Supabase project at https://supabase.com/dashboard and copy the project URL and publishable/anon key to `.env.local`. Keep the service-role key server-only.
- Use Supabase Auth for admin/operator sign-in; do not allow anonymous access to customer addresses, phone numbers or billing data.
- SQL migrations in `supabase/migrations/` must create `customers`, `monthly_bills`, `import_batches`, `campaigns`, `message_deliveries`, and `webhook_events`, with UUID primary keys, foreign keys, `created_at`/`updated_at`, indexes, and unique constraints on `customer_code`, `(customer_id,bill_month)` and `(campaign_id,customer_id)`. Use `numeric(12,2)` for rupee balances and `date` for due dates.
- Enable Row Level Security on **every** exposed table. Create an operator authorization policy (e.g. an `operators` table linked to `auth.users`) and explicitly restrict reads/writes to authenticated authorized operators. Never use a blanket `USING (true)` policy for customer data.
- Server route handlers must verify the Supabase user session and operator permission before database writes or WAHA calls. Use `@supabase/ssr` for cookie-aware auth. Do not trust client-supplied operator IDs.
- Use SQL transactions or PostgreSQL RPC functions for atomic Excel imports and campaign recipient creation. Avoid half-imported files.
- Keep campaign queues in Supabase tables. Run a separate local Node worker with a restricted service-role credential to claim queued rows atomically (`FOR UPDATE SKIP LOCKED` via a carefully permissioned RPC) and send to local WAHA. Persist attempts and results.
- Supabase is hosted remotely but WAHA is local: a Supabase Edge Function cannot reach `127.0.0.1` on your computer. Keep WAHA calls and the worker on the machine/network that can access Docker.
- Add `UNKNOWN`/`NEEDS_REVIEW` for ambiguous send outcomes, and `opted_out` to customers. Add appropriate indexes for month, status and customer searches.

### Example Supabase SQL migration starter

```sql
create extension if not exists pgcrypto;
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null unique,
  name text not null,
  phone text not null,
  address text, area text, notes text,
  is_active boolean not null default true,
  opted_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.monthly_bills (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  bill_month text not null check (bill_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  unpaid_amount numeric(12,2) not null check (unpaid_amount >= 0),
  due_date date,
  payment_status text not null default 'UNPAID'
    check (payment_status in ('UNPAID','PAID','PARTIAL')),
  updated_at timestamptz not null default now(),
  unique(customer_id, bill_month)
);
alter table public.customers enable row level security;
alter table public.monthly_bills enable row level security;
-- Complete all remaining tables and restrictive operator policies
-- before allowing application access. This snippet alone is not a full migration.
```

## 8. WAHA integration

### Environment file (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_PUBLISHABLE_KEY"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SECRET_SERVICE_ROLE_KEY"
WAHA_BASE_URL="http://127.0.0.1:3000"
WAHA_API_KEY="replace-with-your-local-waha-api-key"
WAHA_SESSION="default"
WAHA_WEBHOOK_SECRET="replace-with-random-secret"
APP_BASE_URL="http://localhost:3001"
```

Only the Supabase URL and publishable/anon key may use `NEXT_PUBLIC_`. Never expose the Supabase service-role key or WAHA key in the browser. Keep `.env.local` out of Git. Require Supabase Auth on all dashboard and API routes; enforce RLS on exposed tables. Use service-role access only in trusted server code after authorization checks.

### Example server-only WAHA helper (`src/lib/waha.ts`)

```ts
import "server-only";

const baseUrl = process.env.WAHA_BASE_URL!;
const apiKey = process.env.WAHA_API_KEY!;
const session = process.env.WAHA_SESSION ?? "default";

export async function sendWahaText(phone: string, text: string) {
  const chatId = `${phone}@c.us`;
  const response = await fetch(`${baseUrl}/api/sendText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({ session, chatId, text }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`WAHA error ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}
```

This is a **starting example**, not a tested connection. Check your installed WAHA version's `/api/sendText` contract and session setup. WAHA engine and edition can affect message status/webhook support.

### Connection and session checks
- `GET /api/waha/status` checks server availability and session state from Next.js.
- Do not send unless the session is ready/working.
- Provide a settings screen showing configured endpoint (without revealing secret), session and latest connection result.
- Configure WAHA message status webhooks to `POST /api/waha/webhook` if supported; verify a shared secret or authenticated webhook header and correlate updates to stored WAHA message IDs.
- If webhook status is not available, show `ACCEPTED` or the last verifiable status rather than guessing delivery.

## 9. Sending workflow and safety

1. User imports an Excel file; server validates rows and shows preview.
2. User confirms import; customers and bills are upserted transactionally.
3. User chooses month and unpaid recipients, or chooses an announcement audience.
4. User previews the rendered message and recipient count.
5. User clicks **Confirm & Send**. The server creates a campaign and one delivery record per eligible customer.
6. A persistent worker processes queued messages sequentially with a configurable conservative delay and bounded retries for transient errors. **Do not use an in-memory loop inside a Next.js request for bulk sending**; it can stop if the request/server restarts.
7. Save each WAHA API response and message ID; mark `ACCEPTED` only when accepted.
8. Update message states from authenticated webhooks where supported.
9. UI refreshes via TanStack Query polling while a campaign is active; the user can export per-recipient results.
10. Failed records can be retried explicitly; prevent duplicate sends from double clicks and avoid automatically retrying uncertain outcomes.

**Important safeguards:**
- Only message customers who have agreed to receive these service/payment communications; honor opt-outs and applicable WhatsApp policies.
- Suppress inactive, invalid and opted-out contacts.
- For monthly reminders, show whether a customer was already reminded in the selected month and require explicit confirmation to resend.
- Never treat a network timeout after a send request as definitely unsent; it may have been accepted. Mark it `UNKNOWN` or `NEEDS_REVIEW` in a production implementation and reconcile before retrying.
- Require confirmation for bulk sends, show counts and sample messages, and allow cancellation of unsent queued messages.
- Add audit logging and protect customer personal data.

## 10. API routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/dashboard?month=2026-11` | Monthly metrics |
| GET/POST | `/api/customers` | List/create customers |
| PATCH | `/api/customers/:id` | Update customer |
| GET | `/api/bills?month=2026-11` | List monthly unpaid balances |
| PATCH | `/api/bills/:id` | Mark paid / update balance |
| POST | `/api/imports/preview` | Parse uploaded Excel and return column mapping + validation |
| POST | `/api/imports/commit` | Confirm and persist validated import |
| GET/POST | `/api/campaigns` | List/create draft campaigns |
| GET | `/api/campaigns/:id` | Campaign summary |
| POST | `/api/campaigns/:id/send` | Confirm, queue recipients, start sending |
| GET | `/api/campaigns/:id/results` | Per-customer status and export data |
| GET | `/api/waha/status` | Check WAHA readiness |
| POST | `/api/waha/webhook` | Receive verified delivery updates |

Validate all inputs server-side with Zod. Apply pagination to customer and history tables. Make the campaign send endpoint idempotent.

## 11. TanStack Query pattern

```tsx
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useMonthlyBills(month: string) {
  return useQuery({
    queryKey: ["bills", month],
    queryFn: async () => {
      const res = await fetch(`/api/bills?month=${encodeURIComponent(month)}`);
      if (!res.ok) throw new Error("Failed to load bills");
      return res.json();
    },
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: unknown) => {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create campaign");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}
```

Use `QueryClientProvider` in `src/app/providers.tsx` and wrap it in the root layout. Poll campaign details/results only while status is `QUEUED` or `RUNNING`.

## 12. Monthly reporting

For every month, show:
- Number of customers with unpaid balances
- Total outstanding amount
- Number of eligible recipients
- Messages queued, accepted, sent, delivered, read, failed, skipped (where supported)
- Customers already contacted in the month
- Latest reminder timestamp per customer
- Exportable report: month, code, name, phone, amount, message, status, error, timestamps

The month filter applies to **bill month**, not necessarily the month when a WhatsApp message was sent. Store both dates to avoid confusing reports.

## 13. Implementation phases

**Phase 1 — Foundation:** Create Next.js app, Tailwind, Supabase project and SQL migrations, Supabase Auth, TanStack Query provider, sidebar and empty pages.

**Phase 2 — Customer data:** Build Excel upload/preview/mapping, customer directory, monthly unpaid bills and filters.

**Phase 3 — WhatsApp:** Add server-side WAHA helper, connection status, templates, one-person test send and campaign confirmation.

**Phase 4 — Bulk sending:** Add durable queue worker, recipient statuses, retries, deduplication and cancellation.

**Phase 5 — Reporting:** Add monthly dashboard, campaign history, delivery webhooks (if supported) and Excel exports.

## 14. Acceptance checklist

- [ ] Three main panels: Dashboard, Unpaid Customers, All Customers.
- [ ] Upload and preview both Excel file types.
- [ ] Invalid rows and duplicates are visible before import.
- [ ] Importing next month's unpaid file preserves previous months.
- [ ] Payment reminder includes each customer's correct name, amount and bill month.
- [ ] Breakdown message can target all active customers or a selected area.
- [ ] User confirms recipients and content before sending.
- [ ] WAHA credentials are server-only and connection state is visible.
- [ ] Each recipient has an independently recorded send outcome.
- [ ] A successful API response is not mislabeled as delivered.
- [ ] Failed/unknown messages are handled without accidental duplicates.
- [ ] Dashboard and exports support monthly filtering.
- [ ] Restarting the web server does not erase campaign records or queued work.

## 15. Initial setup commands

```bash
npx create-next-app@latest cable-whatsapp-manager --typescript --tailwind --eslint --app --src-dir
cd cable-whatsapp-manager
npm install @tanstack/react-query @supabase/supabase-js @supabase/ssr zod xlsx date-fns lucide-react
npm install -D tsx
# Create a Supabase project and configure .env.local.
# Apply supabase/migrations/0001_initial.sql via Supabase SQL Editor or CLI.
npm run dev -- -p 3001
```

**Scope:** This document is the requested project specification and architecture, not a working application. Implement and test WAHA access locally before sending any real customer messages.

## 16. Codex implementation prompt

Open this file in the project directory and tell Codex:

> Implement the complete Cable WhatsApp Manager described in `CABLE_WHATSAPP_PROJECT.md` using Next.js App Router, TypeScript, Tailwind CSS, TanStack Query and Supabase PostgreSQL/Auth. Do not use Prisma or SQLite. Build all three panels, Excel import preview and mapping, monthly bills, WAHA integration, durable local queue worker, authenticated status webhooks, and reporting. Add SQL migrations with restrictive RLS policies, `.env.local.example`, README, scripts and tests. Never hardcode secrets. Do not send real WhatsApp messages without explicit user confirmation in the UI. Run lint/typecheck/tests and fix failures.

To reduce routine Codex CLI prompts, use `codex --full-auto` from an isolated project folder. `--dangerously-bypass-approvals-and-sandbox` removes safeguards and should only be considered inside a disposable, restricted VM/container with no personal files or production credentials. Neither option removes real Supabase account setup, credential requirements, or the app's explicit send confirmation.
