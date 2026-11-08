// ASAHI MUSIC: non-destructive spectral/timbre continuity audit.
// Uses deterministic Hann-windowed 2048-point FFT of each recorded note.
// A spectral change is NOT proof of bad sound, nor is a small change proof
// of natural timbre. No network, model inference, or sample modification.
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const BINS=24,LOW_HZ=60,HIGH_HZ=9500,FFT_SIZE=2048;

function spectralFingerprint(pcm,sampleRate,startFrame){
 const re=new Float64Array(FFT_SIZE),im=new Float64Array(FFT_SIZE);
 if(startFrame<0||startFrame+FFT_SIZE>pcm.length)throw Error("音色解析に必要なPCMが足りません");
 for(let i=0;i<FFT_SIZE;i++){
   const x=pcm[startFrame+i];
   if(!finite(x))throw Error("PCMに非数値が含まれています");
   re[i]=x*(.5-.5*Math.cos(2*Math.PI*i/(FFT_SIZE-1)));
 }
 // Bit-reversed radix-2 Cooley-Tukey FFT; no FFT library dependency.
 for(let i=1,j=0;i<FFT_SIZE;i++){
   let bit=FFT_SIZE>>1;
   for(;j&bit;bit>>=1)j^=bit;
   j^=bit;
   if(i<j){const z=re[i];re[i]=re[j];re[j]=z;}
 }
 for(let size=2;size<=FFT_SIZE;size*=2){
   const half=size>>1;
   const step=-2*Math.PI/size;
   for(let offset=0;offset<FFT_SIZE;offset+=size){
     for(let k=0;k<half;k++){
       const angle=step*k,c=Math.cos(angle),s=Math.sin(angle);
       const index=offset+k+half;
       const rr=c*re[index]-s*im[index];
       const ii=s*re[index]+c*im[index];
       const a=offset+k;
       const oldRe=re[a],oldIm=im[a];
       re[a]=oldRe+rr;im[a]=oldIm+ii;
       re[index]=oldRe-rr;im[index]=oldIm-ii;
     }
   }
 }
 const ceiling=Math.min(HIGH_HZ,sampleRate/2);
 const bands=new Float64Array(BINS);
 let power=0,weightedHz=0,highPower=0;
 const logRange=Math.log(ceiling/LOW_HZ);
 for(let k=1;k<FFT_SIZE/2;k++){
   const hz=k*sampleRate/FFT_SIZE;
   if(hz<LOW_HZ||hz>ceiling)continue;
   const x=re[k]*re[k]+im[k]*im[k];
   const b=Math.min(BINS-1,Math.floor(BINS*Math.log(hz/LOW_HZ)/logRange));
   bands[b]+=x;power+=x;weightedHz+=hz*x;
   if(hz>=2000)highPower+=x;
 }
 if(power<1e-14||!finite(power))throw Error("音色解析区間がほぼ無音です");
 return {
   bands:Array.from(bands,v=>v/power),
   centroidHz:weightedHz/power,
   highBandRatio:highPower/power
 };
}
function distance(a,b){
 let total=0;
 for(let k=0;k<BINS;k++)total+=Math.abs(a.bands[k]-b.bands[k]);
 return Math.max(0,Math.min(1,total/2));
}
export function auditPianoTimbreSweep(pcm,sampleRate,notes,{offsetSeconds=.10,warningDistance=.20}={}){
 if(!(pcm instanceof Float32Array)||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>48000||
    !Array.isArray(notes)||notes.length<2||notes.length>64||
    !finite(offsetSeconds)||offsetSeconds<0.02||offsetSeconds>.40||
    !finite(warningDistance)||warningDistance<=0||warningDistance>1)throw Error("音色連続性の監査条件が不正です");
 const snapshots=[];
 for(let i=0;i<notes.length;i++){
   const n=notes[i];
   if(!n||!Number.isInteger(n.velocity)||n.velocity<0||n.velocity>127||
      !finite(n.start)||n.start<0||!finite(n.duration)||n.duration<=offsetSeconds+FFT_SIZE/sampleRate||
      (i>0&&n.velocity!==notes[i-1].velocity+1))throw Error("連続した音符の音色解析が必要です");
   const startFrame=Math.round((n.start+offsetSeconds)*sampleRate);
   const spectrum=spectralFingerprint(pcm,sampleRate,startFrame);
   snapshots.push({velocity:n.velocity,...spectrum});
 }
 const changes=snapshots.slice(1).map((now,i)=>({
   from:snapshots[i].velocity,to:now.velocity,
   spectralDistance:distance(snapshots[i],now),
   centroidChangeHz:now.centroidHz-snapshots[i].centroidHz,
   highBandRatioChange:now.highBandRatio-snapshots[i].highBandRatio
 }));
 const warnings=changes.filter(x=>x.spectralDistance>=warningDistance);
 const worst=changes.reduce((a,b)=>a.spectralDistance>=b.spectralDistance?a:b);
 return {
   analyzedNotes:snapshots.length,fftSize:FFT_SIZE,offsetSeconds,
   warningDistance,warningCount:warnings.length,
   warnings,worstAdjacentChange:worst,
   snapshots:snapshots.map(({velocity,centroidHz,highBandRatio})=>({velocity,centroidHz,highBandRatio})),
   adjacent:changes,
   kind:"spectral-shape-change-advisory-only",
   caution:"位相の打ち消し・自然さ・知覚音色を自動認定しません"
 };
}
