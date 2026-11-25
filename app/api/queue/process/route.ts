import {authorized} from '@/lib/db';
import {queueDatabase} from '@/lib/queue-db';
import {processQueue,queueLog} from '@/lib/queue';
import {equalSecret} from '@/lib/queue-security';
import {z} from 'zod';
import {QUEUE_BUDGET_MS} from '@/lib/queue-timing';
// Cache Components requires the default Node.js runtime; explicit runtime exports are rejected.
export const maxDuration=60;
export async function GET(){
 try{
  await authorized();
  const result=await queueDatabase().rpc('queue_pending');
  if(result.error)throw result.error;
  return Response.json({pending:result.data},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  const message=error instanceof Error?error.message:'';
  return Response.json({error:message==='Unauthorized'||message==='Forbidden'?message:'Unable to read queue status'},
   {status:message==='Unauthorized'?401:message==='Forbidden'?403:503});
 }
}
export async function POST(req:Request){
 const deadline=Date.now()+QUEUE_BUDGET_MS;
 try{
  const bearer=req.headers.get('authorization');
  if(bearer){if(!equalSecret(bearer,`Bearer ${process.env.WAHA_API_KEY??''}`)||!process.env.WAHA_API_KEY)return Response.json({error:'Unauthorized'},{status:401});}
  else await authorized();
  const input=z.object({campaignId:z.string().uuid().optional()}).parse(await req.json());
  return Response.json(await processQueue(queueDatabase(),{...input,deadline}));
 }catch(error){
  const message=error instanceof Error?error.message:'';
  if(message==='Unauthorized'||message==='Forbidden')return Response.json({error:message},{status:message==='Unauthorized'?401:403});
  if(error instanceof z.ZodError)return Response.json({error:'Invalid campaign ID or request body'},{status:400});
  queueLog('batch_error',{code:'PROCESS_FAILED'});
  return Response.json({error:'Queue processing failed. Queued rows are retained; check configuration and runtime logs.'},{status:503});
 }
}
