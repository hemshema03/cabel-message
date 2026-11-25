# Vercel deployment and queue recovery

## Root cause

The original Send handler inserted queue rows, while only a separate infinite-loop script consumed them. Vercel did not launch that process. The first fix added bounded processing but still depended on a VPS timer for continuation and ignored `SEND_DELAY_MS`. That dependency is now removed.

## Environment

Set only these variables in Vercel Production, and in `.env.local` for local development:

```dotenv
WAHA_BASE_URL=http://178.236.185.109:3010
WAHA_API_KEY=YOUR_EXISTING_WAHA_KEY
WAHA_SESSION=default
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SEND_DELAY_MS=5000
```

No other environment variables are required. Keep privileged keys server-only. `SEND_DELAY_MS` is a whole number from 0 to 60000 milliseconds (default 5000 if absent); it controls minimum spacing between sends across invocations, not an exact delivery schedule. Database claims enforce this spacing even with multiple tabs. Empty/invalid production configuration is checked by `node --env-file=.env.local scripts/check-queue-env.mjs`, which never prints secrets.

## Deploy

1. Stop any old standalone worker or previously installed `cable-queue.timer` before migration. The app no longer needs either. Do not reset interrupted deliveries.
2. Apply unapplied migrations in order: `0002_serverless_queue.sql`, then `0003_queue_continuation.sql`. If 0002 was already applied, apply only 0003. Never rerun 0001 against an existing database. The migrations retain customer data, campaigns and delivery history.
3. Set the seven variables in Vercel Production and redeploy with `npm run build`. Use separate test credentials/database for Preview so opening a preview cannot consume the production queue.
4. Check Vercel's deployed Send and queue function limits are 60 seconds. This Next.js version with Cache Components uses Node.js by default and rejects explicit runtime exports; the code follows its installed documentation.
5. When ready to send, log into the production app. Opening any authenticated panel automatically resumes active queued campaigns. Send immediately starts processing after committing queue rows. No additional service setup is needed.

Production environment values, migrations and deployment must still be applied in your account. Local source/build verification does not deploy or send customer messages.

## Processing and continuation

Send uses one awaited Next.js `after()` callback bounded by its function deadline. Subsequent requests are driven by an invisible component in the authenticated layout: discover pending rows, await one POST batch, refresh TanStack Query data, then check again five seconds later. No server-side infinite loop, `setInterval`, detached send promise or recursive self-request is used. UI appearance and existing features are preserved.

Each invocation claims at most five messages sequentially and reserves time for network calls and status writes. Supabase calls have five-second timeouts. WAHA reads use eight seconds; sends normally use thirty seconds (matching the supplied successful PowerShell command), capped to the remaining invocation budget. The queue deadline is 55 seconds from request entry within the unchanged 60-second function limit. Each send reserves fifteen seconds for finishing the row, settling campaigns and releasing the lease. A claim starts only with enough time for preparation, a minimum fifteen-second send window and final writes. Calls deferred for insufficient time leave queued rows for the next browser-driven batch. A global 90-second lease and atomic row claims prevent concurrent sends. `SEND_DELAY_MS` persists the next eligible send time in Supabase; long delays end the current batch rather than extending a function indefinitely.

**Keep the app open for continuous processing.** Vercel cannot guarantee indefinite work after all tabs close without a scheduler. The current bounded callback may finish, remaining rows stay queued, and logging back in automatically resumes them. Background-tab throttling can slow continuation. This is safe resumability, not a promise of unattended processing with every client closed.

The existing **Resume queue** button also processes a batch without recreating a campaign. Cancelled/deleted campaigns are not restarted. Authentication uses the existing Supabase operator session; no key is sent to browser code. An optional trusted machine request can authenticate with `Authorization: Bearer <WAHA_API_KEY>`, using that existing key. `GET /api/queue/process` only checks pending work; `POST` sends and must not be used as a health check.

## Outcomes and duplicate prevention

Successful WAHA responses save `SENT`, the message ID and `sent_at` immediately. NOWEB returns `key.id` in a Baileys message, as confirmed by the supplied PowerShell response. Complete keys are serialized using WAHA's own `fromMe_chatId_id[_participant]` convention, converting `@s.whatsapp.net` to `@c.us`, so `message.ack` IDs match. This uses returned key fields, never guesses from our request. Incomplete keys retain their raw `key.id`; existing string `id` and WEBJS `id._serialized` responses are also supported. Definite rejections save `FAILED` and the actual redacted error. Transport timeouts, 5xx and missing IDs are `UNKNOWN`, since WAHA may have already accepted the send. They are never blindly retried. Eligibility, payment and campaign stop state are rechecked before dispatch.

Interrupted preparation with no send intent is safely requeued after the lease expires. Interrupted attempted sends are held as `UNKNOWN`. Legacy stale `SENDING` is also held for review. Campaigns with uncertainty end as `NEEDS_REVIEW`. Review WAHA history before any intentional resend; do not bulk reset unknown rows. Exactly-once delivery across independent systems is not guaranteed without WAHA idempotency support.

Structured runtime logs contain batch/claim identifiers, counters and error codes, never recipient text or credentials. WAHA diagnostics add HTTP status, elapsed milliseconds, timeout budget, operation (sendText/sendImage/sessionStatus), and allowlisted response field names including `key` subfields. No response values, message IDs, URLs, headers or bodies are logged. Send errors are saved to `last_error`; preflight failures keep queued work and record diagnostics.

## Optional delivery confirmation

Sending and queue completion do not depend on webhooks. Without them, messages remain SENT after WAHA accepts them. For actual DELIVERED/READ confirmation, preserve the existing WAHA `default` session configuration and add a webhook:

```json
{
  "url": "https://YOUR_PRODUCTION_DOMAIN/api/waha/webhook",
  "events": ["message.ack"],
  "customHeaders": [{"name": "X-Api-Key", "value": "YOUR_EXISTING_WAHA_API_KEY"}],
  "retries": {"policy": "constant", "delaySeconds": 2, "attempts": 15}
}
```

Use HTTPS for this webhook. The handler authenticates the existing API key, filters session/event, and merges duplicate/out-of-order acknowledgements by exact message ID. It retains acknowledgements arriving before the send response is saved. No separate webhook secret is used. No live WAHA configuration changes are made by this repository.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Tests cover bounded mocked sends, API authentication, status writes, uncertainties, browser continuation, configured pacing and SQL recovery in an isolated PostgreSQL database. No real customer sends are part of verification.

## NOWEB request comparison and verification

The supplied successful PowerShell request uses POST `/api/sendText`, JSON `{session, chatId, text}`, and the `X-Api-Key` header with a 30-second timeout. The text-only application request matches those fields and endpoint. An explicitly selected or saved default image switches the application to POST `/api/sendImage` with `{session, chatId, file, caption}`; that is a different operation from the text-only PowerShell test. Both paths now parse NOWEB message keys.

No additional SQL migration is needed for the NOWEB parsing/timeout fix when the queue RPCs are already installed. Redeploy the application. Existing UNKNOWN rows remain held for manual reconciliation: the new parser cannot reconstruct a response that was previously discarded, and these rows must not be requeued automatically.

References checked: [WAHA NOWEB send implementation](https://github.com/devlikeapro/waha/blob/core/src/core/engines/noweb/session.noweb.core.ts), [WAHA message ID serialization](https://github.com/devlikeapro/waha/blob/core/src/core/engines/noweb/utils.ts), [Vercel duration configuration](https://vercel.com/docs/functions/configuring-functions/duration). The actual response shape was confirmed from the user's supplied PowerShell output; tests use synthetic replacements only.
