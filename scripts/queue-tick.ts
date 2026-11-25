// Run once per systemd timer tick on the existing VPS. Never send directly to WAHA.
async function tick(){
 const url=process.env.APP_BASE_URL,secret=process.env.QUEUE_PROCESS_SECRET;
 if(!url||!secret)throw new Error('APP_BASE_URL and QUEUE_PROCESS_SECRET are required');
 const response=await fetch(new URL('/api/queue/process',url),{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(65000)});
 if(!response.ok)throw new Error(`Queue endpoint HTTP ${response.status}`);
 const result=await response.json();console.info(JSON.stringify({event:'queue_tick',processed:result.processed,busy:result.busy}));
}
tick().catch(()=>{console.error('Queue tick failed; next timer invocation will recover');process.exitCode=1;});
