// Presence/shape check only. Never print credentials.
const required=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','WAHA_BASE_URL','WAHA_API_KEY','WAHA_SESSION','WAHA_WEBHOOK_SECRET','QUEUE_PROCESS_SECRET'];
let failed=false;
for(const name of required){const valid=!!process.env[name]&&!/YOUR_PROJECT|REPLACE_ME/.test(process.env[name]);console.log(`${name}: ${valid?'set':'MISSING or placeholder'}`);if(!valid)failed=true;}
for(const name of ['NEXT_PUBLIC_SUPABASE_URL','WAHA_BASE_URL']){
 try{const url=new URL(process.env[name]);if(!['http:','https:'].includes(url.protocol)||['localhost','127.0.0.1','::1'].includes(url.hostname))throw new Error();}
 catch{console.log(`${name}: invalid production URL`);failed=true;}
}
console.log(`WAHA endpoint matches requested server: ${process.env.WAHA_BASE_URL?.replace(/\/$/,'')==='http://178.236.185.109:3010'}`);
console.log(`WAHA session matches default: ${process.env.WAHA_SESSION==='default'}`);
process.exitCode=failed?1:0;
