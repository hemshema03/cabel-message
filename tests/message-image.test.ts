import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateImage,messageRequest,imageLimit,resolveMessageImage} from '../lib/message-image';
const image={mimetype:'image/png',filename:'notice.png',data:Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64')};
test('validates image type, signature and size',()=>{assert.equal(validateImage(image).filename,'notice.png');assert.throws(()=>validateImage({...image,mimetype:'image/jpeg'}));assert.throws(()=>validateImage({...image,mimetype:'image/svg+xml'}));assert.throws(()=>validateImage({...image,data:'not base64!'}));assert.throws(()=>validateImage({...image,data:Buffer.alloc(imageLimit+1).toString('base64')}));});
test('image and personalized text are one sendImage request',()=>{const request=messageRequest('default','919876543210','Hi Sandy',validateImage(image));assert.equal(request.path,'/api/sendImage');assert.equal(request.body.caption,'Hi Sandy');assert.equal(request.body.file?.data,image.data);assert.equal(request.body.chatId,'919876543210@c.us');});
test('text-only campaigns keep the original sendText contract',()=>{const request=messageRequest('default','919876543210','Hi Sandy');assert.equal(request.path,'/api/sendText');assert.equal(request.body.text,'Hi Sandy');assert.equal(request.body.file,undefined);});
test('default image is used unless this message replaces or removes it',()=>{
 const saved=validateImage(image),replacement={...saved,filename:'replacement.png'};
 assert.equal(resolveMessageImage(saved,undefined),saved);
 assert.equal(resolveMessageImage(saved,replacement),replacement);
 assert.equal(resolveMessageImage(saved,null),null);
 assert.equal(resolveMessageImage(null,undefined),null);
 assert.equal(messageRequest('default','919876543210','Reminder',resolveMessageImage(saved,undefined)??undefined).path,'/api/sendImage');
 assert.equal(messageRequest('default','919876543210','Reminder',resolveMessageImage(saved,null)??undefined).path,'/api/sendText');
 assert.equal(resolveMessageImage(saved,undefined)?.filename,'notice.png');
});
