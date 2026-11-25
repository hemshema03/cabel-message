import {z} from 'zod';
import {queueDatabase} from '@/lib/queue-db';
import {validWebhook} from '@/lib/queue-security';
import {session} from '@/lib/waha';
import {queueLog} from '@/lib/queue';
// Cache Components requires the default Node.js runtime; explicit runtime exports are rejected.
export const maxDuration=15;
export async function POST(req:Request){
 const raw=await req.text();
 if(raw.length>1000000)return new Response(null,{status:413});
 if(!validWebhook(raw,req.headers.get('x-webhook-hmac')??'',process.env.WAHA_WEBHOOK_SECRET??''))return new Response(null,{status:401});
 try{
  const envelope=z.object({event:z.string(),session:z.string(),payload:z.unknown()}).parse(JSON.parse(raw));
  if(envelope.event!=='message.ack'||envelope.session!==session())return Response.json({ignored:true});
  const ack=z.object({id:z.string().min(1).max(512),ack:z.number().int().min(-1).max(4)}).parse(envelope.payload);
  const result=await queueDatabase().rpc('record_delivery_ack',{session_name:envelope.session,message_id:ack.id,ack_value:ack.ack});
  if(result.error){queueLog('webhook_error',{code:result.error.code});return new Response(null,{status:503});}
  queueLog('ack_received',{ack:ack.ack});return Response.json({ok:true});
 }catch{return new Response(null,{status:400});}
}
