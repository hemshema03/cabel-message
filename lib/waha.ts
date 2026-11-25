import {WAHA_READ_TIMEOUT_MS,WAHA_SEND_TIMEOUT_MS} from './queue-timing';
import {responseObject,responseShape} from './waha-response';
export class WahaError extends Error {constructor(public status:number,message:string){super(message);}}
export class WahaTransportError extends Error {constructor(public code:'TIMEOUT'|'NETWORK'|'INVALID_JSON',message:string){super(message);}}
export async function waha(path:string,body?:unknown,options:{timeoutMs?:number}={}){
 const baseUrl=process.env.WAHA_BASE_URL,apiKey=process.env.WAHA_API_KEY;
 if(!baseUrl||!apiKey)throw new Error('Configure WAHA environment');
 const sending=body!==undefined;
 const timeoutMs=options.timeoutMs??(sending?WAHA_SEND_TIMEOUT_MS:WAHA_READ_TIMEOUT_MS);
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0)throw new Error('Insufficient WAHA request time budget');
 const started=Date.now();let httpStatus:number|null=null;
 // Do not log paths containing a session identifier, URL, headers or bodies.
 const operation=path==='/api/sendText'?'sendText':path==='/api/sendImage'?'sendImage':path.startsWith('/api/sessions/')?'sessionStatus':'other';
 const diagnostic=(event:string,extra:Record<string,unknown>={})=>console.info(JSON.stringify({scope:'waha',event,operation,method:sending?'POST':'GET',http_status:httpStatus,duration_ms:Date.now()-started,timeout_ms:timeoutMs,...extra}));
 try{
  const res=await fetch(baseUrl.replace(/\/$/,'')+path,{method:sending?'POST':'GET',headers:{'Content-Type':'application/json','X-Api-Key':apiKey},body:sending?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeoutMs),cache:'no-store'});
  httpStatus=res.status;
  // The abort signal covers the response body too, not just response headers.
  const text=await res.text();let parsed:unknown;
  try{parsed=text?JSON.parse(text):null;}catch{
   if(res.ok)throw new WahaTransportError('INVALID_JSON',`WAHA HTTP ${res.status} returned invalid JSON; reconcile before retry`);
  }
  diagnostic('response',responseShape(parsed));
  if(!res.ok){
   const data=responseObject(parsed);
   let detail=String(data.message??data.error??(parsed===undefined?'Non-JSON error response':''));
   detail=detail.split(apiKey).join('[redacted]').replace(/\b\d{10,}\b/g,'[recipient]').slice(0,1000);
   throw new WahaError(res.status,`WAHA HTTP ${res.status}: ${detail}`);
  }
  return responseObject(parsed);
 }catch(error){
  if(error instanceof WahaError)throw error;
  const timedOut=error instanceof Error&&['TimeoutError','AbortError'].includes(error.name);
  const code=error instanceof WahaTransportError?error.code:timedOut?'TIMEOUT':'NETWORK';
  diagnostic('request_failed',{code});
  if(error instanceof WahaTransportError)throw error;
  throw new WahaTransportError(code,timedOut?`WAHA request timed out after ${timeoutMs}ms; reconcile before retry`:'WAHA network request failed; reconcile before retry');
 }
}
export const session=()=>process.env.WAHA_SESSION??'default';
