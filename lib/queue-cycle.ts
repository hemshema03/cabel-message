// Browser-only orchestration. All credentials stay in the server routes.
export async function queueCycle(request:typeof fetch=fetch){
 const status=await request('/api/queue/process',{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!status.ok)throw new Error(`Queue status HTTP ${status.status}`);
 const state=await status.json();
 if(!state.pending)return false;
 const batch=await request('/api/queue/process',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(70000)});
 if(!batch.ok)throw new Error(`Queue processing HTTP ${batch.status}`);
 await batch.json();
 return true;
}
