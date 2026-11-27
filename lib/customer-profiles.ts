import {z} from 'zod';
import {phone} from './domain';

export const columns = [
  ['status','STATUS'], ['customer_code','CUSTOMER ID'], ['name','CUSTOMER NAME'],
  ['door','DOOR NO'], ['street','STREET'], ['area','AREA'], ['city','CITY'],
  ['mobile','MOBILE'], ['box','BOX TYPE'], ['vc','VC NUMBER'], ['mso','MSO NAME'],
  ['monthly_rent','MONTHLY RENT'], ['balance','OUTSTANDING AMOUNT'],
  ['agent','COLLECTION AGENT'], ['plan','MAIN PACKAGE'],
] as const;
type Field=typeof columns[number][0];
export type Master={kind:'plan'|'channel'|'agent';name:string;amount:number};
export type Street={id:string;name:string;area:string;city:string};
export type Form=Record<Field|'cin',string> & {channels:string[];street_id?:string};
export type Account={id:string;customer_code:string;name:string;phone:string;area:string;cin:string;
  is_active:boolean;opted_out:boolean;monthly_rent:number;channel_fee:number;balance:number;
  profile:Partial<Record<Field,string>> & {channels?:string[];street_id?:string}};
export function blankForm():Form {
  return {status:'Active',customer_code:'',name:'',door:'',street:'',area:'',city:'',mobile:'',
    box:'',vc:'',mso:'',monthly_rent:'',balance:'',agent:'',plan:'',channels:[],cin:''};
}
export function accountForm(row:Account):Form {
  return {...blankForm(),...row.profile,channels:row.profile.channels??[],customer_code:row.customer_code,name:row.name,
    status:row.profile.status || (row.is_active?'Active':'Inactive'),mobile:row.profile.mobile??row.phone,area:row.area??'',
    cin:row.cin??'',monthly_rent:String(row.monthly_rent),balance:String(row.balance)};
}
const amount=z.coerce.number().finite().min(-9999999999).max(9999999999).multipleOf(0.01);
const text=z.string().trim().max(1000);
export const formSchema=z.object({
  status:text.min(1),customer_code:text.min(1),name:text.min(1),door:text,street:text,area:text,city:text,mobile:text,
  box:text,vc:text,mso:text,monthly_rent:amount.nonnegative(),balance:amount,agent:text,plan:text,cin:text,
  channels:z.array(text.min(1)).max(200),street_id:z.string().uuid().optional()
});
export function entry(input:unknown){
  const {customer_code,name,area,cin,monthly_rent,balance,...profile}=formSchema.parse(input);
  let number='';
  try{number=phone(profile.mobile)}catch{/* Keep the original mobile in the profile for correction. */}
  return {customer_code,name,area,cin,monthly_rent,balance,phone:number,is_active:profile.status.toLowerCase()==='active',profile};
}

