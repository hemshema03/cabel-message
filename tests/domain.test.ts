import {test} from 'node:test';
import assert from 'node:assert/strict';
import {phone,month,bill,safeCell} from '../lib/domain';
test('normalizes phone',()=>{assert.equal(phone('9876543210'),'919876543210');assert.throws(()=>phone('123'));});
test('validates bills',()=>{assert.equal(month.safeParse('2026-13').success,false);assert.equal(bill.safeParse({bill_month:'2026-11',unpaid_amount:-1}).success,false);});
test('escapes formulas',()=>assert.equal(safeCell('=SUM(A1)'),"'=SUM(A1)"));
