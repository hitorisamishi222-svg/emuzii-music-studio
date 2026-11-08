// Optional recorded-piano velocity boundary gain matching (development preview).
// Only supports the pinned six-sample C3/C4/C5 test preset. Never mutates source
// audio, shifts pitches, replaces expressive recordings, or certifies naturalness.
import {RECORDED_PIANO_SAMPLES} from "./recorded-piano-six-sample-map.js";

const validNumber=n=>typeof n==="number"&&Number.isFinite(n);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));

export function sampleWindowRms(sample,{startSeconds=0.04,endSeconds=0.30}={}){
  if(!sample||!Number.isInteger(sample.sampleRate)||sample.sampleRate<8000||sample.sampleRate>192000||
     !Array.isArray(sample.channels)||sample.channels.length<1||sample.channels.length>2||
     !sample.channels.every(ch=>ch instanceof Float32Array&&ch.length===sample.channels[0].length)||
     !validNumber(startSeconds)||startSeconds<0||!validNumber(endSeconds)||endSeconds<=startSeconds||endSeconds>2){
    throw Error("演奏サンプルの短時間RMS解析条件が不正です");
  }
  const from=Math.round(startSeconds*sample.sampleRate);
  const to=Math.round(endSeconds*sample.sampleRate);
  if(to>sample.channels[0].length||to<=from)throw Error("短時間RMSを測るにはサンプルの長さが足りません");
  let squares=0;
  for(const ch of sample.channels)for(let i=from;i<to;i++){
    const n=ch[i];if(!validNumber(n))throw Error("解析サンプルに非数値が含まれています");
    squares+=n*n;
  }
  const rms=Math.sqrt(squares/((to-from)*sample.channels.length));
  if(!validNumber(rms)||rms<0.00002)throw Error("解析区間の音が小さすぎるため補正できません");
  return rms;
}

export function calibrateRecordedPianoVelocity(regions,samples,{maxCorrectionDb=6}={}){
  if(!Array.isArray(regions)||regions.length!==6||!(samples instanceof Map)||
    !validNumber(maxCorrectionDb)||maxCorrectionDb<=0||maxCorrectionDb>9){
    throw Error("6音色ピアノの補正設定が不正です");
  }
  const result=regions.map(x=>({...x}));
  const report=[];
  for(let i=0;i<RECORDED_PIANO_SAMPLES.length;i+=2){
    const low=RECORDED_PIANO_SAMPLES[i],high=RECORDED_PIANO_SAMPLES[i+1];
    const lo=result[i],hi=result[i+1];
    const match=(region,src)=>(region?.sample===src.file &&
      region.rootMidi===src.rootMidi && region.loKey===src.loKey && region.hiKey===src.hiKey &&
      region.loVel===src.loVel && region.hiVel===src.hiVel &&
      validNumber(region.volumeDb) && region.volumeDb>=-60 && region.volumeDb<=0);
    if(!match(lo,low)||!match(hi,high))throw Error("補正可能な公式6音色プリセットと一致しません");
    if(!samples.has(low.file)||!samples.has(high.file))throw Error("弱音・強音のサンプルが揃っていません");
    const lowRms=sampleWindowRms(samples.get(low.file));
    const highRms=sampleWindowRms(samples.get(high.file));
    // Compare the exact adjacent 80/81 MIDI velocity boundary, including
    // the sampler's existing velocity scaling and each region's volumeDb.
    const measuredJumpDb=20*Math.log10(
      (highRms*(81/127)*Math.pow(10,hi.volumeDb/20)) /
      (lowRms*(80/127)*Math.pow(10,lo.volumeDb/20))
    );
    if(!validNumber(measuredJumpDb))throw Error("弱音・強音の境界値を計算できません");
    const requestedDb=clamp(-measuredJumpDb,-maxCorrectionDb,maxCorrectionDb);
    const adjustedVolumeDb=clamp(hi.volumeDb+requestedDb,-60,0);
    const appliedDb=adjustedVolumeDb-hi.volumeDb;
    hi.volumeDb=adjustedVolumeDb;
    const residualDb=measuredJumpDb+appliedDb;
    report.push({
      pitch:low.pitch,lowSample:low.file,highSample:high.file,
      lowRms,highRms,measuredJumpDb,appliedDb,residualDb,
      correctionLimited:Math.abs(residualDb)>0.1,
      kind:"RMS_preview_only_not_perceptual_validation"
    });
  }
  return {regions:result,report,kind:"recorded-piano-velocity-boundary-preview",sourceUnchanged:true};
}
