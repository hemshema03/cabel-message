export class WahaError extends Error {constructor(public status:number,message:string){super(message);}}
export async function waha(path:string,body?:unknown){
 if(!process.env.WAHA_BASE_URL||!process.env.WAHA_API_KEY)throw new Error('Configure WAHA environment');
 const res=await fetch(process.env.WAHA_BASE_URL.replace(/\/$/,'')+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Api-Key':process.env.WAHA_API_KEY},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000),cache:'no-store'});
 if(!res.ok){
  const text=await res.text();let detail='';
  try{const data=JSON.parse(text);detail=String(data.message??data.error??'');}catch{detail=text;}
  // Store useful upstream errors, with credentials and recipient numbers removed.
  detail=detail.split(process.env.WAHA_API_KEY).join('[redacted]').replace(/\b\d{10,}\b/g,'[recipient]').slice(0,1000);
  throw new WahaError(res.status,`WAHA HTTP ${res.status}: ${detail}`);
 }
 return res.json();
}
export const session=()=>process.env.WAHA_SESSION??'default';
