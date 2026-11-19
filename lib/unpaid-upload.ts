import {z} from 'zod';
import {customer,render} from './domain';
import {suggestMapping} from './import-mapping';

export const unpaidRecipient=customer.extend({unpaid_amount:z.coerce.number().min(0).max(9999999999.99)});
export type UnpaidRecipient=z.infer<typeof unpaidRecipient>;
export type UnpaidPreview={rowNumber:number;data:Record<string,unknown>;error:string};
export function previewUnpaid(headers:string[],rows:Record<string,string>[]):UnpaidPreview[]{
 const mapping=suggestMapping(headers,['customer_code','name','phone','area','address','unpaid_amount']);
 if(['customer_code','name','phone','unpaid_amount'].some(field=>!mapping[field]))throw new Error('Use your unpaid Excel template with Customer Name, STB No / User ID, Mobile Number and Balance Amount.');
 const seen=new Set<string>();
 return rows.map((row,index)=>{
  const values=Object.fromEntries(Object.entries(mapping).map(([field,header])=>[field,row[header]??'']));
  try{
   if(!String(values.unpaid_amount).trim())throw new Error('Missing balance');
   const data=unpaidRecipient.parse(values);
   if(seen.has(data.customer_code))return {rowNumber:index+2,data,error:'Repeated STB / User ID in this file.'};
   seen.add(data.customer_code);return {rowNumber:index+2,data,error:''};
  }catch{return {rowNumber:index+2,data:values,error:'Check name, STB / User ID, phone and balance in Excel.'};}
 });
}
export function uploadedMessage(template:string,row:UnpaidRecipient){return render(template,{name:row.name,area:row.area,amount:String(row.unpaid_amount)});}

export function uploadDelivery(campaign:string,row:UnpaidRecipient,contact:{id:string;is_active:boolean;opted_out:boolean},template:string){
 if(!contact.is_active||contact.opted_out)return null;
 return {campaign_id:campaign,customer_id:contact.id,monthly_bill_id:null,recipient_phone:row.phone,rendered_message:uploadedMessage(template,row),status:'QUEUED'};
}
