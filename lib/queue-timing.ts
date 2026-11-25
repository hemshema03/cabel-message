// Keep these budgets below the 60-second route duration and the 90-second DB lease.
export const QUEUE_BUDGET_MS=55_000;
export const DATABASE_TIMEOUT_MS=5_000;
export const WAHA_READ_TIMEOUT_MS=8_000;
export const WAHA_SEND_TIMEOUT_MS=30_000;
export const MIN_SEND_TIMEOUT_MS=15_000;
// finish_queue, settle_queue, release_queue each get one database timeout.
export const FINALIZE_RESERVE_MS=3*DATABASE_TIMEOUT_MS;
// Claim, load campaign, record dispatch intent each get one database timeout.
export const PREPARE_RESERVE_MS=3*DATABASE_TIMEOUT_MS;
export const canClaimBefore=(deadline:number,now=Date.now())=>deadline-now>=PREPARE_RESERVE_MS+MIN_SEND_TIMEOUT_MS+FINALIZE_RESERVE_MS;
export const sendTimeoutBefore=(deadline:number,now=Date.now())=>Math.min(WAHA_SEND_TIMEOUT_MS,deadline-now-FINALIZE_RESERVE_MS);
