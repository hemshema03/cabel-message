const aliases: Record<string,string[]> = {
 customer_code:['customer_code','STB No / User ID','CIN'],name:['name','User Name','Customer Name'],phone:['phone','Mobile Number'],area:['area','Area'],address:['address','Address'],unpaid_amount:['unpaid_amount','Balance Amount'],bill_month:['bill_month'],due_date:['due_date'],notes:['notes'],
};
export function suggestMapping(headers:string[],fields:string[]){return Object.fromEntries(fields.map(field=>[field,(aliases[field]??[field]).map(alias=>headers.find(h=>h.trim().toLowerCase()===alias.toLowerCase())).find(Boolean)??'']));}
