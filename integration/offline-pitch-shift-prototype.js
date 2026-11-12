// MUSIC-104: offline, experimental overlap-add pitch shift.
// Not suitable for live monitoring or production singing without listening QA.
export function pitchShiftOfflinePrototype(pcm,{
 sampleRate=24000,correctionCents=0,grainMs=40,wet=1
}={}){
 if(!(pcm instanceof Float32Array)||pcm.length<512||pcm.length>262144||
  !Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>96000||
  !Number.isFinite(correctionCents)||Math.abs(correctionCents)>100||
  !Number.isFinite(grainMs)||grainMs<20||grainMs>80||
  !Number.isFinite(wet)||wet<0||wet>1)
  throw Error("オフライン補正設定が不正です");
 for(const x of pcm)if(!Number.isFinite(x)||Math.abs(x)>1)throw Error("入力PCMが不正です");
 const output=new Float32Array(pcm.length);
 if(correctionCents===0||wet===0){output.set(pcm);return {pcm:output,applied:false,latencySamples:0,experimental:true}}
 const ratio=Math.pow(2,correctionCents/1200);
 const grain=Math.max(128,Math.round(sampleRate*grainMs/1000));
 const hop=Math.floor(grain/4);
 const weight=new Float32Array(pcm.length);
 // Four overlapping Hann grains, with read-head advancing at pitch ratio.
 // Center-aligned analysis anchors preserve overall duration. Boundary samples
 // are passed through rather than zeroed when no complete grain is available.
 for(let start=0;start<pcm.length;start+=hop){
  const center=start+grain/2;
  for(let j=0;j<grain&&start+j<pcm.length;j++){
   const outIndex=start+j;
   const src=center+(j-grain/2)*ratio;
   if(src<0||src>=pcm.length-1)continue;
   const k=Math.floor(src),frac=src-k;
   const value=pcm[k]*(1-frac)+pcm[k+1]*frac;
   const w=.5-.5*Math.cos(2*Math.PI*j/(grain-1));
   output[outIndex]+=value*w;
   weight[outIndex]+=w;
  }
 }
 let peak=0;
 for(let i=0;i<output.length;i++){
  const shifted=weight[i]>1e-6?output[i]/weight[i]:pcm[i];
  output[i]=Math.max(-1,Math.min(1,pcm[i]*(1-wet)+shifted*wet));
  peak=Math.max(peak,Math.abs(output[i]));
 }
 return {pcm:output,applied:true,peak,latencySamples:grain,
  experimental:true,caveat:"Granular OLA changes timbre/transients and may introduce artifacts. Not approved for live singing."};
}
