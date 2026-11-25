'use client';
import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import {canStopCampaign} from '@/lib/message-history';
export default function CampaignActions({id,status,title,detail=false}:{id:string;status:string;title:string;detail?:boolean}){
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
 const cache=useQueryClient();const router=useRouter();
 async function resume(){
  setBusy(true);setError('');setMessage('');
  try{const response=await fetch('/api/queue/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaignId:id})});const data=await response.json();if(!response.ok)throw new Error(data.error);setMessage(data.busy?'Queue is already processing.':`${data.processed} message(s) processed. Remaining queued messages continue through the scheduled processor.`);await cache.invalidateQueries();}
  catch(e){setError(e instanceof Error?e.message:'Unable to resume queue.');}finally{setBusy(false);}
 }
 async function act(remove:boolean){
  if(busy)return;
  if(remove&&!window.confirm(`Delete "${title}" from message history and stop its remaining queued messages? Messages already sent cannot be recalled.`))return;
  setBusy(true);setError('');setMessage('');
  try{const response=await fetch(`/api/campaigns/${id}/${remove?'delete':'cancel'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Please try again.');await cache.invalidateQueries();if(remove&&detail)router.replace('/history');else if(!remove)setMessage('Queue stopped. A message already being sent may still arrive.');}
  catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}
 }
 return <div><div className="actions">{['QUEUED','RUNNING'].includes(status)&&<button className="button secondary compact" disabled={busy} onClick={resume}>Resume queue</button>}{canStopCampaign(status)&&<button className="button secondary compact" disabled={busy} onClick={()=>act(false)}>Stop queued messages</button>}<button className="text-button" disabled={busy} onClick={()=>act(true)}>Delete history</button></div>{message&&<p role="status">{message}</p>}{error&&<p className="feedback error" role="alert">{error}</p>}</div>;
}
