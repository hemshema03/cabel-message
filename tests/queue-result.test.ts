import {test} from 'node:test';
import assert from 'node:assert/strict';
import {queueResult} from '../lib/queue-result';
test('empty reminder campaigns explain exclusions rather than claiming success',()=>{const result=queueResult(2,0);assert.equal(result.recipient_count,0);assert.equal(result.skipped_count,2);assert.match(result.message,/No recipients were added/);assert.match(result.message,/another reminder/);});
test('partial campaigns report the actual recipients and skipped selections',()=>{const result=queueResult(5,2);assert.equal(result.recipient_count,2);assert.equal(result.skipped_count,3);assert.match(result.message,/2 message\(s\) queued/);});
