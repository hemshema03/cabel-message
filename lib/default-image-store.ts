import {createClient} from '@supabase/supabase-js';
import {validateImage,type MessageImage} from './message-image';

const bucket='message-defaults';
const object='default-image.json';
function storage(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Default image storage is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}).storage;
}
export async function readDefaultImage():Promise<MessageImage|null>{
 const client=storage();const found=await client.getBucket(bucket);
 if(found.error){if(String(found.error.statusCode)==='404')return null;throw found.error;}
 const result=await client.from(bucket).download(object);
 if(result.error){if(['404','400'].includes(String(result.error.statusCode))&&/not found|does not exist/i.test(result.error.message))return null;throw result.error;}
 const value=JSON.parse(await result.data.text());return value===null?null:validateImage(value);
}
export async function saveDefaultImage(image:MessageImage|null){
 const client=storage();const found=await client.getBucket(bucket);
 if(found.error){
  if(String(found.error.statusCode)!=='404')throw found.error;
  const created=await client.createBucket(bucket,{public:false,fileSizeLimit:5*1024*1024,allowedMimeTypes:['application/json']});
  if(created.error&&!/already exists/i.test(created.error.message))throw created.error;
 }
 const saved=await client.from(bucket).upload(object,JSON.stringify(image),{contentType:'application/json',upsert:true,cacheControl:'0'});
 if(saved.error)throw saved.error;
}
