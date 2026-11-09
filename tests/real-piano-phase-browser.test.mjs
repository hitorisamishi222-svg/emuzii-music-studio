import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {chromium} from "playwright";
import {RECORDED_PIANO_SAMPLES} from "../integration/recorded-piano-six-sample-map.js";

// The upstream CC0-1.0 license and each of the six OGGs are verified in the
// existing workflow before this test executes. No assets enter the source repo.
const dir=process.env.ASAHI_PIANO_SIX_DIR;
assert.ok(dir,"ASAHI_PIANO_SIX_DIR required");
const files=RECORDED_PIANO_SAMPLES.map(s=>{
 const buffer=fs.readFileSync(path.join(dir,s.file));
 assert.equal(crypto.createHash("sha256").update(buffer).digest("hex"),s.sha256);
 return {name:s.file,mimeType:"audio/ogg",buffer};
});
const root=process.cwd();
const server=http.createServer((req,res)=>{
 const local=path.resolve(root,"."+new URL(req.url,"http://127.0.0.1").pathname);
 if(!local.startsWith(root+path.sep)||!fs.existsSync(local)||!fs.statSync(local).isFile()){
  res.writeHead(404).end();return;
 }
 res.writeHead(200,{"Content-Type":local.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8"});
 fs.createReadStream(local).pipe(res);
});
let browser;
try{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 await page.goto("http://127.0.0.1:"+server.address().port+"/tools/local-sampler.html");
 await page.locator("#source").setInputFiles(files);
 const data=await page.evaluate(async()=>{
  const {createRecordedPianoSfz}=await import("../integration/recorded-piano-six-sample-map.js");
  const {parseMultiRegionSfz}=await import("../integration/multi-region-sampler.js");
  const {calibrateRecordedPianoVelocity}=await import("../integration/recorded-piano-velocity-calibration.js");
  const {auditRecordedPianoBandPhase}=await import("../integration/piano-band-phase-audit.js");
  const {renderRecordedPianoVelocityBlend}=await import("../integration/recorded-piano-velocity-blend.js");
  const {createPianoVelocitySweepScore,auditPianoVelocitySweep}=await import("../integration/piano-velocity-sweep-audit.js");
  const {auditPianoTimbreTimeWindows}=await import("../integration/piano-timbre-time-windows.js");
  const {createTailSafeWav}=await import("../integration/audio-tail-finisher.js");
  const ctx=new AudioContext();
  try{
   const samples=new Map();
   for(const file of document.getElementById("source").files){
    const audio=await ctx.decodeAudioData(await file.arrayBuffer());
    samples.set(file.name,{sampleRate:audio.sampleRate,
     channels:Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i))});
   }
   const regions=calibrateRecordedPianoVelocity(parseMultiRegionSfz(createRecordedPianoSfz()),samples).regions;
   const c5Source=samples.get("INSPiano_Vel01_C5_01.ogg").channels[0];
   const copy=c5Source.slice();
   const bandReport=auditRecordedPianoBandPhase(regions,samples,{pitch:"C5"});
   const focus=createPianoVelocitySweepScore(72,{
    first:64,last:65,spacingSeconds:.9,durationSeconds:.65
   });
   const raw=renderRecordedPianoVelocityBlend(focus,regions,samples,{seconds:2,levelGuard:true});
   const candidate=renderRecordedPianoVelocityBlend(focus,regions,samples,{
    seconds:2,levelGuard:true,blendCurve:"smoothstep"
   });
   const before=auditPianoTimbreTimeWindows(raw.pcm,24000,focus);
   const after=auditPianoTimbreTimeWindows(candidate.pcm,24000,focus);
   const sequence=createPianoVelocitySweepScore(72);
   const spectrumBefore=renderRecordedPianoVelocityBlend(sequence,regions,samples,{seconds:22.2,levelGuard:true});
   const spectrumAfter=renderRecordedPianoVelocityBlend(sequence,regions,samples,{
    seconds:22.2,levelGuard:true,blendCurve:"smoothstep"
   });
   const sweepBefore=auditPianoVelocitySweep(spectrumBefore.pcm,24000,sequence);
   const sweepAfter=auditPianoVelocitySweep(spectrumAfter.pcm,24000,sequence);
   const timbreBefore=auditPianoTimbreTimeWindows(spectrumBefore.pcm,24000,sequence);
   const timbreAfter=auditPianoTimbreTimeWindows(spectrumAfter.pcm,24000,sequence);
   if(!c5Source.every((v,i)=>v===copy[i]))throw Error("元録音C5が変更されました");
   const encode=pcm=>{
    const wav=createTailSafeWav([pcm],24000,{silenceSeconds:2}).wav;
    const u8=new Uint8Array(wav);
    let str="";
    for(let i=0;i<u8.length;i+=8192)
     str+=String.fromCharCode(...u8.subarray(i,Math.min(i+8192,u8.length)));
    return btoa(str);
   };
   return {
    bandReport,
    focus:{before,after,rawWav:encode(raw.pcm),candidateWav:encode(candidate.pcm)},
    sweep:{before:{regressions:sweepBefore.regressionCount,worst:sweepBefore.worstStep,
     peak:sweepBefore.peak,timbre:timbreBefore},
     after:{regressions:sweepAfter.regressionCount,worst:sweepAfter.worstStep,
     peak:sweepAfter.peak,timbre:timbreAfter},
     rawWav:encode(spectrumBefore.pcm),candidateWav:encode(spectrumAfter.pcm)},
    unchanged:true
   };
  }finally{await ctx.close()}
 });
 assert.equal(data.bandReport.windows.length,3);
 assert.deepEqual(data.bandReport.windows.map(w=>w.name),["attack","body","ending"]);
 assert.ok(data.bandReport.windows.every(w=>w.sourceSpectralDistance>=0&&w.sourceSpectralDistance<=1));
 assert.ok(data.bandReport.windows.every(w=>w.modes.length===2));
 for(const w of data.bandReport.windows){
  for(const mode of w.modes){
   assert.equal(mode.points.length,5);
   for(const p of mode.points){
    assert.ok(Number.isFinite(p.phaseInteractionDb));
    assert.ok(Number.isInteger(p.strongCancellationBands));
   }
  }
 }
 assert.equal(data.focus.before.windows.length,3);
 assert.equal(data.focus.after.windows.length,3);
 assert.ok(data.sweep.before.peak<1);
 assert.ok(data.sweep.after.peak<1);
 assert.equal(data.unchanged,true);
 const raw=Buffer.from(data.focus.rawWav,"base64");
 const candidate=Buffer.from(data.focus.candidateWav,"base64");
 const fullRaw=Buffer.from(data.sweep.rawWav,"base64");
 const fullCandidate=Buffer.from(data.sweep.candidateWav,"base64");
 for(const wav of [raw,candidate,fullRaw,fullCandidate]){
  assert.equal(wav.subarray(0,4).toString("ascii"),"RIFF");
  assert.equal(wav.readUInt32LE(24),24000);
  const seconds=wav===raw||wav===candidate?4:24.2;
  assert.equal(wav.readUInt32LE(40),Math.ceil(seconds*24000)*2);
  assert.ok(wav.subarray(44+Math.round((seconds-2)*24000)*2).every(v=>v===0));
 }
 assert.notDeepEqual(raw,candidate);
 assert.notDeepEqual(fullRaw,fullCandidate);
 // The user-facing optional mode must render from the same six local OGGs;
 // source file names alone do not certify their provenance outside this CI.
 await page.locator("#mappingPreset").selectOption("meta-piano-six");
 await page.locator("#velocityCalibration").selectOption("blend-smoothstep-guard");
 await page.locator("#permission").check();
 await page.locator("#run").click();
 await page.locator("#result").waitFor({state:"visible",timeout:90000});
 assert.match(await page.locator("#details").innerText(),/smoothstep/);
 const [uiDownload]=await Promise.all([
  page.waitForEvent("download"),page.locator("#download").click()
 ]);
 assert.match(uiDownload.suggestedFilename(),/velocity-smoothstep-guard/);
 const uiWav=fs.readFileSync(await uiDownload.path());
 assert.equal(uiWav.readUInt32LE(40),32*24000*2);
 assert.ok(uiWav.subarray(44+30*24000*2).every(x=>x===0));
 assert.deepEqual(errors,[]);
 const digest=w=>crypto.createHash("sha256").update(w).digest("hex");
 const metrics={
  pitch:"C5",sourceType:"pinned Meta Piano CC0 OGG previews",
  runs:"linear+attenuation vs smoothstep+attenuation",
  windows:data.bandReport.windows.map(w=>({
   name:w.name,seconds:w.offsetSeconds,
   sourceSpectralDistance:w.sourceSpectralDistance,
   linear:w.modes.find(x=>x.curve==="linear").points.map(p=>({
    velocity:p.velocity,phaseDb:p.phaseInteractionDb,
    cancellationBands:p.strongCancellationBands,
    worstBand:p.worstSignificantBand
   })),
   smoothstep:w.modes.find(x=>x.curve==="smoothstep").points.map(p=>({
    velocity:p.velocity,phaseDb:p.phaseInteractionDb,
    cancellationBands:p.strongCancellationBands,
    worstBand:p.worstSignificantBand
   }))
  })),
  twoNote:{
   linear:data.focus.before.windows.map(w=>({name:w.name,worst:w.worst.spectralDistance})),
   smoothstep:data.focus.after.windows.map(w=>({name:w.name,worst:w.worst.spectralDistance}))
  },
  sweep:{
   linear:{regressions:data.sweep.before.regressions,worst:data.sweep.before.worst,
    timbre:data.sweep.before.timbre.windows.map(w=>({name:w.name,worst:w.worst.spectralDistance}))},
   smoothstep:{regressions:data.sweep.after.regressions,worst:data.sweep.after.worst,
    timbre:data.sweep.after.timbre.windows.map(w=>({name:w.name,worst:w.worst.spectralDistance}))}
  },
  wavHashes:{linearFocus:digest(raw),smoothstepFocus:digest(candidate)},
  interpretation:"This is a waveform and band-power comparison, not evidence of better perceived sound or permission to deploy."
 };
 console.log("REAL_C5_PHASE_TIMBRE_A_B "+JSON.stringify({
  bandWindows:metrics.windows.map(w=>({name:w.name,sourceDistance:+w.sourceSpectralDistance.toFixed(4),
   linear65:w.linear.find(p=>p.velocity===65),
   smooth65:w.smoothstep.find(p=>p.velocity===65)})),
  twoNote:metrics.twoNote,sweep:metrics.sweep
 }));
 if(process.env.ASAHI_ARTIFACTS_DIR){
  const target=process.env.ASAHI_ARTIFACTS_DIR;
  fs.mkdirSync(target,{recursive:true});
  fs.writeFileSync(path.join(target,"C5-linear-guarded-64-65.wav"),raw);
  fs.writeFileSync(path.join(target,"C5-smoothstep-guarded-64-65.wav"),candidate);
  fs.writeFileSync(path.join(target,"C5-linear-guarded-64-96.wav"),fullRaw);
  fs.writeFileSync(path.join(target,"C5-smoothstep-guarded-64-96.wav"),fullCandidate);
  fs.writeFileSync(path.join(target,"C5-phase-and-timbre.json"),JSON.stringify(metrics,null,2)+"\n");
  fs.writeFileSync(path.join(target,"meta-piano-six-smoothstep-guard-30s.wav"),uiWav);
 }
 console.log("PASS: C5 three-window spectral and phase diagnostics, original/smoothstep listening WAV A/B, source preserved");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
