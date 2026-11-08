// MUSIC-086: optional, linear crossfade across recorded piano velocity layers.
// Unlike generic SFZ, this is intentionally pinned to the existing six-source
// local C3/C4/C5 fixture. Source buffers and caller notes are not modified.
import {RECORDED_PIANO_SAMPLES} from "./recorded-piano-six-sample-map.js";
import {renderSampledScore} from "./local-sample-sampler.js";
import {sampleWindowRms} from "./recorded-piano-velocity-calibration.js";

const finite=n=>typeof n==="number"&&Number.isFinite(n);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));

export function recordedPianoBlendWeights(velocity,{start=64,end=96}={}){
 if(!Number.isInteger(velocity)||velocity<0||velocity>127||
    !Number.isInteger(start)||!Number.isInteger(end)||start<1||end>126||end-start<4){
   throw Error("強弱ブレンドの音符・範囲が不正です");
 }
 const t=clamp((velocity-start)/(end-start),0,1);
 // Linear amplitude crossfade avoids the possible level bump from equal-power
 // mixing of phase-aligned same-pitch piano samples.
 return {low:1-t,high:t,blend:t>0&&t<1};
}

export function inspectRecordedPianoBlendPhase(low,high,{startSeconds=0.04,endSeconds=0.30}={}){
 if(!low||!high||!Number.isInteger(low.sampleRate)||low.sampleRate!==high.sampleRate||
    !Array.isArray(low.channels)||!Array.isArray(high.channels)||
    !low.channels.length||!high.channels.length||
    !low.channels.every(ch=>ch instanceof Float32Array)||
    !high.channels.every(ch=>ch instanceof Float32Array)||
    !finite(startSeconds)||!finite(endSeconds)||startSeconds<0||endSeconds<=startSeconds||endSeconds>1){
   throw Error("位相比較に必要なサンプル形式が不正です");
 }
 const a=low.channels[0],b=high.channels[0];
 const from=Math.round(startSeconds*low.sampleRate),to=Math.round(endSeconds*low.sampleRate);
 if(to>Math.min(a.length,b.length)||to-from<16)throw Error("位相比較区間が短すぎます");
 let a2=0,b2=0,ab=0;
 for(let i=from;i<to;i++){
   if(!finite(a[i])||!finite(b[i]))throw Error("位相比較に非数値が含まれています");
   a2+=a[i]*a[i];b2+=b[i]*b[i];ab+=a[i]*b[i];
 }
 if(a2<1e-12||b2<1e-12)throw Error("ほぼ無音の録音は位相比較できません");
 const correlation=clamp(ab/Math.sqrt(a2*b2),-1,1);
 return {correlation,oppositePhaseRisk:correlation<-.5,
   note:"同時発音の位相干渉は楽器品質を保証しません"};
}

// An attenuation-only envelope for the 64..96 velocity sequence. We do
// not boost/cross-normalize PCM, avoiding additional clipping risk. This is
// derived from the native recording's 40-300ms RMS/correlation; shifted pitches
// and perceived timbre still require listening QA.
export function planRecordedPianoLevelGuard(regions,samples,{start=64,end=96,maxAttenuationDb=6}={}){
 if(!Array.isArray(regions)||regions.length!==6||!(samples instanceof Map)||
    !finite(maxAttenuationDb)||maxAttenuationDb<=0||maxAttenuationDb>12){
   throw Error("ベロシティ曲線の補正設定が不正です");
 }
 recordedPianoBlendWeights(80,{start,end});
 const pairs=[];
 for(let i=0;i<6;i+=2){
   const low=RECORDED_PIANO_SAMPLES[i],high=RECORDED_PIANO_SAMPLES[i+1];
   const lo=regions[i],hi=regions[i+1];
   if(lo?.sample!==low.file||hi?.sample!==high.file||
      lo.rootMidi!==low.rootMidi||hi.rootMidi!==high.rootMidi||
      lo.loKey!==low.loKey||hi.hiKey!==high.hiKey||
      lo.loVel!==low.loVel||hi.hiVel!==high.hiVel||
      !finite(lo.volumeDb)||!finite(hi.volumeDb)||lo.volumeDb< -60||hi.volumeDb< -60||
      lo.volumeDb>0||hi.volumeDb>0||!samples.has(low.file)||!samples.has(high.file)){
     throw Error("補正に使う録音ピアノ6音色が正しくありません");
   }
   const inputLo=samples.get(low.file),inputHi=samples.get(high.file);
   const lowEnergy=sampleWindowRms(inputLo)*Math.pow(10,lo.volumeDb/20);
   const highEnergy=sampleWindowRms(inputHi)*Math.pow(10,hi.volumeDb/20);
   const phase=inspectRecordedPianoBlendPhase(inputLo,inputHi);
   const predicted=[];
   for(let v=start;v<=end;v++){
     const weights=recordedPianoBlendWeights(v,{start,end});
     const a=lowEnergy*weights.low,b=highEnergy*weights.high;
     const power=Math.max(0,a*a+b*b+2*a*b*phase.correlation);
     const rms=v/127*Math.sqrt(power);
     if(!finite(rms)||rms<1e-9)throw Error("位相打ち消しが強く、音量補正を安全に計算できません");
     predicted.push({velocity:v,rms});
   }
   let target=Infinity;
   const factors=new Map(),adjustments=[];
   for(let k=predicted.length-1;k>=0;k--){
     const x=predicted[k];
     target=Math.min(target,x.rms);
     const gain=target/x.rms;
     const reductionDb=-20*Math.log10(gain);
     if(!finite(reductionDb)||reductionDb>maxAttenuationDb+1e-8){
       throw Error("必要な音量補正が上限を超えています。素材・位相を確認してください");
     }
     factors.set(x.velocity,gain);
     if(reductionDb>.01)adjustments.push({velocity:x.velocity,reductionDb});
   }
   pairs.push({pitch:low.pitch,factors,maxReductionDb:adjustments.length?
     Math.max(...adjustments.map(x=>x.reductionDb)):0,
     adjustedVelocityCount:adjustments.length,phaseCorrelation:phase.correlation,
     worstPredictedStepDb:Math.min(...predicted.slice(1).map((x,k)=>20*Math.log10(x.rms/predicted[k].rms)))});
 }
 return {pairs,kind:"attenuation-only-velocity-level-guard-not-perceptual-approval",
   sourceUnchanged:true};
}

export function renderRecordedPianoVelocityBlend(notes,regions,samples,{
 sampleRate=24000,seconds=30,start=64,end=96,levelGuard=false
}={}){
 if(!Array.isArray(notes)||notes.length>2048||!Array.isArray(regions)||regions.length!==6||
    !(samples instanceof Map)||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>48000||
    !finite(seconds)||seconds<=0||seconds>60)throw Error("ブレンド演奏の引数が不正です");
 recordedPianoBlendWeights(80,{start,end}); // validate range
 if(typeof levelGuard!=="boolean")throw Error("音量カーブ補正の設定が不正です");
 const perRegion=Array.from({length:6},()=>[]);
 for(let i=0;i<6;i++){
   const reg=regions[i],src=RECORDED_PIANO_SAMPLES[i];
   if(!reg||reg.sample!==src.file||reg.rootMidi!==src.rootMidi||
      reg.loKey!==src.loKey||reg.hiKey!==src.hiKey||
      reg.loVel!==src.loVel||reg.hiVel!==src.hiVel||
      !finite(reg.volumeDb)||reg.volumeDb>0||reg.volumeDb< -60||
      !samples.has(src.file))throw Error("公式ピアノ6音色の割り当てに一致しません");
 }
 const guard=levelGuard?planRecordedPianoLevelGuard(regions,samples,{start,end}):null;
 let acceptedNotes=0,blendedNotes=0;
 for(const n of notes){
   if(!n||![n.start,n.duration,n.midi,n.velocity].every(finite)||n.start<0||n.duration<=0||
      n.start+n.duration>seconds+0.00001||!Number.isInteger(n.midi)||n.midi<0||n.midi>127||
      !Number.isInteger(n.velocity)||n.velocity<0||n.velocity>127||
      (n.gainMultiplier!==undefined&&(!finite(n.gainMultiplier)||n.gainMultiplier<0||n.gainMultiplier>1))||
      (n.tailSeconds!==undefined&&(!finite(n.tailSeconds)||n.tailSeconds<0||n.tailSeconds>2))||
      (n.attackSeconds!==undefined&&(!finite(n.attackSeconds)||n.attackSeconds<0||n.attackSeconds>10))||
      (n.releaseSeconds!==undefined&&(!finite(n.releaseSeconds)||n.releaseSeconds<0||n.releaseSeconds>10))){
     throw Error("演奏音符が不正です");
   }
   const pair=RECORDED_PIANO_SAMPLES.findIndex((src,i)=>i%2===0&&n.midi>=src.loKey&&n.midi<=src.hiKey);
   if(pair<0)continue;
   const weights=recordedPianoBlendWeights(n.velocity,{start,end});
   const existing=(n.gainMultiplier??1)*(guard?guard.pairs[pair/2].factors.get(n.velocity)??1:1);
   if(weights.low>0)perRegion[pair].push({...n,gainMultiplier:existing*weights.low});
   if(weights.high>0)perRegion[pair+1].push({...n,gainMultiplier:existing*weights.high});
   acceptedNotes++;
   if(weights.blend)blendedNotes++;
 }
 const pcm=new Float32Array(Math.ceil(seconds*sampleRate));
 const regionUsage=[];
 for(let i=0;i<6;i++){
   const region=regions[i],score=perRegion[i];
   // Override the legacy velocity split only *within this explicit blend renderer*.
   const r=renderSampledScore(score,samples.get(region.sample),{
     ...region,loVel:0,hiVel:127,sampleRate,seconds
   });
   // A non-empty region whose sample cannot produce any frame is not a valid note.
   if(score.length&&r.renderedNotes!==score.length)throw Error("録音サンプルが短すぎて再生できません");
   for(let j=0;j<pcm.length;j++)pcm[j]+=r.pcm[j];
   regionUsage.push({sample:region.sample,voices:r.renderedNotes});
 }
 let peak=0;
 for(const x of pcm)peak=Math.max(peak,Math.abs(x));
 return {pcm,sampleRate,seconds,renderedNotes:acceptedNotes,skippedNotes:notes.length-acceptedNotes,
   blendedNotes,regionUsage,peak,overloaded:peak>1,levelGuardApplied:Boolean(guard),
   guardReport:guard?guard.pairs.map(x=>({pitch:x.pitch,maxReductionDb:x.maxReductionDb,
     adjustedVelocityCount:x.adjustedVelocityCount,phaseCorrelation:x.phaseCorrelation,
     worstPredictedStepDb:x.worstPredictedStepDb})):null,
   kind:"local-recorded-piano-linear-velocity-blend",sourceUnchanged:true,
   caution:"Blending separately recorded waves may cause phase cancellation; listen before use"};
}
