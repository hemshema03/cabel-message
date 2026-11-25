import {createHmac,timingSafeEqual} from 'node:crypto';
export function equalSecret(actual:string,expected:string){
 const a=Buffer.from(actual),b=Buffer.from(expected);
 return b.length>0&&a.length===b.length&&timingSafeEqual(a,b);
}
export function validWebhook(raw:string,signature:string,secret:string){
 return !!secret&&/^[a-f0-9]{128}$/i.test(signature)&&equalSecret(signature.toLowerCase(),createHmac('sha512',secret).update(raw).digest('hex'));
}
