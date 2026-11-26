'use client';
import {useEffect} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {queueCycle} from '@/lib/queue-cycle';

// Mounted only inside the authenticated layout. No server-side polling loop.
export default function QueueContinuation(){
 const cache=useQueryClient();
 useEffect(()=>{
  let stopped=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  async function tick(){
   try{
    if(await queueCycle()&&!stopped)await cache.invalidateQueries({predicate:q=>['campaigns','campaign-details'].includes(String(q.queryKey[0]))});
   }catch{
    // Retry discovery on the next tick. Never retry a specific delivery here.
   }finally{if(!stopped)timer=setTimeout(tick,5000);}
  }
  timer=setTimeout(tick,0);
  return ()=>{stopped=true;clearTimeout(timer);};
 },[cache]);
 return null;
}
