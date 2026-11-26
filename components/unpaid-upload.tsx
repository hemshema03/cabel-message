'use client';
import toast from 'react-hot-toast';
import {useRef,useState} from 'react';
import Link from 'next/link';
import MessageAttachment from './message-attachment';
import {useMessageImage} from './use-message-image';
import {unpaidRecipient,uploadedMessage,type UnpaidPreview} from '@/lib/unpaid-upload';
import {defaultPaymentReminder} from '@/lib/message-templates';

async function post(path:string,body:unknown){
 const response=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to send. Try again.');return data;
}
export default function UnpaidUpload({ready}:{ready:boolean}){
 const [rows,setRows]=useState<UnpaidPreview[]>([]);const [selected,setSelected]=useState<number[]>([]);
 const [fileName,setFileName]=useState('');const [search,setSearch]=useState('');const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');const [done,setDone]=useState('');const [campaign,setCampaign]=useState('');
 const {image,setImage,resetImage,defaultImage,usingDefault,loading:imageLoading,error:imageError,retry:retryImage,setReading}=useMessageImage();const lock=useRef(false);
 const [template,setTemplate]=useState(defaultPaymentReminder);
 const recipients=rows.filter(row=>!row.error&&selected.includes(row.rowNumber));
 const visible=rows.filter(row=>`${row.data.name} ${row.data.phone} ${row.data.customer_code} ${row.data.cin ?? ''} ${row.data.area}`.toLowerCase().includes(search.toLowerCase()));
 return <section className="card unpaid-upload-card"><div className="section-heading"><div><h2>Upload your latest unpaid list</h2><p>Upload Excel, deselect anyone you do not want to contact, then send. Upload a fresh file whenever you need to send again.</p></div><label className="button file-button">{busy?'Please wait…':'Upload Excel'}<input aria-label="Upload unpaid Excel" type="file" accept=".xlsx" disabled={busy} onChange={async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file||lock.current)return;
  lock.current=true;setBusy(true);setError('');setRows([]);setSelected([]);setFileName('');setDone('');setCampaign('');setSearch('');resetImage();
  try{const form=new FormData();form.set('file',file);form.set('kind','UNPAID');const response=await fetch('/api/imports/preview',{method:'POST',body:form});const data=await response.json();if(!response.ok)throw new Error(data.error);setRows(data.rows);setSelected(data.rows.filter((row:UnpaidPreview)=>!row.error).map((row:UnpaidPreview)=>row.rowNumber));setFileName(file.name);toast.success('Unpaid list loaded.');}
  catch(e){setError(e instanceof Error?e.message:'Unable to read Excel.');}finally{setBusy(false);lock.current=false;}
 }}/></label></div>
 {error&&<p className="feedback error" role="alert">{error}</p>}
 {done?<div className="card"><h3>Queue result</h3><p>{done} Processing has started. Follow progress in message history.</p><Link href="/history" className="button secondary">View message history</Link><p>Upload a new Excel file above for your next send.</p></div>:fileName&&<>
 <p className="upload-summary"><b>{fileName}</b> · {rows.length} rows · {recipients.length} selected</p>
 {rows.some(row=>row.error)&&<p className="feedback warning">{rows.filter(row=>row.error).length} invalid or repeated rows cannot be selected. Correct them in Excel and upload again.</p>}
 {!rows.length&&<p>No customers found in this file.</p>}
 <fieldset disabled={busy||!!campaign} className="recipient-editor"><legend className="sr-only">Choose recipients and compose your reminder</legend>
 <div className="filter-bar"><input aria-label="Find uploaded customer" placeholder="Search name, CIN, phone, STB / User ID or area" value={search} onChange={e=>setSearch(e.target.value)}/><button type="button" className="button secondary" onClick={()=>setSelected(rows.filter(row=>!row.error).map(row=>row.rowNumber))}>Select all valid</button><button type="button" className="button secondary" onClick={()=>setSelected([])}>Deselect all</button></div>
 <div className="table-wrap recipient-list"><table><thead><tr><th>Send</th><th>Customer</th><th>CIN</th><th>Phone</th><th>Balance from Excel</th><th>Review</th></tr></thead><tbody>{visible.map(row=><tr key={row.rowNumber}><td><input type="checkbox" aria-label={`Send to ${row.data.name}`} disabled={!!row.error} checked={selected.includes(row.rowNumber)} onChange={e=>setSelected(current=>e.target.checked?[...current,row.rowNumber]:current.filter(id=>id!==row.rowNumber))}/></td><td><b>{String(row.data.name)}</b><small> {String(row.data.customer_code)}</small></td><td>{String(row.data.cin || '?')}</td><td>{String(row.data.phone)}</td><td>₹{String(row.data.unpaid_amount)}</td><td>{row.error||'Ready'}</td></tr>)}</tbody></table></div>
 <>{imageLoading&&<p role="status">Loading message image?</p>}{imageError&&<p className="feedback error" role="alert">{imageError.message} <button className="text-button" onClick={retryImage}>Try again</button></p>}<MessageAttachment image={image} onChange={setImage} onBusyChange={setReading} defaultImage={defaultImage} usingDefault={usingDefault} onUseDefault={resetImage}/></>
 <label className="message-label">Message<textarea value={template} maxLength={4000} onChange={e=>setTemplate(e.target.value)}/></label>
 <p>Use {'{{name}}'}, {'{{amount}}'} and {'{{area}}'} from this file.</p>
 {recipients[0]&&<article className="message-preview"><b>Message preview</b><p>{uploadedMessage(template,unpaidRecipient.parse(recipients[0].data))}</p></article>}
 </fieldset>
 {!ready&&<p className="feedback warning">Connect WhatsApp in Settings before sending.</p>}
 <div className="message-send-footer"><p>Only selected rows from this upload will be sent. Inactive and opted-out customers are skipped.</p>
 <button className="button" disabled={imageLoading||!!imageError||busy||!ready||!recipients.length||!template.trim()} onClick={async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  const id=campaign||crypto.randomUUID();setCampaign(id);
  try{await post('unpaid/campaigns',{id,file_name:fileName,template,image,rows:recipients.map(row=>row.data)});const result=await post(`campaigns/${id}/send`,{confirmed:true});const summary=`${result.recipient_count} message(s) queued; ${result.skipped_count} inactive or opted-out customer(s) skipped.`;setDone(summary);if(result.recipient_count>0)toast.success(summary);else toast(summary);}
  catch(e){setError(e instanceof Error?e.message:'Unable to send. Try again.');}finally{lock.current=false;setBusy(false);}
 }}>{busy?'Preparing messages…':campaign?'Retry sending selected messages':`Send to ${recipients.length} selected customers`}</button></div>
 </>}
 </section>;
}
