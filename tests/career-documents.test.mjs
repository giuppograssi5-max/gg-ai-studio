import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/career-letter.mjs';
const request = body => new Request('https://local/gg-career/letter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
test('document generation requires consent, real experience and a target role',async()=>{
 assert.equal((await handler(request({document:'cv',cv:'Real experience',role:'Developer'}))).status,400);
 assert.equal((await handler(request({document:'cv',consent:true,cv:'Too short',role:'Developer'}))).status,400);
 assert.equal((await handler(request({document:'cv',consent:true,cv:'Customer support experience at a small local retailer.'}))).status,400);
 assert.equal((await handler(request({document:'unknown',consent:true}))).status,400);
});
test('long CVs are rejected rather than silently losing candidate history',async()=>{
 const response=await handler(request({document:'cv',consent:true,cv:'x'.repeat(12001),role:'Developer'}));
 assert.equal(response.status,400);assert.match((await response.json()).error,/12,000/);
});
test('cover letters still require a company',async()=>{
 const response=await handler(request({consent:true,cv:'Customer support experience at a small local retailer.',role:'Support specialist'}));
 assert.equal(response.status,400);assert.match((await response.json()).error,/Company/);
});
