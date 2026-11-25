# Cable WhatsApp Manager

Next.js UI/API, Supabase queue and external WAHA. Read [production deployment instructions](deploy/QUEUE.md) before enabling sends.

The original Send handler only inserted queue rows, consumed by a separate infinite-loop script that Vercel never launched. Send now schedules a bounded batch; an authenticated endpoint and existing-VPS systemd timer provide continuation and recovery.

Configure environment using `deploy/queue.env.example`. New databases apply 0001 then 0002; existing databases apply **only 0002**. Create an Auth user and insert its UUID into `operators`. Run `npm install` and `npm run dev` (port 3001).

Verification: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Queue tests use mocked sends and isolated PostgreSQL through the development-only PGlite dependency. No real customer messages are sent by tests.

`npm run worker` now invokes one bounded endpoint request and exits. The VPS timer is required for unattended continuation. Production configuration, migration and timer activation remain deployment steps.
