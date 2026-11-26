# Cable WhatsApp Manager

Next.js UI/API, Supabase queue and external WAHA. See [deployment instructions](deploy/QUEUE.md).

Use exactly the seven variables in `deploy/queue.env.example`. Existing databases apply any unapplied migrations in order: 0002, 0003 and 0004 (never rerun 0001). New databases apply all migrations. Create an Auth user and add its UUID to `operators`. Run `npm install` and `npm run dev` (port 3001).

Send starts a bounded batch with Next.js `after()`. While the authenticated application is open, the browser discovers pending work and awaits additional authenticated batch requests. Closing all tabs pauses continuation after the current batch; reopening resumes safely. No separate worker, scheduler, app URL variable or webhook configuration is required. Delivery/read confirmation webhooks remain optional.

CIN is a separate customer identifier; STB / User ID remains the matching key. After applying `0004_customer_cin.sql`, re-upload the customer directory and save to sync CINs for existing accounts without changing other details. CIN is optional for older files, searchable in customer and unpaid-upload lists, and included in customer exports.

Verification: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Tests use mocked WAHA sends and isolated PGlite PostgreSQL. No live customer messages are sent by tests.

`npm run worker` is an optional manual single-batch utility; it uses the same seven variables and exits. Do not launch it during testing against customer data.
