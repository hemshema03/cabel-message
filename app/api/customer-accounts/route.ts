import ExcelJS from 'exceljs';
import {z} from 'zod';
import {authorized} from '@/lib/db';
import {readAllPages} from '@/lib/area-messaging';
import {blankForm,columns,entry} from '@/lib/customer-profiles';

function failure(e:unknown){
  const message=e instanceof Error?e.message:(e as {message?:string})?.message||'Request failed';
  return Response.json({error:message},{status:message==='Unauthorized'?401:message==='Forbidden'?403:400});
}
export async function GET(){
  try{
    const db=await authorized();
    const accrued=await db.rpc('accrue_customer_bills');
    if(accrued.error)throw accrued.error;
    const accounts=await readAllPages(async offset=>{
      const r=await db.from('customers').select('id,customer_code,name,area,cin,phone,profile,monthly_rent,channel_fee,balance,is_active,opted_out').order('customer_code').range(offset,offset+99);
      if(r.error)throw r.error;
      return r.data??[];
    },100000);
    const masters=await readAllPages(async offset=>{
      const r=await db.from('customer_master').select('name,kind,amount').order('kind').order('name').range(offset,offset+99);
      if(r.error)throw r.error;
      return r.data??[];
    });
    return Response.json({accounts,masters},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return failure(e)}
}
export async function POST(req:Request){
  try{
    const db=await authorized();
    if(req.headers.get('content-type')?.includes('multipart/form-data')){
      const file=(await req.formData()).get('file');
      if(!(file instanceof File)||file.size>5000000)throw Error('Choose an Excel workbook under 5 MB.');
      const book=new ExcelJS.Workbook();
      await book.xlsx.load(await file.arrayBuffer());
      const sheet=book.worksheets[0];
      if(!sheet||sheet.rowCount>10001)throw Error('Use a workbook with up to 10,000 customer rows.');
      const headers=new Map<string,number>();
      sheet.getRow(1).eachCell((cell,index)=>headers.set(cell.text.trim().toUpperCase(),index));
      for(const [,label] of columns)if(!headers.has(label))throw Error('Missing Excel column: '+label);
      const rows:ReturnType<typeof entry>[]=[];
      sheet.eachRow((row,index)=>{
        if(index===1)return;
        const form=blankForm();
        for(const [key,label] of columns)form[key]=row.getCell(headers.get(label)!).text.trim();
        if(headers.has('CIN'))form.cin=row.getCell(headers.get('CIN')!).text.trim();
        try{rows.push(entry(form));}catch{throw Error('Check required fields and amounts on Excel row '+index);}
      });
      const result=await db.rpc('save_customer_profiles',{entries:rows});
      if(result.error)throw result.error;
      return Response.json({message:result.data+' customers added. '+(rows.length-result.data)+' existing or duplicate IDs skipped.'});
    }
    const body=await req.json();
    if(body.action==='master'){
      const item=z.object({kind:z.enum(['plan','channel','agent']),name:z.string().trim().min(1).max(200),amount:z.coerce.number().min(0).max(9999999999).multipleOf(.01)}).parse(body);
      const r=await db.from('customer_master').insert(item);
      if(r.error)throw r.error;
      return Response.json({message:item.name+' added to Masters.'});
    }else if(body.action==='save'){
      const r=await db.rpc('save_customer_profiles',{entries:[entry(body.form)],editing:body.id?z.string().uuid().parse(body.id):null});
      if(r.error)throw r.error;
      if(!r.data)throw Error('Customer ID already exists or the profile was removed.');
      return Response.json({message:body.id?'Customer details updated.':'Customer added.'});
    }else{
      const account=z.string().uuid().parse(body.id);
      const action=z.enum(['paid','delete']).parse(body.action);
      const r=action==='paid'?await db.rpc('settle_customer_balance',{account,expected:z.number().positive().parse(body.balance)}):
        await db.rpc('remove_customer_account',{account});
      if(r.error)throw r.error;
      return Response.json({message:action==='paid'?'Payment recorded.':'Customer deleted.'});
    }
  }catch(e){return failure(e)}
}

