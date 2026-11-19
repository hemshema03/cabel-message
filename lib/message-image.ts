import {z} from 'zod';
export const imageLimit=3*1024*1024;
export const messageImage=z.object({mimetype:z.enum(['image/jpeg','image/png']),filename:z.string().min(1).max(180),data:z.string().min(4).max(4*Math.ceil(imageLimit/3)).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)});
export type MessageImage=z.infer<typeof messageImage>;
export function resolveMessageImage(defaultImage:MessageImage|null,override:MessageImage|null|undefined){return override===undefined?defaultImage:override;}
export function validateImage(value:unknown):MessageImage{
 const image=messageImage.parse(value);const bytes=Buffer.from(image.data,'base64');
 if(bytes.length>imageLimit)throw new Error('Choose an image smaller than 3 MB.');
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if((image.mimetype==='image/png'&&!png)||(image.mimetype==='image/jpeg'&&!jpeg))throw new Error('This file is not a valid PNG or JPEG image.');
 return image;
}
export function messageRequest(session:string,phone:string,text:string,image?:MessageImage){return image?{path:'/api/sendImage',body:{session,chatId:phone+'@c.us',file:image,caption:text}}:{path:'/api/sendText',body:{session,chatId:phone+'@c.us',text}};}
