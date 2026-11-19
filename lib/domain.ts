import { z } from 'zod';
export function phone(value: string) { let p=value.replace(/[\s()+-]/g,''); if (/^[6-9]\d{9}$/.test(p)) p='91'+p; if(!/^[1-9]\d{10,14}$/.test(p)) throw new Error('Invalid international phone number'); return p; }
export const customer=z.object({customer_code:z.string().trim().min(1),name:z.string().trim().min(1),phone:z.string().transform(phone),address:z.string().default(''),area:z.string().default(''),notes:z.string().default(''),is_active:z.boolean().default(true),opted_out:z.boolean().default(false)});
export const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const bill=z.object({bill_month:month,unpaid_amount:z.coerce.number().min(0).max(9999999999.99),due_date:z.string().date().nullable().default(null),payment_status:z.enum(['PAID','UNPAID','PARTIAL']).default('UNPAID')});
export const reminder='Hi {{name}}, your pending cable TV payment for {{month}} is ?{{amount}}. Please pay as soon as possible. Thank you.';
export function render(template:string, values:Record<string,string>) { return template.replace(/{{(\w+)}}/g,(_,key)=>values[key]??''); }
export function safeCell(value:unknown) { return typeof value==='string' && /^[=+@-]/.test(value) ? "'"+value : value; }
