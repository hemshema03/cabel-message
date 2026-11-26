export const stoppedCampaign=(status:string)=>['CANCELLED','DELETED'].includes(status);
export const canStopCampaign=(status:string)=>['DRAFT','QUEUED','RUNNING'].includes(status);
export const canSendCampaign=(status:string)=>['QUEUED','RUNNING'].includes(status);
export type DeliveryResult={id:string;status:string;recipient_phone:string;rendered_message:string;last_error:string|null;sent_at:string|null;waha_message_id?:string|null;delivered_at?:string|null;read_at?:string|null;created_at:string;customers:{cin?:string;name:string;customer_code:string;area:string}|null};
export function filterDeliveries(rows:DeliveryResult[],search:string,status:string,area:string){
 const term=search.trim().toLowerCase();
 return rows.filter(row=>(!status||row.status===status)&&(!area||row.customers?.area===area)&&`${row.customers?.name??''} ${row.customers?.customer_code??''} ${row.customers?.cin??''} ${row.recipient_phone} ${row.rendered_message}`.toLowerCase().includes(term));
}
