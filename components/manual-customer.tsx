'use client';
import {useState} from 'react';
import {customer} from '@/lib/domain';

export default function ManualCustomer({busy,onCancel,onSave}:{busy:boolean;onCancel:()=>void;onSave:(values:Record<string,unknown>)=>Promise<void>}) {
 const [error,setError]=useState('');
 return <section className="sv-panel"><h2 className="text-lg font-semibold">Add customer manually</h2><form onSubmit={async event=>{
  event.preventDefault();if(busy)return;setError('');
  let values;
  try{values=customer.parse(Object.fromEntries(new FormData(event.currentTarget)));}
  catch{setError('Enter a unique STB / User ID, customer name and valid phone number.');return;}
  await onSave(values);
 }}>
 <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[['customer_code','STB No / User ID'],['cin','CIN'],['name','User Name'],['phone','Mobile Number'],['address','Address'],['area','Area'],['notes','Notes']].map(([name,label])=><label className="sv-label" key={name}>{label}<input className="sv-field" name={name} required={['customer_code','name','phone'].includes(name)} type={name==='phone'?'tel':'text'} disabled={busy}/></label>)}</div>
 {error&&<p className="border-l-4 border-sv-red bg-red-50 px-3 py-2 text-red-900" role="alert">{error}</p>}
 <div className="flex flex-wrap items-center gap-2"><button className="sv-button bg-sv-primary text-white" disabled={busy} type="submit">{busy?'Adding…':'Add to Announcements'}</button><button className="sv-button border-sv-border bg-white text-sv-text" disabled={busy} type="button" onClick={onCancel}>Cancel</button></div>
 </form></section>;
}
