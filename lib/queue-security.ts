import {timingSafeEqual} from 'node:crypto';
export function equalSecret(actual:string,expected:string){
 const a=Buffer.from(actual),b=Buffer.from(expected);
 return b.length>0&&a.length===b.length&&timingSafeEqual(a,b);
}
