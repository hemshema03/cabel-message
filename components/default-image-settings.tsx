'use client';
import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import MessageAttachment from './message-attachment';
import {useDefaultImage} from './use-message-image';
import type {MessageImage} from '@/lib/message-image';
export default function DefaultImageSettings(){
 const query=useDefaultImage();const cache=useQueryClient();const [draft,setDraft]=useState<MessageImage|null|undefined>();const [busy,setBusy]=useState(false);const [reading,setReading]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const image=draft===undefined?query.data?.image??null:draft;
 return <section id="default-message-image" className="card"><h2>Default message image</h2><p>Choose a JPG or PNG image below, then click Save default image to include it with every new message. You can change it or send without an image for an individual message.</p>{query.isPending?<p>Loading default image…</p>:query.error?<p role="alert">{query.error.message} <button className="text-button" onClick={()=>query.refetch()}>Try again</button></p>:<><fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}><MessageAttachment image={image} onChange={value=>{setDraft(value);setNotice('');}} onBusyChange={setReading}/></fieldset><button className="button" disabled={busy||reading||draft===undefined} onClick={async()=>{setBusy(true);setError('');setNotice('');try{const response=await fetch('/api/settings/default-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to save default image.');cache.setQueryData(['default-message-image'],result);setDraft(undefined);setNotice(image?'Default image saved.':'Default image removed.');}catch(e){setError(e instanceof Error?e.message:'Unable to save default image.');}finally{setBusy(false);}}}>{busy?'Saving…':'Save default image'}</button></>}{error&&<p className="feedback error" role="alert">{error}</p>}{notice&&<p className="feedback success" role="status">{notice}</p>}</section>;
}
