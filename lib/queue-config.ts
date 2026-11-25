export function sendDelayMs(value=process.env.SEND_DELAY_MS){
 const delay=value===undefined||value.trim()===''?5000:Number(value);
 if(!Number.isSafeInteger(delay)||delay<0||delay>60000)throw new Error('SEND_DELAY_MS must be an integer between 0 and 60000');
 return delay;
}
