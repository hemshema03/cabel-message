import {z} from 'zod';
import {month} from './domain';
export const areaAudience=z.object({area:z.string().min(1).max(200).refine(v=>v.trim().length>0),kind:z.enum(['customers','unpaid']),month:month.optional()}).refine(v=>v.kind!=='unpaid'||!!v.month,{message:'Choose a billing month for reminders.'});
export async function readAllPages<T>(read:(offset:number)=>Promise<T[]>,limit=10000):Promise<T[]>{
 const rows:T[]=[];
 for(let offset=0;;offset+=100){const page=await read(offset);rows.push(...page);if(rows.length>limit)throw new Error('This audience is too large. Please use a smaller area.');if(page.length<100)return rows;}
}
