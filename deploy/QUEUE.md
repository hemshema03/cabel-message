# Production deployment and recovery

## Root cause and implementation

Send previously inserted rows without starting a consumer. Only the separate infinite-loop `npm run worker` consumed them. Vercel does not launch that script. A successful manual WAHA send did not exercise this missing consumer. There was also no acknowledgement webhook handler.

Send now schedules one bounded batch with Next.js `after()`, using the same processor as `POST /api/queue/process`. Supabase is the durable queue; an existing-VPS systemd timer supplies continuation. There are no self-calling HTTP chains, persistent Vercel workers, or detached send promises. TanStack Query refreshes history/details and dashboard counts; history includes **Resume queue**.

The routes use Node.js. Next.js 16.4 with Cache Components forbids explicit `runtime` exports and requires default Node.js. Processing/Send have `maxDuration=60`, webhooks 15 seconds. Batches claim at most five rows, one at a time, within a 45-second budget with conservative headroom before starting another row. Usually fewer than five fit. Supabase requests time out after 5 seconds; WAHA after 12. Five-second pacing is enforced across invocations. The old `SEND_DELAY_MS` variable is no longer used.

## Deployment order

1. Stop any old standalone worker. Wait for its in-flight call to finish; do not reset `SENDING` or `UNKNOWN` rows.
2. Back up as normal. Apply `supabase/migrations/0002_serverless_queue.sql` **once** in Supabase SQL Editor. Existing databases must **not** rerun 0001. The migration is additive, disables legacy claiming, and does not delete customers or recreate campaigns.
3. Configure Vercel **Production** environment variables below, then redeploy using `npm run build`. Preview deployments must use a separate test database and mocked WAHA to avoid consuming production queues.
4. Verify deployed functions have the 60-second limit. Ensure Deployment Protection allows the VPS processor and webhook through; application authentication still applies.
5. Configure the webhook and install the VPS timer, leaving it disabled until actual sending is approved.
6. When ready to send existing queued messages, enable the timer or use **Resume queue**. The global timer makes ALL active queued campaigns eligible. New Send clicks also start sending immediately.

## Environment verification

| Variable | Production value / scope |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing production project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Matching anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Matching service role key; server only |
| `WAHA_BASE_URL` | `http://178.236.185.109:3010`, no `/api` suffix |
| `WAHA_API_KEY` | Existing WAHA key; server only |
| `WAHA_SESSION` | `default` |
| `WAHA_WEBHOOK_SECRET` | Random HMAC secret shared with WAHA |
| `QUEUE_PROCESS_SECRET` | Separate random bearer secret shared with the VPS |
| `APP_BASE_URL` | App's production HTTPS origin; VPS only |

Generate secrets independently using `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Store securely, never commit. No `NEXT_PUBLIC_` prefix on privileged keys. The supplied WAHA URL is HTTP; a TLS reverse proxy on the existing VPS can protect credentials in transit without installing another WAHA instance.

Run `node --env-file=.env.local scripts/check-queue-env.mjs` for a secret-safe presence/shape check. For actual Vercel verification, use an authenticated CLI: `vercel env pull .env.production-check --environment=production`, run the checker with that ignored file, then remove it. This checks presence/shape, not credential authentication. Validate credentials with read-only WAHA session and Supabase checks. **Do not use the processing route as a health check: it sends messages.**

The local check confirmed the requested WAHA URL and default session, and found that the new `QUEUE_PROCESS_SECRET` is not yet set. During implementation only local variable presence was verified; no linked Vercel project was available. Production values still require deployment-time verification. See `queue.env.example` for a template.

## Existing VPS continuation

Use systemd and Node.js 22.6+ (24 LTS recommended). The timer launches a short-lived HTTP client; no extra WAHA instance, hosted queue, or paid service is needed.

Copy `scripts/queue-tick.ts` to `/opt/cable-queue/queue-tick.ts`. Copy `deploy/cable-queue.service` and `.timer` to `/etc/systemd/system/`. Create a dedicated system user `cable-queue`; make the script readable by it. Set root-owned `/etc/cable-queue.env` (mode 600) to:

```dotenv
APP_BASE_URL=https://YOUR_PRODUCTION_DOMAIN
QUEUE_PROCESS_SECRET=YOUR_VERCEL_QUEUE_SECRET
```

Systemd reads the environment file before dropping privileges. Adjust the service's `/usr/bin/node` path if necessary.

```sh
sudo systemctl daemon-reload
# Only when approved to send queued messages:
sudo systemctl enable --now cable-queue.timer
sudo systemctl status cable-queue.timer
sudo journalctl -u cable-queue.service -n 50
```

Each tick follows the prior invocation by five seconds. Failed invocations recover on a later tick, including after reboot. A global 90-second database lease serializes Send/Resume/timer calls. The timer is required for unattended continuation after the browser closes and for large campaigns. Monitor timer failures, Vercel function usage and oldest queued rows. Existing Vercel usage limits still apply. `npm run worker` now performs a single endpoint invocation and exits; it is only a compatibility entry point.

## WAHA acknowledgements

On the existing `default` session, preserve existing configuration and other webhooks. Add this entry to `config.webhooks` in WAHA Dashboard/session configuration, or merge it via your installed version's session-update API:

```json
{
  "url": "https://YOUR_PRODUCTION_DOMAIN/api/waha/webhook",
  "events": ["message.ack"],
  "hmac": {"key": "YOUR_WAHA_WEBHOOK_SECRET"},
  "retries": {"policy": "constant", "delaySeconds": 2, "attempts": 15}
}
```

Do not create/replace the session or overwrite unrelated configuration. If the installed engine needs a session restart for configuration changes, schedule the interruption. No live WAHA configuration was changed during implementation because the production app domain was unavailable.

The route verifies SHA-512 `X-Webhook-Hmac` over the raw body and checks session/event. Supabase merges duplicate/out-of-order acknowledgements and retains events arriving before the send response is saved. Message IDs match exactly, never by guessed phone/text. `SENT` means WAHA accepted the request and returned an ID. `DELIVERED` and `READ` require device/read acknowledgements. Stored acknowledgement timestamps are server receipt times. Error acknowledgements mark failures. References: [WAHA events](https://waha.devlike.pro/docs/how-to/events/), [Vercel durations](https://vercel.com/docs/functions/configuring-functions/duration).

## Safe resume and uncertain outcomes

**Resume queue** processes existing `QUEUED`/`RUNNING` campaigns without inserting recipients or creating another campaign. The timer continues remaining batches. Cancelled/deleted campaigns are not restarted; failed/unknown rows are never automatically retried.

An authenticated operator can POST `{"campaignId":"existing-uuid"}` to `/api/queue/process`; a VPS client uses `Authorization: Bearer <QUEUE_PROCESS_SECRET>`. Body `{}` processes the oldest eligible queue globally.

Rows move `QUEUED → PROCESSING → SENT / FAILED / UNKNOWN`, or `SKIPPED` when stopped/ineligible. Send intent is persisted before HTTP dispatch. Stale preparation with no dispatch intent returns to `QUEUED`; an interrupted attempted send becomes `UNKNOWN`. Timeouts, transport errors, 5xx, rate limits and missing response IDs are uncertain. Explicit 400/401/403/404/422 rejections fail. Legacy `SENDING` older than five minutes becomes `UNKNOWN`. Campaigns with unresolved uncertain outcomes end as `NEEDS_REVIEW`.

Exactly-once delivery across Supabase and WAHA cannot be guaranteed without provider idempotency. Inspect WAHA/chat history before resolving UNKNOWN rows. If a successful send's response was lost, its webhook may be uncorrelatable without the saved ID. Leave it UNKNOWN until verified. Never bulk reset these rows or recreate a campaign as a retry. An administrator can attach a verified WAHA ID and call `apply_delivery_ack(delivery_uuid)` in SQL to project its saved acknowledgement; an intentional resend requires a separate explicit operator decision.

## Diagnostics and testing

Vercel logs use `scope=whatsapp_queue` and include batch/claim IDs, attempts, outcome and acknowledgement codes. No phone numbers, message text, bodies or credentials are logged. Send errors are stored in `last_error` with WAHA key/recipient redaction. Persistence failures leave claims for recovery instead of another send. Preflight failures keep rows queued and log the failure.

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Tests use mocked WAHA and isolated PGlite PostgreSQL: no production writes or real sends. A live smoke test with an approved test recipient is still a deployment step. Builds/tests do not migrate production, activate the VPS timer, or configure WAHA.
