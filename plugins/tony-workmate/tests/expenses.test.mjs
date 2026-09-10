import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkExpenses } from '../scripts/expenses.mjs';

const receipt = (props = {}) => ({ id: 'a', date: '2026-09-01', currency: 'KRW', paymentTotalMinor: 10000, ...props });
const run = (...receipts) => checkExpenses({ receipts });
test('adds confirmed receipts', () => assert.deepEqual(run(receipt(), receipt({id:'b',paymentTotalMinor:20000})).totalsMinor, { KRW:30000 }));
test('does not double count an included fee', () => assert.deepEqual(run(receipt({additionalFees:[{id:'f',amountMinor:1000,includedInPaymentTotal:true}]})).totalsMinor,{KRW:10000}));
test('adds a separately paid fee with evidence', () => assert.deepEqual(run(receipt({additionalFees:[{id:'f',amountMinor:1000,includedInPaymentTotal:false,separatePaymentEvidence:'receipt page 2'}]})).totalsMinor,{KRW:11000}));
test('a visually separate fee without inclusion evidence blocks final total', () => {
  const r=run(receipt({additionalFees:[{id:'f',amountMinor:1000,includedInPaymentTotal:null}]}));
  assert.equal(r.status,'needs_review'); assert.equal(r.totalsMinor,null); assert.equal(r.issues[0].code,'FEE_INCLUSION_UNKNOWN');
});
test('a separate fee needs a payment evidence reference',()=>assert.throws(()=>run(receipt({additionalFees:[{id:'f',amountMinor:1000,includedInPaymentTotal:false}]})),/separatePaymentEvidence/));
test('duplicate receipt IDs block final total',()=>assert.equal(run(receipt(),receipt()).totalsMinor,null));
test('two captures of the same transaction block final total',()=>assert.equal(run(receipt({evidenceId:'tx'}),receipt({id:'b',evidenceId:'tx'})).issues[0].code,'DUPLICATE_EVIDENCE'));
test('same date and price are not sufficient evidence of duplication',()=>assert.equal(run(receipt({evidenceId:'tx1'}),receipt({id:'b',evidenceId:'tx2'})).status,'ready'));
test('duplicate fee IDs block total',()=>assert.equal(run(receipt({additionalFees:[{id:'f',amountMinor:1,includedInPaymentTotal:true},{id:'f',amountMinor:1,includedInPaymentTotal:true}]})).totalsMinor,null));
test('currencies stay separate',()=>assert.deepEqual(run(receipt(),receipt({id:'b',currency:'USD',paymentTotalMinor:250})).totalsMinor,{KRW:10000,USD:250}));
test('rejects floats, negatives, strings and unsafe amounts',()=>{
  for(const paymentTotalMinor of [1.1,-1,'1000',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>run(receipt({paymentTotalMinor})),/integer/);
});
test('rejects overflow when adding receipts',()=>assert.throws(()=>run(receipt({paymentTotalMinor:Number.MAX_SAFE_INTEGER}),receipt({id:'b'})),/sum/));
test('rejects impossible dates and malformed currencies',()=>{
  assert.throws(()=>run(receipt({date:'2026-02-30'})),/date/);
  assert.throws(()=>run(receipt({currency:'krw'})),/currency/);
});
test('rejects empty and invalid input',()=>{for(const v of [null,[],{}, {receipts:[]}])assert.throws(()=>checkExpenses(v));});
const cli=fileURLToPath(new URL('../scripts/expense-check.mjs',import.meta.url));
test('CLI stdin returns JSON and success',()=>{
  const p=spawnSync(process.execPath,[cli,'-'],{input:JSON.stringify({receipts:[receipt()]}),encoding:'utf8'});
  assert.equal(p.status,0);assert.equal(JSON.parse(p.stdout).totalsMinor.KRW,10000);
});
test('CLI distinguishes review needed from malformed input',()=>{
  const p=spawnSync(process.execPath,[cli,'-'],{input:JSON.stringify({receipts:[receipt(),receipt()]}),encoding:'utf8'});
  assert.equal(p.status,2);assert.equal(JSON.parse(p.stdout).totalsMinor,null);
  const bad=spawnSync(process.execPath,[cli,'-'],{input:'{',encoding:'utf8'});
  assert.equal(bad.status,1);assert.equal(JSON.parse(bad.stderr).status,'invalid_input');
});
