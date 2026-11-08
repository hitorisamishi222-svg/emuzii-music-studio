import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {chromium} from "playwright";
import {RECORDED_PIANO_SAMPLES,createRecordedPianoSfz} from "../integration/recorded-piano-six-sample-map.js";

// Test assets come from a pinned official source verified by CI; never commit them
// as part of application runtime or imply automatic license validation for uploads.
const dir=process.env.ASAHI_PIANO_SIX_DIR;
assert.ok(dir,"ASAHI_PIANO_SIX_DIR must point to verified recorded samples");
const files=RECORDED_PIANO_SAMPLES.map(s=>{
 const bytes=fs.readFileSync(path.join(dir,s.file));
 assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),s.sha256,s.file);
 assert.equal(bytes.subarray(0,4).toString("ascii"),"OggS",s.file);
 return {name:s.file,mimeType:"audio/ogg",buffer:bytes};
});
const root=process.cwd();
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,"."+new URL(req.url,"http://127.0.0.1").pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404).end();return;
 }
 res.writeHead(200,{"Content-Type":file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8"});
 fs.createReadStream(file).pipe(res);
});
let browser;
try{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 await page.goto("http://127.0.0.1:"+server.address().port+"/tools/local-sampler.html");
 await page.locator("#source").setInputFiles(files);
 await page.locator("#sfz").setInputFiles({
  name:"meta-piano-6-regions.sfz",mimeType:"text/plain",buffer:Buffer.from(createRecordedPianoSfz())
 });
 await page.locator("#permission").check();
 await page.locator("#run").click();
 await page.locator("#result").waitFor({state:"visible",timeout:90000});
 const details=await page.locator("#details").innerText();
 const audit=await page.locator("#sampleQuality").innerText();
 assert.match(details,/30秒のガイド/);
 assert.match(details,/使用音色6個/);
 assert.match(details,/演奏音符30個・音域外0個/);
 for(const s of RECORDED_PIANO_SAMPLES)assert.ok(audit.includes(s.file),s.file+" missing from audio diagnostics");
 const [download]=await Promise.all([page.waitForEvent("download"),page.locator("#download").click()]);
 const output=fs.readFileSync(await download.path());
 assert.equal(output.subarray(0,4).toString("ascii"),"RIFF");
 assert.equal(output.readUInt32LE(24),24000);
 assert.equal(output.readUInt32LE(40),32*24000*2);
 assert.ok(output.subarray(44,44+2*24000*3).some(x=>x!==0));
 assert.ok(output.subarray(44+2*24000*30).every(x=>x===0));
 // Probe all six source zones at their original root pitches in Chromium.
 const usage=await page.evaluate(async()=>{
   const {renderMultiRegionScore,parseMultiRegionSfz}=await import("../integration/multi-region-sampler.js");
   const {RECORDED_PIANO_SAMPLES,createRecordedPianoSfz}=await import("../integration/recorded-piano-six-sample-map.js");
   const ctx=new AudioContext();
   try{
     const samples=new Map();
     for(const f of document.getElementById("source").files){
       const audio=await ctx.decodeAudioData(await f.arrayBuffer());
       samples.set(f.name,{sampleRate:audio.sampleRate,
         channels:Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i))});
     }
     const notes=RECORDED_PIANO_SAMPLES.map((s,i)=>({
       start:i*2,duration:0.75,midi:s.rootMidi,velocity:s.loVel===0?46:105
     }));
     const r=renderMultiRegionScore(notes,parseMultiRegionSfz(createRecordedPianoSfz()),samples,{seconds:14,sampleRate:24000});
     return {renderedNotes:r.renderedNotes,skippedNotes:r.skippedNotes,
       regionUsage:r.regionUsage,peak:r.peak,overloaded:r.overloaded};
   }finally{await ctx.close()}
 });
 assert.equal(usage.renderedNotes,6);
 assert.equal(usage.skippedNotes,0);
 assert.deepEqual(usage.regionUsage.map(x=>x.renderedNotes),[1,1,1,1,1,1]);
 assert.ok(usage.peak>0&&usage.peak<=1);
 assert.equal(usage.overloaded,false);
 assert.deepEqual(errors,[]);
 const outDir=process.env.ASAHI_ARTIFACTS_DIR;
 if(outDir){
   fs.mkdirSync(outDir,{recursive:true});
   fs.writeFileSync(path.join(outDir,"meta-piano-six-recordings-guide-30s-plus-2s.wav"),output);
   fs.writeFileSync(path.join(outDir,"audit.json"),JSON.stringify({
     upstreamCommit:"251c0be57d5d1b3242b91f53e0cde62ab1cb42d9",
     sampleCount:files.length,
     files:RECORDED_PIANO_SAMPLES.map(x=>({file:x.file,sha256:x.sha256,pitch:x.pitch,velocityLayer:x.velocityLayer})),
     license:"CC0-1.0",sourceFormat:"recorded-piano-OGG-preview",
     diagnostics:audit,renderInfo:details,probeUsage:usage,outputWavBytes:output.length,
     limitations:"Only three recorded pitches with two velocity samples; audio not listened to by human; mobile devices/24bit WAV/SF2 unverified"
   },null,2)+"\n");
 }
 console.log("PASS: real recorded C3/C4/C5 x 2 velocities decoded, every region exercised, 30s guide WAV plus 2s silence");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
