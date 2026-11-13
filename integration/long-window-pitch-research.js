// MUSIC-106: offline research baseline using two long, phase-offset read heads.
// Deliberately NOT for real-time monitoring: 500ms windows can smear speech,
// vibrato and transients. This is a measurable alternative to MUSIC-104.
export function pitchShiftLongWindowResearch(pcm,{
 sampleRate=24000,correctionCents=35,windowMs=500
}={}){
 if(!(pcm instanceof Float32Array)||pcm.length<4096||pcm.length>262144||
 !Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>96000||
 !Number.isFinite(correctionCents)||Math.abs(correctionCents)>100||
 !Number.isFinite(windowMs)||windowMs<250||windowMs>1000)
 throw Error("研究用ピッチシフト設定が不正です");
 for(const x of pcm)if(!Number.isFinite(x)||Math.abs(x)>1)throw Error("入力PCMが不正です");
 const output=new Float32Array(pcm.length);
 if(correctionCents===0){output.set(pcm);return {pcm:output,applied:false,windowSamples:0,experimental:true}}
 const ratio=Math.pow(2,correctionCents/1200),windowSamples=Math.round(sampleRate*windowMs/1000);
 for(let i=0;i<pcm.length;i++){
  let sum=0,weight=0;
  for(const offset of [0,.5]){
   const phase=(i/windowSamples+offset)%1;
   const read=i+(ratio-1)*phase*windowSamples;
   if(read<0||read>=pcm.length-1)continue;
   const j=Math.floor(read),f=read-j;
   const w=Math.sin(Math.PI*phase)**2;
   sum+=(pcm[j]*(1-f)+pcm[j+1]*f)*w;
   weight+=w;
  }
  output[i]=weight>1e-6?Math.max(-1,Math.min(1,sum/weight)):pcm[i];
 }
 return {pcm:output,applied:true,windowSamples,experimental:true,
 caveat:"Long-window research baseline only. No naturalness, latency or real-time approval."};
}
