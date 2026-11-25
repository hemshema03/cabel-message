export function responseObject(value:unknown):Record<string,unknown>{
 return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
const messageId=(value:unknown)=>typeof value==='string'&&value.trim().length>0&&value.length<=512?value:null;

export function extractWahaMessageId(value:unknown):string|null{
 const response=responseObject(value);
 // Prefer WAHA's already serialized ID when provided by an engine/version.
 const explicit=messageId(response.id)??messageId(responseObject(response.id)._serialized);
 if(explicit)return explicit;
 const key=responseObject(response.key),id=messageId(key.id);
 if(!id)return null;
 // NOWEB sendText/sendImage return a Baileys message with key.id. Use the
 // engine's documented serialization when the key is complete, so message.ack
 // can match it exactly. Never infer a chat from our request or message text.
 if(typeof key.remoteJid==='string'&&key.remoteJid.length>0&&typeof key.fromMe==='boolean'){
  const jid=(value:string)=>value.replace(/@s\.whatsapp\.net$/,'@c.us');
  const parts=[String(key.fromMe),jid(key.remoteJid),id];
  if(typeof key.participant==='string'&&key.participant)parts.push(jid(key.participant));
  return messageId(parts.join('_'));
 }
 return id;
}

// A fixed vocabulary prevents a malicious/dynamic JSON property name from
// leaking a phone, message, or credential into logs. No values are included.
const fields=new Set(['id','_serialized','key','message','messageTimestamp','status','session','name','engine','_data','data','result','error','messageId','success','ack','ackName','remoteJid','fromMe','participant','pushName','broadcast','statusCode','stack','config','me','timestamp']);
export function responseShape(value:unknown){
 const object=responseObject(value);
 const safeFields=(obj:Record<string,unknown>)=>Object.keys(obj).filter(key=>fields.has(key)).sort();
 return {response_type:value===null?'null':Array.isArray(value)?'array':typeof value,response_fields:safeFields(object),key_fields:safeFields(responseObject(object.key)),id_fields:safeFields(responseObject(object.id))};
}
