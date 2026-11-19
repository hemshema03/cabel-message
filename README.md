# Cable WhatsApp Manager

Configure .env.local from .env.local.example. Apply supabase/migrations/0001_initial.sql in Supabase. Create an Auth user and insert its UUID into public.operators using the SQL editor. Run npm install, npm run dev (port 3001), and npm run worker in a separate terminal.

Tests: npm test, npm run typecheck, npm run lint, npm run build.

Implementation status: backend foundation and basic panels only. Full mapping/confirmation screens, campaign composer, editing, webhooks, retries and complete reporting remain unfinished. Do not use for production messaging. Live database and WAHA integration have not been verified. Service-role keys must remain server-only.
