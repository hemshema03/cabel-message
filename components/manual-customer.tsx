'use client';
import {useState} from 'react';
import {customer} from '@/lib/domain';

export default function ManualCustomer({busy,onCancel,onSave}:{busy:boolean;onCancel:()=>void;onSave:(values:Record<string,unknown>)=>Promise<void>}) {
 const [error,setError]=useState('');
 return <section className="card"><h2>Add customer manually</h2><form onSubmit={async event=>{
  event.preventDefault();if(busy)return;setError('');
  let values;
  try{values=customer.parse(Object.fromEntries(new FormData(event.currentTarget)));}
  catch{setError('Enter a unique STB / User ID, customer name and valid phone number.');return;}
  await onSave(values);
 }}>
 <div className="mapping-grid">{[['customer_code','STB No / User ID'],['name','User Name'],['phone','Mobile Number'],['address','Address'],['area','Area'],['notes','Notes']].map(([name,label])=><label key={name}>{label}<input name={name} required={['customer_code','name','phone'].includes(name)} type={name==='phone'?'tel':'text'} disabled={busy}/></label>)}</div>
 {error&&<p className="feedback error" role="alert">{error}</p>}
 <div className="actions"><button className="button" disabled={busy} type="submit">{busy?'Adding…':'Add to All customers'}</button><button className="button secondary" disabled={busy} type="button" onClick={onCancel}>Cancel</button></div>
 </form></section>;
}
