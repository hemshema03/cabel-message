import {customer} from './domain';

// Customer identity is the STB/User ID, never a shared family phone number.
export function reviewCustomers(rows:Record<string,string>[], mapping:Record<string,string>, existingCodes:string[]) {
 const existing=new Set(existingCodes.map(code=>code.trim()));
 const seen=new Set<string>();
 const cinUpdates=new Map<string,{customer_code:string;cin:string}>();
 let existingCount=0, duplicateCount=0;
 const pending: {data:Record<string,unknown>;error:string;rowNumber:number}[]=[];
 rows.forEach((row,index)=>{
  const values=Object.fromEntries(Object.entries(mapping).filter(([,header])=>header&&row[header]).map(([field,header])=>[field,row[header]]));
  const code=String(values.customer_code??'').trim();
  if(code&&existing.has(code)){
   existingCount++;
   const cin=String(values.cin??'').trim();
   if(cin&&!cinUpdates.has(code))cinUpdates.set(code,{customer_code:code,cin});
   return;
  }
  if(code&&seen.has(code)){duplicateCount++;return;}
  try {
   const data=customer.parse(values);
   seen.add(data.customer_code);
   pending.push({data,error:'',rowNumber:index+2});
  } catch {
   pending.push({data:values,error:'Check STB / User ID, name and phone number.',rowNumber:index+2});
  }
 });
 return {pending,existingCount,duplicateCount,cinUpdates:[...cinUpdates.values()]};
}
