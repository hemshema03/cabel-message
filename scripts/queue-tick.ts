// Optional manual one-shot utility, using the same seven environment variables.
import {queueDatabase} from '../lib/queue-db';
import {processQueue} from '../lib/queue';
processQueue(queueDatabase()).catch(()=>{console.error('Queue batch failed; inspect queue logs');process.exitCode=1;});
