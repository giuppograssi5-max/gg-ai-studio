import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { filterJobs } from '../netlify/functions/career-jobs.mjs';
const jobs = [
 {title:'Developer',company:'Studio',location:'Berlin',country:'DE',arrangement:'unknown'},
 {title:'Senior Developer',company:'Studio',location:'Italy',arrangement:'remote'},
 {title:'Developer',company:'Studio',location:'Worldwide',arrangement:'remote'},
 {title:'Developer',company:'Studio',location:'USA',arrangement:'remote'},
];
test('keyword and country exclude unrelated locations',()=>{
 assert.deepEqual(filterJobs(jobs,{q:'developer',country:'IT'}),[jobs[1],jobs[2]]);
 assert.equal(filterJobs(jobs,{q:'nurse',country:'IT'}).length,0);
});
test('city and work arrangement never silently relax filters',()=>{
 assert.deepEqual(filterJobs(jobs,{q:'developer',city:'berlin',country:'DE'}),[jobs[0]]);
 assert.equal(filterJobs(jobs,{q:'developer',country:'DE',remote:'onsite'}).length,0);
 assert.equal(filterJobs(jobs,{q:'developer',city:'Milano',country:'IT',remote:'remote'}).length,0);
});
test('invalid input and methods rejected without fetching',async()=>{
 assert.equal((await handler(new Request('https://local/gg-career/jobs'))).status,400);
 assert.equal((await handler(new Request('https://local/gg-career/jobs?q=dev',{method:'POST'}))).status,405);
});
test('source outages are reported; partial data remains usable',async()=>{
 const original=globalThis.fetch;
 try {
 globalThis.fetch=async url=>{if(url.includes('arbeitnow'))throw new Error('offline');return Response.json({jobs:[{jobTitle:'Developer',companyName:'Studio',jobGeo:'Italy',url:'https://jobicy.com/jobs/123-developer'},{jobTitle:'Developer',jobGeo:'Italy',url:'https://indeed.com/jobs/123'}]})};
 const response=await handler(new Request('https://local/gg-career/jobs?q=developer&country=IT'));
 const data=await response.json();assert.equal(data.partial,true);assert.equal(data.jobs.length,1);assert.equal(data.jobs[0].location,'Italy');
 globalThis.fetch=async()=>{throw new Error('offline')};
 const sample=await (await handler(new Request('https://local/gg-career/jobs?q=dev'))).json();
 assert.equal(sample.demo,true);assert.equal(sample.total,0);assert.equal(sample.jobs[0].isDemo,true);assert.equal(sample.jobs[0].url,undefined);
 }finally{globalThis.fetch=original}
});

test('worldwide provider queries country, location and page and rejects mismatched geography',async()=>{
 const { searchWorldwide }=await import('../netlify/functions/career-jobs.mjs');
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async url=>{
   assert.equal(url.hostname,'jsearch.p.rapidapi.com');
   assert.equal(url.searchParams.get('country'),'jp');
   assert.equal(url.searchParams.get('page'),'2');
   assert.match(url.searchParams.get('query'),/Tokyo, Japan/);
   return Response.json({status:'OK',data:[
    {job_title:'Developer',employer_name:'Studio',job_city:'Tokyo',job_country:'JP',job_is_remote:false,job_apply_link:'https://example.org/apply',job_description:'Build software'},
    {job_title:'Developer',job_city:'Tokyo',job_country:'US',job_apply_link:'https://example.org/wrong-country'},
    {job_title:'Developer',job_city:'Osaka',job_country:'JP',job_apply_link:'https://example.org/wrong-city'},
    {job_title:'Developer',job_city:'Tokyo',job_country:'JP',job_apply_link:'javascript:alert(1)'},
   ]});
  };
  const response=await searchWorldwide({q:'developer',city:'Tokyo',country:'JP',remote:'any',page:2});
  const data=await response.json();assert.equal(data.jobs.length,1);assert.equal(data.jobs[0].description,'Build software');assert.equal(data.limited,false);assert.equal(data.hasMore,true);
 }finally{globalThis.fetch=original}
});
test('worldwide provider enforces work arrangement and handles quota errors',async()=>{
 const { searchWorldwide }=await import('../netlify/functions/career-jobs.mjs');
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({status:'OK',data:[{job_title:'Developer',job_country:'BR',job_is_remote:true,job_apply_link:'https://example.org/apply'}]});
  const data=await (await searchWorldwide({q:'developer',city:'',country:'BR',remote:'onsite',page:1})).json();assert.equal(data.jobs.length,0);
  globalThis.fetch=async()=>new Response('',{status:429});
  assert.equal((await searchWorldwide({q:'dev',city:'',country:'BR',remote:'any',page:1})).status,429);
 }finally{globalThis.fetch=original}
});
test('invalid pagination rejected before source fetches',async()=>{
 assert.equal((await handler(new Request('https://local/gg-career/jobs?q=developer&country=JP&page=0'))).status,400);
 assert.equal((await handler(new Request('https://local/gg-career/jobs?q=developer&country=JP&page=21'))).status,400);
});

test('missing worldwide connection supplies labelled sample only when live feeds have no matches',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async url=>Response.json(url.includes('arbeitnow')?{data:[]}:{jobs:[]});
  const data=await (await handler(new Request('https://local/gg-career/jobs?q=nurse&country=JP&city=Tokyo&remote=onsite'))).json();
  assert.equal(data.demo,true);assert.equal(data.total,0);assert.equal(data.jobs[0].location,'Tokyo, Japan');assert.equal(data.jobs[0].arrangement,'onsite');assert.match(data.jobs[0].source,/DEMONSTRATION/);assert.equal(data.hasMore,false);
 }finally{globalThis.fetch=original}
});
