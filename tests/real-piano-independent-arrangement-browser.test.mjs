// MUSIC-095: real CC0 piano recordings, independent songs -> stereo WAV.
// Runs only after the existing CI verifies pinned license and six SHA256 values.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import {chromium} from "playwright";
import {RECORDED_PIANO_SAMPLES} from "../integration/recorded-piano-six-sample-map.js";
const dir=process.env.ASAHI_PIANO_SIX_DIR;
assert.ok(dir,"Pinned piano source directory required");
const files=RECORDED_PIANO_SAMPLES.map(s=>{
 const bytes=fs.readFileSync(path.join(dir,s.file));
 assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),s.sha256);
 return {name:s.file,mimeType:"audio/ogg",buffer:bytes};
});
const root=process.cwd();
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+new URL(req.url,"http://127.0.0.1").pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404).end();return;
 }
 res.writeHead(200,{"Content-Type":file.endsWith(".js")?"text/javascript":"text/html"});
 fs.createReadStream(file).pipe(res);
});
let browser;
try{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 await page.goto("http://127.0.0.1:"+server.address().port+"/tools/local-sampler.html");
 await page.locator("#source").setInputFiles(files);
 const result=await page.evaluate(async()=>{
  const {renderIndependentArrangement}=await import("../integration/independent-arrangement-renderer.js");
  const {RECORDED_PIANO_SAMPLES}=await import("../integration/recorded-piano-six-sample-map.js");
  const ctx=new AudioContext();
  try{
   const decoded=new Map();
   for(const file of document.querySelector("#source").files){
    const audio=await ctx.decodeAudioData(await file.arrayBuffer());
    decoded.set(file.name,{sampleRate:audio.sampleRate,
     channels:Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i))});
   }
   const c3=RECORDED_PIANO_SAMPLES.find(x=>x.pitch==="C3"&&x.loVel===0);
   const c4=RECORDED_PIANO_SAMPLES.find(x=>x.pitch==="C4"&&x.loVel===0);
   const parts=[
    {name:"song-A-3-4-melody",bpm:90,beatsPerBar:3,notes:[
     {beat:0,durationBeats:.5,midi:60,velocity:70},
     {beat:3,durationBeats:.5,midi:62,velocity:74}]},
    {name:"song-B-4-4-bass",bpm:140,beatsPerBar:4,notes:[
     {beat:0,durationBeats:1,midi:48,velocity:70},
     {beat:4,durationBeats:1,midi:50,velocity:74}]}
   ];
   const instruments=[c4,c3].map((x,i)=>({
    sample:decoded.get(x.file),
    region:{rootMidi:x.rootMidi,loKey:x.loKey,hiKey:x.hiKey,volumeDb:-12,
     attackSeconds:.015,releaseSeconds:.09,sample:x.file},
    gainDb:i===0?-3:-6,pan:i===0?-.6:.6
   }));
   const snapshot=instruments.map(x=>x.sample.channels[0].slice());
   const opts={targetBpm:120,targetBeatsPerBar:4,sampleRate:24000,seconds:5,headroomDb:9,harmonyAudit:true};
   const a=renderIndependentArrangement(parts,instruments,opts);
   const b=renderIndependentArrangement(parts,instruments,opts);
   const louder=renderIndependentArrangement(parts,instruments,{...opts,masterTrimDb:24});
   if(!(louder.report.peak>a.report.peak*15&&louder.report.peak<a.report.peak*16)||louder.report.overloaded)
    throw Error("Explicit 24dB gain trim must raise quiet real piano without clipping");
   if(a.wav.length!==b.wav.length||a.wav.some((v,i)=>v!==b.wav[i]))
    throw Error("Same score must produce identical WAV bytes");
   if(instruments.some((x,j)=>x.sample.channels[0].some((v,i)=>v!==snapshot[j][i])))
    throw Error("Source piano recordings were modified");
   const chunks=[];for(let i=0;i<a.wav.length;i+=8192)
    chunks.push(String.fromCharCode(...a.wav.subarray(i,i+8192)));
   const louderChunks=[];for(let i=0;i<louder.wav.length;i+=8192)
    louderChunks.push(String.fromCharCode(...louder.wav.subarray(i,i+8192)));
   return {wav:btoa(chunks.join("")),louderWav:btoa(louderChunks.join("")),louderReport:{
    peak:louder.report.peak,peakDbfs:louder.report.peakDbfs,
    quietPreview:louder.report.quietPreview,masterTrimDb:louder.report.masterTrimDb
   },report:{
    stemCount:a.report.stemCount,peak:a.report.peak,peakDbfs:a.report.peakDbfs,
    quietPreview:a.report.quietPreview,overloaded:a.report.overloaded,
    arrangement:a.report.arrangement,instruments:a.report.instruments,
    harmonyAudit:a.report.harmonyAudit,
    sourceUnchanged:a.report.sourceUnchanged
   }};
  }finally{await ctx.close()}
 });
 assert.deepEqual(errors,[]);
 assert.equal(result.report.stemCount,2);
 assert.equal(result.report.overloaded,false);
 assert.ok(result.report.peak>0&&result.report.peak<1);
 assert.equal(result.report.sourceUnchanged,true);
 assert.equal(result.report.harmonyAudit.sourceUnchanged,true);
 assert.ok(result.report.harmonyAudit.totalOverlaps>0);
 assert.ok(result.report.harmonyAudit.findings.every(x=>x.partA!==x.partB));
 assert.equal(result.report.quietPreview,true);
 assert.ok(result.report.peakDbfs< -30);
 assert.equal(result.louderReport.masterTrimDb,24);
 assert.ok(result.louderReport.peakDbfs>result.report.peakDbfs+23.99);
 assert.ok(result.louderReport.peakDbfs<result.report.peakDbfs+24.01);
 assert.deepEqual(result.report.arrangement.map(x=>x.sourceBpm),[90,140]);
 assert.deepEqual(result.report.arrangement.map(x=>x.sourceBeatsPerBar),[3,4]);
 assert.deepEqual(result.report.instruments.map(x=>x.renderedNotes),[2,2]);
 const wav=Buffer.from(result.wav,"base64");
 assert.equal(wav.subarray(0,4).toString("ascii"),"RIFF");
 assert.equal(wav.readUInt16LE(22),2);
 assert.equal(wav.readUInt32LE(24),24000);
 assert.equal(wav.readUInt32LE(40),7*24000*4);
 assert.ok(wav.subarray(44+5*24000*4).every(x=>x===0));
 let nonzero=false,stereo=false;
 for(let p=44;p<44+5*24000*4;p+=4){
  const l=wav.readInt16LE(p),r=wav.readInt16LE(p+2);
  if(l||r)nonzero=true;
  if(l!==r)stereo=true;
 }
 assert.ok(nonzero&&stereo);
 const louderWav=Buffer.from(result.louderWav,"base64");
 assert.equal(louderWav.length,wav.length);
 assert.equal(louderWav.readUInt16LE(22),2);
 assert.ok(louderWav.subarray(44+5*24000*4).every(x=>x===0));
 assert.notDeepEqual(louderWav,wav);
 const digest=crypto.createHash("sha256").update(wav).digest("hex");
 const target=process.env.ASAHI_ARTIFACTS_DIR;
 if(target){
  fs.mkdirSync(target,{recursive:true});
  fs.writeFileSync(path.join(target,"two-independent-songs-real-cc0-piano.wav"),wav);
  fs.writeFileSync(path.join(target,"two-independent-songs-real-cc0-piano-trim-plus24db.wav"),louderWav);
  fs.writeFileSync(path.join(target,"two-independent-songs-real-cc0-piano.json"),
   JSON.stringify({...result.report,louderReport:result.louderReport,wavSha256:digest,
    caution:"Real piano recordings, but musical naturalness and iPhone playback are not yet verified."},null,2)+"\n");
 }
 console.log("PASS_REAL_PIANO_TWO_SONGS "+JSON.stringify({
  sha256:digest,peak:result.report.peak,peakDbfs:result.report.peakDbfs,
  plus24dbPeak:result.louderReport.peak,plus24dbPeakDbfs:result.louderReport.peakDbfs,
  stereo,sourceUnchanged:true,
  arrangement:result.report.arrangement.map(x=>({bpm:x.sourceBpm,meter:x.sourceBeatsPerBar}))
 }));
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
