// MUSIC-091: bounded frequency-band phase/cancellation diagnostic for
// Meta Piano's original C3/C4/C5 recordings. Does not align, rewrite or
// synthesize audio. The signal proxy is not a perceptual pass/fail result.
import {RECORDED_PIANO_SAMPLES} from "./recorded-piano-six-sample-map.js";
import {recordedPianoBlendWeights} from "./recorded-piano-velocity-blend.js";

const N=1024;
const EDGES=Object.freeze([60,200,500,1000,2000,4000,9000]);
const WINDOWS=Object.freeze([
  Object.freeze({name:"attack",seconds:0.025}),
  Object.freeze({name:"body",seconds:0.130}),
  Object.freeze({name:"ending",seconds:0.320})
]);
const finite=x=>typeof x==="number"&&Number.isFinite(x);

function spectrum(sample,offsetSeconds){
 const sr=sample?.sampleRate;
 if(!Number.isInteger(sr)||sr<24000||sr>96000||
    !Array.isArray(sample.channels)||sample.channels.length<1||sample.channels.length>2||
    !sample.channels.every(ch=>ch instanceof Float32Array&&ch.length===sample.channels[0].length))
   throw Error("帯域診断のPCM形式が不正です");
 const start=Math.round(offsetSeconds*sr);
 if(start<0||start+N>sample.channels[0].length)
   throw Error("帯域診断の窓が録音の長さを超えました");
 const re=new Float64Array(N),im=new Float64Array(N);
 for(let k=0;k<N;k++){
  let x=0;for(const ch of sample.channels)x+=ch[start+k];
  x/=sample.channels.length;
  if(!finite(x))throw Error("録音に非数値のPCMがあります");
  re[k]=x*(.5-.5*Math.cos(2*Math.PI*k/(N-1)));
 }
 for(let i=1,j=0;i<N;i++){
  let bit=N>>1;for(;j&bit;bit>>=1)j^=bit;
  j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;}
 }
 for(let size=2;size<=N;size*=2){
  const half=size>>1;
  for(let pos=0;pos<N;pos+=size)for(let k=0;k<half;k++){
   const angle=-2*Math.PI*k/size,c=Math.cos(angle),s=Math.sin(angle),b=pos+k+half,a=pos+k;
   const rr=c*re[b]-s*im[b],ii=s*re[b]+c*im[b];
   re[b]=re[a]-rr;im[b]=im[a]-ii;re[a]+=rr;im[a]+=ii;
  }
 }
 return {re,im,sr};
}

function bandAudit(low,high,lowWeight,highWeight,{minBandFraction=.01}={}){
 const out=[],total={expected:0,mixed:0};
 for(let b=0;b<EDGES.length-1;b++){
  const start=EDGES[b],end=EDGES[b+1];
  let expected=0,mixed=0,lowPower=0,highPower=0;
  for(let k=1;k<N/2;k++){
   const hz=k*low.sr/N;
   if(hz<start||hz>=end)continue;
   const a=low.re[k]*lowWeight,ai=low.im[k]*lowWeight;
   const z=high.re[k]*highWeight,zi=high.im[k]*highWeight;
   const e=a*a+ai*ai,w=z*z+zi*zi;
   lowPower+=e;highPower+=w;expected+=e+w;
   mixed+=(a+z)*(a+z)+(ai+zi)*(ai+zi);
  }
  total.expected+=expected;total.mixed+=mixed;
  out.push({bandHz:[start,end],expected,mixed,lowPower,highPower});
 }
 if(total.expected<1e-14)throw Error("実録音の帯域パワーが小さすぎます");
 const bands=out.map(x=>{
  const significant=x.expected>=total.expected*minBandFraction;
  const db=10*Math.log10(Math.max(x.mixed,1e-18)/Math.max(x.expected,1e-18));
  return {bandHz:x.bandHz,contribution:x.expected/total.expected,
   phaseInteractionDb:db,
   significant,dualLayer:x.lowPower>1e-10&&x.highPower>1e-10};
 });
 const warnings=bands.filter(x=>x.significant&&x.dualLayer&&x.phaseInteractionDb<=-3);
 return {
  globalPhaseInteractionDb:10*Math.log10(Math.max(total.mixed,1e-18)/total.expected),
  significantBandDrops:warnings,
  significantDropCount:warnings.length,
  worstSignificantBand:bands.filter(x=>x.significant).reduce((a,b)=>a.phaseInteractionDb<b.phaseInteractionDb?a:b),
  bands
 };
}
function spectralShapeDistance(low,high){
 const a=bandAudit(low,high,1,0),b=bandAudit(low,high,0,1);
 const la=a.bands.map(x=>x.contribution),lb=b.bands.map(x=>x.contribution);
 return la.reduce((sum,x,i)=>sum+Math.abs(x-lb[i]),0)/2;
}

export function auditRecordedPianoBandPhase(regions,samples,{
 pitch="C5",curves=["linear","smoothstep"],velocities=[64,65,80,81,96],
 windows=WINDOWS,warningDb=-3
}={}){
 if(!Array.isArray(regions)||regions.length!==6||!(samples instanceof Map)||
    !["C3","C4","C5"].includes(pitch)||
    !Array.isArray(curves)||curves.length<1||curves.length>2||
    !Array.isArray(velocities)||velocities.length<1||velocities.length>10||
    !Array.isArray(windows)||windows.length<1||windows.length>5||
    !finite(warningDb)||warningDb>-.5||warningDb< -20)
   throw Error("録音ピアノの帯域位相診断設定が不正です");
 const i=RECORDED_PIANO_SAMPLES.findIndex(x=>x.pitch===pitch);
 if(i<0||i%2!==0)throw Error("音域が見つかりません");
 const lowRec=RECORDED_PIANO_SAMPLES[i],highRec=RECORDED_PIANO_SAMPLES[i+1];
 const lr=regions[i],hr=regions[i+1],lowSample=samples.get(lowRec.file),highSample=samples.get(highRec.file);
 if(!lr||!hr||lr.sample!==lowRec.file||hr.sample!==highRec.file||
    !finite(lr.volumeDb)||!finite(hr.volumeDb)||
    lr.volumeDb< -60||lr.volumeDb>0||hr.volumeDb< -60||hr.volumeDb>0||
    !lowSample||!highSample||lowSample.sampleRate!==highSample.sampleRate)
   throw Error("元の弱強録音またはマップが異なります");
 const lowVolume=Math.pow(10,lr.volumeDb/20),highVolume=Math.pow(10,hr.volumeDb/20);
 for(const v of velocities)if(!Number.isInteger(v)||v<1||v>127)throw Error("不正な強弱値");
 for(const curve of curves)recordedPianoBlendWeights(80,{curve});
 const names=new Set(),audits=[];
 for(const w of windows){
  if(!w||typeof w.name!=="string"||!/^[a-z-]{1,20}$/.test(w.name)||
     names.has(w.name)||!finite(w.seconds)||w.seconds<0||w.seconds>.5)
    throw Error("不正な時間窓");
  names.add(w.name);
  const low=spectrum(lowSample,w.seconds),high=spectrum(highSample,w.seconds);
  const sourceSpectralDistance=spectralShapeDistance(low,high);
  const modes=curves.map(curve=>{
   const points=velocities.map(velocity=>{
    const weights=recordedPianoBlendWeights(velocity,{curve});
    const result=bandAudit(low,high,lowVolume*weights.low,highVolume*weights.high);
    const drops=result.bands.filter(b=>b.significant&&b.dualLayer&&b.phaseInteractionDb<=warningDb);
    return {velocity,phaseInteractionDb:result.globalPhaseInteractionDb,
      strongCancellationBands:drops.length,worstSignificantBand:result.worstSignificantBand,
      drops};
   });
   return {curve,points};
  });
  audits.push({name:w.name,offsetSeconds:w.seconds,sourceSpectralDistance,modes});
 }
 return {pitch,fftSize:N,bandsHz:EDGES,velocityRange:velocities,windows:audits,
  kind:"relative-band-phase-interference-diagnostic",
  caution:"Incoherent-power comparison is only a mixing proxy. It does not prove a specific audible defect, nor assess note attacks and timbre perceptually."};
}
