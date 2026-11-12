// MUSIC-102: bounded, offline monophonic fundamental-frequency candidate estimator.
// Not a real-time Android input path and not reliable for polyphonic accompaniment.
export function estimateMonophonicPitch(pcm,{sampleRate=24000,minHz=80,maxHz=1000,
 minimumRms=0.008,minimumClarity=0.82}={}){
 if(!(pcm instanceof Float32Array)||pcm.length<256||pcm.length>262144||
  !Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>96000||
  !Number.isFinite(minHz)||!Number.isFinite(maxHz)||minHz<40||maxHz>2000||maxHz<=minHz||
  !Number.isFinite(minimumRms)||minimumRms<0||minimumRms>1||
  !Number.isFinite(minimumClarity)||minimumClarity<0||minimumClarity>1)
  throw Error("音程検出の設定が不正です");
 const n=pcm.length;let mean=0;
 for(let i=0;i<n;i++){if(!Number.isFinite(pcm[i]))throw Error("音声に不正な値があります");mean+=pcm[i]}
 mean/=n;let energy=0;
 for(let i=0;i<n;i++){const v=pcm[i]-mean;energy+=v*v}
 const rms=Math.sqrt(energy/n);
 if(rms<minimumRms)return {voiced:false,hz:null,confidence:0,rms,reason:"silence"};
 const minLag=Math.max(2,Math.floor(sampleRate/maxHz));
 const maxLag=Math.min(Math.ceil(sampleRate/minHz),Math.floor(n/2));
 if(maxLag<=minLag)throw Error("解析窓が短すぎます");
 // Normalized autocorrelation: octave errors are possible. Never use alone
 // to decide a singer's intended melody or to alter the source.
 const scores=[];
 for(let lag=minLag;lag<=maxLag;lag++){
  let xy=0,xx=0,yy=0;
  for(let i=0;i<n-lag;i++){
   const a=pcm[i]-mean,b=pcm[i+lag]-mean;
   xy+=a*b;xx+=a*a;yy+=b*b;
  }
  scores.push(xx>0&&yy>0?xy/Math.sqrt(xx*yy):0);
 }
 let best=0;
 for(let i=1;i<scores.length;i++)if(scores[i]>scores[best])best=i;
 const peak=scores[best];
 // Prefer the earliest strong periodicity, rather than an integer multiple.
 const threshold=Math.max(minimumClarity,peak*0.98);
 let chosen=best;
 for(let i=1;i<scores.length-1;i++)
  if(scores[i]>=threshold&&scores[i]>=scores[i-1]&&scores[i]>=scores[i+1]){chosen=i;break}
 const lag=chosen+minLag;
 let offset=0;
 if(chosen>0&&chosen<scores.length-1){
  const a=scores[chosen-1],b=scores[chosen],c=scores[chosen+1];
  const d=a-2*b+c;
  if(Math.abs(d)>1e-9)offset=Math.max(-0.5,Math.min(0.5,0.5*(a-c)/d));
 }
 const clarity=Math.max(0,Math.min(1,scores[chosen]));
 if(clarity<minimumClarity)return {voiced:false,hz:null,confidence:clarity,rms,reason:"low-clarity"};
 return {voiced:true,hz:sampleRate/(lag+offset),confidence:clarity,rms,reason:"candidate",
  caution:"Monophonic offline estimate only; octave and timbre ambiguity remain."};
}
