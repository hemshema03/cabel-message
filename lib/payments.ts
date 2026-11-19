import {z} from 'zod';
import {month} from './domain';
export const bulkPayment = z.object({
 ids:z.array(z.string().uuid()).min(1).max(50).transform(ids=>[...new Set(ids)]),
 bill_month:month,
 confirmed:z.literal(true),
});
export const paymentFilter=z.enum(['unpaid','paid','all']);
