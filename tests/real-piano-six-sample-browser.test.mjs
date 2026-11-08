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
 // The user-facing preset builds the same constrained six-region SFZ internally.
 await page.locator("#mappingPreset").selectOption("meta-piano-six");
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
 // Opt-in velocity calibration must use the same verified local recordings.
 const calibrationReport=await page.evaluate(async()=>{
   const {calibrateRecordedPianoVelocity}=await import("../integration/recorded-piano-velocity-calibration.js");
   const {parseMultiRegionSfz}=await import("../integration/multi-region-sampler.js");
   const {createRecordedPianoSfz}=await import("../integration/recorded-piano-six-sample-map.js");
   const ctx=new AudioContext();
   try{
     const samples=new Map();
     for(const f of document.getElementById("source").files){
       const audio=await ctx.decodeAudioData(await f.arrayBuffer());
       samples.set(f.name,{
         sampleRate:audio.sampleRate,
         channels:Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i))
       });
     }
     return calibrateRecordedPianoVelocity(parseMultiRegionSfz(createRecordedPianoSfz()),samples).report;
   }finally{await ctx.close()}
 });
 assert.equal(calibrationReport.length,3);
 console.log("VELOCITY_BOUNDARY_RMS "+JSON.stringify(calibrationReport.map(r=>({
   pitch:r.pitch,preDb:Number(r.measuredJumpDb.toFixed(2)),
   correctionDb:Number(r.appliedDb.toFixed(2)),
   postDb:Number(r.residualDb.toFixed(2)),
   correctionLimited:r.correctionLimited
 }))));
 for(const row of calibrationReport){
   assert.ok(Number.isFinite(row.measuredJumpDb)&&Number.isFinite(row.residualDb));
   assert.ok(Math.abs(row.appliedDb)<=6.001);
   assert.ok(Math.abs(row.residualDb)<=Math.abs(row.measuredJumpDb)+0.001);
 }
 await page.locator("#velocityCalibration").selectOption("on");
 await page.locator("#run").click();
 await page.locator("#result").waitFor({state:"visible",timeout:90000});
 const correctedDetails=await page.locator("#details").innerText();
 const correctedQuality=await page.locator("#sampleQuality").innerText();
 assert.match(correctedDetails,/強弱処理音量補正のみ/);
 assert.match(correctedQuality,/80→81 強弱の境界補正/);
 assert.match(correctedQuality,/C3：補正前/);
 assert.match(correctedQuality,/C4：補正前/);
 assert.match(correctedQuality,/C5：補正前/);
 const [correctedDownload]=await Promise.all([page.waitForEvent("download"),page.locator("#download").click()]);
 const correctedWav=fs.readFileSync(await correctedDownload.path());
 assert.match(correctedDownload.suggestedFilename(),/velocity-calibrated/);
 assert.equal(correctedWav.readUInt32LE(40),32*24000*2);
 assert.ok(correctedWav.subarray(44+2*24000*30).every(x=>x===0));
 assert.notDeepEqual(correctedWav,output);
 await page.locator("#velocityCalibration").selectOption("blend");
 await page.locator("#run").click();
 await page.locator("#result").waitFor({state:"visible",timeout:90000});
 const blendDetails=await page.locator("#details").innerText();
 const blendAudit=await page.locator("#sampleQuality").innerText();
 assert.match(blendDetails,/段階的な音量ブレンド|録音2層ブレンド/);
 assert.match(blendAudit,/録音レイヤーの位相診断/);
 const [blendDownload]=await Promise.all([page.waitForEvent("download"),page.locator("#download").click()]);
 const blendWav=fs.readFileSync(await blendDownload.path());
 assert.match(blendDownload.suggestedFilename(),/velocity-blend/);
 assert.equal(blendWav.readUInt32LE(40),32*24000*2);
 assert.ok(blendWav.subarray(44+2*24000*30).every(x=>x===0));
 assert.notDeepEqual(blendWav,correctedWav);
 assert.notDeepEqual(blendWav,output);
 await page.locator("#velocityCalibration").selectOption("blend-guard");
 await page.locator("#run").click();
 await page.locator("#result").waitFor({state:"visible",timeout:90000});
 const guardAudit=await page.locator("#sampleQuality").innerText();
 assert.match(guardAudit,/音量逆戻り抑制/);
 const [guardDownload]=await Promise.all([page.waitForEvent("download"),page.locator("#download").click()]);
 const guardWav=fs.readFileSync(await guardDownload.path());
 assert.match(guardDownload.suggestedFilename(),/velocity-blend-guard/);
 assert.equal(guardWav.readUInt32LE(40),32*24000*2);
 assert.ok(guardWav.subarray(44+2*24000*30).every(x=>x===0));
 assert.notDeepEqual(guardWav,output);
 // Exercise the local A/B review page with two real recorded-piano WAV renders.
 // This is a desktop Chromium browser test; mobile hardware remains unchecked.
 const reviewPage=await browser.newPage({acceptDownloads:true});
 await reviewPage.goto("http://127.0.0.1:"+server.address().port+"/tools/piano-listening-qa.html");
 await reviewPage.locator("#fileA").setInputFiles({
   name:"recorded-piano-before.wav",mimeType:"audio/wav",buffer:blendWav
 });
 await reviewPage.locator("#fileB").setInputFiles({
   name:"recorded-piano-after.wav",mimeType:"audio/wav",buffer:guardWav
 });
 assert.equal(await reviewPage.locator("#playA").isEnabled(),true);
 await reviewPage.locator("#playA").click();
 await reviewPage.locator("#now").getByText(/現在の比較音声：A/).waitFor({state:"visible",timeout:30000});
 await reviewPage.locator("#playB").click();
 await reviewPage.locator("#now").getByText(/現在の比較音声：B/).waitFor({state:"visible",timeout:30000});
 await reviewPage.locator('input[name="dynamics"][value="better"]').check();
 await reviewPage.locator('input[name="timbre"][value="same"]').check();
 await reviewPage.locator('input[name="artifact"][value="uncertain"]').check();
 await reviewPage.locator("#memo").fill("CIのUI操作確認用。人間の耳での評価ではありません。");
 const [reviewDownload]=await Promise.all([
   reviewPage.waitForEvent("download"),reviewPage.locator("#save").click()
 ]);
 const review=JSON.parse(fs.readFileSync(await reviewDownload.path(),"utf8"));
 assert.equal(review.sourceA,"recorded-piano-before.wav");
 assert.equal(review.sourceB,"recorded-piano-after.wav");
 assert.equal(review.dynamics,"better");
 assert.equal(review.timbre,"same");
 assert.equal(review.listeningReviewOnly,true);
 await reviewPage.close();
 const boundaryMetrics=await page.evaluate(async()=>{
   const {renderMultiRegionScore,parseMultiRegionSfz}=await import("../integration/multi-region-sampler.js");
   const {calibrateRecordedPianoVelocity}=await import("../integration/recorded-piano-velocity-calibration.js");
   const {renderRecordedPianoVelocityBlend,inspectRecordedPianoBlendPhase}=await import("../integration/recorded-piano-velocity-blend.js");
   const {RECORDED_PIANO_SAMPLES,createRecordedPianoSfz}=await import("../integration/recorded-piano-six-sample-map.js");
   const ctx=new AudioContext();
   try{
     const samples=new Map();
     for(const f of document.getElementById("source").files){
       const audio=await ctx.decodeAudioData(await f.arrayBuffer());
       samples.set(f.name,{sampleRate:audio.sampleRate,
         channels:Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i))});
     }
     const regions=parseMultiRegionSfz(createRecordedPianoSfz());
     const calibrated=calibrateRecordedPianoVelocity(regions,samples).regions;
     const rms=(pcm,a,b)=>{
       let sum=0,from=Math.round(a*24000),to=Math.round(b*24000);
       for(let i=from;i<to;i++)sum+=pcm[i]*pcm[i];
       return Math.sqrt(sum/(to-from));
     };
     const results=[];
     for(let i=0;i<6;i+=2){
       const item=RECORDED_PIANO_SAMPLES[i];
       const notes=[
         {start:0,duration:.45,midi:item.rootMidi,velocity:80},
         {start:1,duration:.45,midi:item.rootMidi,velocity:81}
       ];
       const measure=(audio)=>20*Math.log10(rms(audio.pcm,1.05,1.30)/rms(audio.pcm,.05,.30));
       const a=renderMultiRegionScore(notes,regions,samples,{seconds:2});
       const b=renderMultiRegionScore(notes,calibrated,samples,{seconds:2});
       const start=performance.now();
       const x=renderRecordedPianoVelocityBlend(notes,calibrated,samples,{seconds:2});
       const ms=performance.now()-start;
       const phase=inspectRecordedPianoBlendPhase(samples.get(item.file),samples.get(RECORDED_PIANO_SAMPLES[i+1].file));
       results.push({pitch:item.pitch,rawDb:measure(a),calibratedDb:measure(b),blendDb:measure(x),
         phaseCorrelation:phase.correlation,oppositePhaseRisk:phase.oppositePhaseRisk,
         blendedNotes:x.blendedNotes,blendPeak:x.peak,blendOverloaded:x.overloaded,
         blendRenderMs:ms});
     }
     return results;
   }finally{await ctx.close()}
 });
 assert.equal(boundaryMetrics.length,3);
 for(const row of boundaryMetrics){
   assert.ok([row.rawDb,row.calibratedDb,row.blendDb,row.phaseCorrelation,row.blendRenderMs].every(Number.isFinite));
   assert.equal(row.blendedNotes,2);
   assert.equal(row.blendOverloaded,false);
   assert.ok(row.blendPeak<=1&&row.blendPeak>0);
 }
 console.log("REAL_PIANO_BLEND_BOUNDARIES "+JSON.stringify(boundaryMetrics.map(r=>({
   pitch:r.pitch,rawDb:Number(r.rawDb.toFixed(2)),gainDb:Number(r.calibratedDb.toFixed(2)),
   blendDb:Number(r.blendDb.toFixed(2)),phaseCorrelation:Number(r.phaseCorrelation.toFixed(3)),
   oppositePhaseRisk:r.oppositePhaseRisk,blendRenderMs:Number(r.blendRenderMs.toFixed(1))
 }))));
 // 33 consecutive velocities on each recorded root pitch: this catches
 // audible level dips hidden by the previously successful 80/81-only test.
 const sweeps=await page.evaluate(async()=>{
   const {createPianoVelocitySweepScore,auditPianoVelocitySweep}=
     await import("../integration/piano-velocity-sweep-audit.js");
   const {auditPianoTimbreSweep}=
     await import("../integration/piano-timbre-sweep-audit.js");
   const {auditPianoTimbreTimeWindows}=
     await import("../integration/piano-timbre-time-windows.js");
   const {renderRecordedPianoVelocityBlend}=await import("../integration/recorded-piano-velocity-blend.js");
   const {calibrateRecordedPianoVelocity}=await import("../integration/recorded-piano-velocity-calibration.js");
   const {parseMultiRegionSfz}=await import("../integration/multi-region-sampler.js");
   const {createRecordedPianoSfz}=await import("../integration/recorded-piano-six-sample-map.js");
   const {createTailSafeWav}=await import("../integration/audio-tail-finisher.js");
   const ctx=new AudioContext();
   try{
     const samples=new Map();
     for(const f of document.getElementById("source").files){
       const audio=await ctx.decodeAudioData(await f.arrayBuffer());
       samples.set(f.name,{sampleRate:audio.sampleRate,
         channels:Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i))});
     }
     const regions=calibrateRecordedPianoVelocity(parseMultiRegionSfz(createRecordedPianoSfz()),samples).regions;
     const output=[];
     for(const [pitch,midi] of [["C3",48],["C4",60],["C5",72]]){
       const score=createPianoVelocitySweepScore(midi);
       const start=performance.now();
       const rendered=renderRecordedPianoVelocityBlend(score,regions,samples,{seconds:22.2});
       const runtimeMs=performance.now()-start;
       const audit=auditPianoVelocitySweep(rendered.pcm,24000,score);
       const guarded=renderRecordedPianoVelocityBlend(score,regions,samples,{seconds:22.2,levelGuard:true});
       const guardedAudit=auditPianoVelocitySweep(guarded.pcm,24000,score);
       const timbreRaw=auditPianoTimbreSweep(rendered.pcm,24000,score);
       const timbreGuard=auditPianoTimbreSweep(guarded.pcm,24000,score);
       const timbreTimeRaw=auditPianoTimbreTimeWindows(rendered.pcm,24000,score);
       const timbreTimeGuard=auditPianoTimbreTimeWindows(guarded.pcm,24000,score);
       if(guarded.renderedNotes!==33||guarded.skippedNotes!==0||guarded.overloaded||guardedAudit.overloaded){
         throw Error("33段階の保護補正に失敗: "+pitch);
       }
       if(rendered.renderedNotes!==33||rendered.skippedNotes!==0||rendered.overloaded||audit.overloaded){
         throw Error("33段階スイープの合格条件を満たしません: "+pitch);
       }
       const wav=createTailSafeWav([rendered.pcm],24000,{silenceSeconds:2}).wav;
       const guardedWav=createTailSafeWav([guarded.pcm],24000,{silenceSeconds:2}).wav;
       // Focused 2-note clip for the C5 64->65 timbre change: shorter than
       // the 33-note sequence, suitable for the human A/B listening page.
       let focused=null;
       if(pitch==="C5"){
         const focusNotes=createPianoVelocitySweepScore(midi,{
           first:64,last:65,spacingSeconds:.9,durationSeconds:.65
         });
         const rawClip=renderRecordedPianoVelocityBlend(focusNotes,regions,samples,{seconds:2});
         const guardClip=renderRecordedPianoVelocityBlend(focusNotes,regions,samples,{seconds:2,levelGuard:true});
         if(rawClip.overloaded||guardClip.overloaded||
            rawClip.renderedNotes!==2||guardClip.renderedNotes!==2)
           throw Error("C5重点確認用の2音を書き出せません");
         focused={
           raw:createTailSafeWav([rawClip.pcm],24000,{silenceSeconds:2}).wav,
           guarded:createTailSafeWav([guardClip.pcm],24000,{silenceSeconds:2}).wav
         };
       }
       const encodeWav=wav=>{
         let result="",bytes=new Uint8Array(wav);
         for(let i=0;i<bytes.length;i+=8192)
           result+=String.fromCharCode(...bytes.subarray(i,Math.min(i+8192,bytes.length)));
         return btoa(result);
       };
       // Avoid returning large WAV arrays through Playwright's serialization.
       output.push({pitch,runtimeMs,guardReport:guarded.guardReport,
         focus:focused?{rawBase64:encodeWav(focused.raw),
           guardedBase64:encodeWav(focused.guarded),
           noteVelocities:[64,65],noteStarts:[0,.9]}:null,
         timbreRaw,timbreGuard,timbreTimeRaw,timbreTimeGuard,
         guardedAudit:{regressionCount:guardedAudit.regressionCount,
           worstStep:guardedAudit.worstStep,maxStep:guardedAudit.maxStep,
           peak:guardedAudit.peak,
           levels:guardedAudit.levels.map(x=>({velocity:x.velocity,rmsDbfs:x.rmsDbfs}))},
         report:{
         regressions:audit.regressions,
         regressionCount:audit.regressionCount,
         worstStep:audit.worstStep,maxStep:audit.maxStep,
         levels:audit.levels.map(x=>({velocity:x.velocity,rmsDbfs:x.rmsDbfs,peak:x.peak})),
         peak:audit.peak
       },guardWavBase64:(()=>{
         let result="",bytes=new Uint8Array(guardedWav);
         for(let i=0;i<bytes.length;i+=8192)
           result+=String.fromCharCode(...bytes.subarray(i,Math.min(i+8192,bytes.length)));
         return btoa(result);
       })(),wavBase64:(()=>{
         let result="",bytes=new Uint8Array(wav);
         for(let i=0;i<bytes.length;i+=8192)
           result+=String.fromCharCode(...bytes.subarray(i,Math.min(i+8192,bytes.length)));
         return btoa(result);
       })()});
     }
     return output;
   }finally{await ctx.close()}
 });
 assert.deepEqual(sweeps.map(x=>x.pitch),["C3","C4","C5"]);
 for(const s of sweeps){
   assert.equal(s.report.levels.length,33);
   if(s.pitch==="C5"){
     assert.deepEqual(s.focus.noteVelocities,[64,65]);
     const a=Buffer.from(s.focus.rawBase64,"base64");
     const b=Buffer.from(s.focus.guardedBase64,"base64");
     assert.equal(a.readUInt32LE(40),4*24000*2);
     assert.equal(b.readUInt32LE(40),4*24000*2);
     assert.ok(a.subarray(44+2*24000*2).every(x=>x===0));
     assert.ok(b.subarray(44+2*24000*2).every(x=>x===0));
     assert.notDeepEqual(a,b);
   }
   assert.equal(s.timbreRaw.analyzedNotes,33);
   assert.equal(s.timbreTimeRaw.windows.length,3);
   assert.equal(s.timbreTimeGuard.windows.length,3);
   assert.ok(s.timbreTimeRaw.windows.every(x=>x.analyzedNotes===33));
   assert.ok(Number.isFinite(s.timbreTimeRaw.largestAdjacentDistance));
   assert.ok(Number.isFinite(s.timbreTimeGuard.largestAdjacentDistance));
   assert.equal(s.timbreGuard.analyzedNotes,33);
   assert.ok(Number.isFinite(s.timbreRaw.worstAdjacentChange.spectralDistance));
   assert.ok(Number.isFinite(s.timbreGuard.worstAdjacentChange.spectralDistance));
   assert.ok(s.timbreRaw.worstAdjacentChange.spectralDistance<=1);
   assert.equal(s.timbreRaw.adjacent.length,32);
   assert.equal(s.guardedAudit.levels.length,33);
   assert.ok(s.guardedAudit.regressionCount<=s.report.regressionCount);
   assert.ok(Number.isFinite(s.report.worstStep.deltaDb));
   assert.ok(Number.isFinite(s.runtimeMs));
   const wav=Buffer.from(s.wavBase64,"base64");
   const guardedWav=Buffer.from(s.guardWavBase64,"base64");
   assert.equal(wav.readUInt32LE(24),24000);
   assert.equal(wav.readUInt32LE(40),Math.ceil(24.2*24000)*2);
   assert.equal(guardedWav.readUInt32LE(40),Math.ceil(24.2*24000)*2);
   assert.ok(wav.subarray(44+Math.ceil(22.2*24000)*2).every(x=>x===0));
   assert.ok(guardedWav.subarray(44+Math.ceil(22.2*24000)*2).every(x=>x===0));
 }
 console.log("PIANO_VELOCITY_SWEEP_64_TO_96 "+JSON.stringify(sweeps.map(s=>({
   pitch:s.pitch,regressions:s.report.regressionCount,
   guardedRegressions:s.guardedAudit.regressionCount,
   guardWorst:s.guardedAudit.worstStep,
   spectralWarnRaw:s.timbreRaw.warningCount,
   spectralWarnGuard:s.timbreGuard.warningCount,
   temporalRaw:s.timbreTimeRaw.windows.map(x=>({name:x.name,warnings:x.warningCount,
     worst:x.worst.spectralDistance,from:x.worst.from,to:x.worst.to})),
   temporalGuard:s.timbreTimeGuard.windows.map(x=>({name:x.name,warnings:x.warningCount,
     worst:x.worst.spectralDistance,from:x.worst.from,to:x.worst.to})),
   spectralWorstRaw:s.timbreRaw.worstAdjacentChange,
   spectralWorstGuard:s.timbreGuard.worstAdjacentChange,
   worst:s.report.worstStep,max:s.report.maxStep,
   runtimeMs:Number(s.runtimeMs.toFixed(1)),peak:s.report.peak
 }))));
 // The preset refuses incomplete six-file selections; no stale output may remain.
 await page.locator("#source").setInputFiles(files.slice(0,5));
 await page.locator("#run").click();
 await page.locator("#status").getByText(/ファイル名が違います/).waitFor({state:"visible",timeout:30000});
 assert.equal(await page.locator("#result").isVisible(),false);
 assert.deepEqual(errors,[]);
 const outDir=process.env.ASAHI_ARTIFACTS_DIR;
 if(outDir){
   fs.mkdirSync(outDir,{recursive:true});
   fs.writeFileSync(path.join(outDir,"meta-piano-six-recordings-guide-30s-plus-2s.wav"),output);
   fs.writeFileSync(path.join(outDir,"meta-piano-six-velocity-calibrated-guide-30s-plus-2s.wav"),correctedWav);
   fs.writeFileSync(path.join(outDir,"meta-piano-six-velocity-blend-guide-30s-plus-2s.wav"),blendWav);
   fs.writeFileSync(path.join(outDir,"meta-piano-six-velocity-blend-guard-guide-30s-plus-2s.wav"),guardWav);
   for(const row of sweeps){
     if(row.focus){
       fs.writeFileSync(path.join(outDir,"C5-64-65-timbre-focus-before.wav"),Buffer.from(row.focus.rawBase64,"base64"));
       fs.writeFileSync(path.join(outDir,"C5-64-65-timbre-focus-after.wav"),Buffer.from(row.focus.guardedBase64,"base64"));
     }
     fs.writeFileSync(path.join(outDir,"meta-piano-"+row.pitch+"-velocity-64-96-sweep.wav"),Buffer.from(row.wavBase64,"base64"));
     fs.writeFileSync(path.join(outDir,"meta-piano-"+row.pitch+"-velocity-64-96-guarded-sweep.wav"),Buffer.from(row.guardWavBase64,"base64"));
   }
   fs.writeFileSync(path.join(outDir,"velocity-64-96-timbre-audit.json"),JSON.stringify(
     sweeps.map(s=>({pitch:s.pitch,raw:s.timbreRaw,guarded:s.timbreGuard,
       timeRaw:s.timbreTimeRaw,timeGuard:s.timbreTimeGuard})),null,2)+"\n");
   fs.writeFileSync(path.join(outDir,"velocity-64-96-sweep-audit.json"),JSON.stringify(
     sweeps.map(s=>({pitch:s.pitch,runtimeMs:s.runtimeMs,raw:s.report,guarded:s.guardedAudit,guardReport:s.guardReport})),null,2)+"\n");

   fs.writeFileSync(path.join(outDir,"audit.json"),JSON.stringify({
     upstreamCommit:"251c0be57d5d1b3242b91f53e0cde62ab1cb42d9",
     sampleCount:files.length,
     files:RECORDED_PIANO_SAMPLES.map(x=>({file:x.file,sha256:x.sha256,pitch:x.pitch,velocityLayer:x.velocityLayer})),
     license:"CC0-1.0",sourceFormat:"recorded-piano-OGG-preview",
     diagnostics:audit,renderInfo:details,probeUsage:usage,outputWavBytes:output.length,
     calibrationReport,calibratedRenderInfo:correctedDetails,calibratedDiagnostics:correctedQuality,
     calibratedWavBytes:correctedWav.length,
     blendDetails,blendAudit,boundaryMetrics,blendWavBytes:blendWav.length,
     velocitySweeps:sweeps.map(s=>({pitch:s.pitch,runtimeMs:s.runtimeMs,raw:s.report,guarded:s.guardedAudit,guardReport:s.guardReport,
       timbreRaw:{warningCount:s.timbreRaw.warningCount,worst:s.timbreRaw.worstAdjacentChange},
       timbreGuard:{warningCount:s.timbreGuard.warningCount,worst:s.timbreGuard.worstAdjacentChange},
       timeRaw:s.timbreTimeRaw.windows.map(x=>({name:x.name,warningCount:x.warningCount,worst:x.worst})),
       timeGuard:s.timbreTimeGuard.windows.map(x=>({name:x.name,warningCount:x.warningCount,worst:x.worst}))})),
     limitations:"Only three recorded pitches with two velocity samples; audio not listened to by human; mobile devices/24bit WAV/SF2 unverified"
   },null,2)+"\n");
 }
 console.log("PASS: recorded piano raw/gain/linear-blend A/B WAV; 80/81 boundary metrics; phase risk and true silent 2s tails");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
