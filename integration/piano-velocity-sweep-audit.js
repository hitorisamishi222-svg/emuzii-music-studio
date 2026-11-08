// 33-step velocity sweep QC: deterministic, no sound creation and no input mutation.
// This measures 50-300 ms RMS for every note of a single-pitch test sequence.
// Signal-level metrics are NOT a substitute for listening to timbre or phase.
const finite=x=>typeof x==="number"&&Number.isFinite(x);

export function createPianoVelocitySweepScore(midi,{first=64,last=96,spacingSeconds=0.65,durationSeconds=0.48}={}){
 if(!Number.isInteger(midi)||midi<42||midi>78||
    !Number.isInteger(first)||!Number.isInteger(last)||first<1||last>127||first>=last||
    last-first>63||!finite(spacingSeconds)||spacingSeconds<0.40||spacingSeconds>1.5||
    !finite(durationSeconds)||durationSeconds<0.35||durationSeconds>=spacingSeconds){
   throw Error("強弱スイープ楽譜の設定が不正です");
 }
 return Array.from({length:last-first+1},(_,i)=>({
  start:i*spacingSeconds,duration:durationSeconds,midi,velocity:first+i
 }));
}

export function auditPianoVelocitySweep(pcm,sampleRate,notes,{
 measureFromSeconds=.05,measureToSeconds=.30,minAllowedStepDb=-.25
}={}){
 if(!(pcm instanceof Float32Array)||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>48000||
    !Array.isArray(notes)||notes.length<2||notes.length>64||
    !finite(measureFromSeconds)||!finite(measureToSeconds)||measureFromSeconds<0||
    measureToSeconds<=measureFromSeconds||measureToSeconds>0.35||
    !finite(minAllowedStepDb)||minAllowedStepDb< -3||minAllowedStepDb>0)throw Error("強弱スイープ監査の条件が不正です");
 const levels=[];
 let globalPeak=0;
 for(const x of pcm){
  if(!finite(x))throw Error("PCMの非数値");
  globalPeak=Math.max(globalPeak,Math.abs(x));
 }
 for(let i=0;i<notes.length;i++){
  const n=notes[i];
  if(!n||!Number.isInteger(n.velocity)||n.velocity<0||n.velocity>127||
     !finite(n.start)||!finite(n.duration)||n.duration<measureToSeconds||
     (i>0&&n.velocity!==notes[i-1].velocity+1))throw Error("連続したベロシティの監査楽譜が必要です");
  const a=Math.round((n.start+measureFromSeconds)*sampleRate),b=Math.round((n.start+measureToSeconds)*sampleRate);
  if(a<0||b>pcm.length||b<=a)throw Error("PCM長不足");
  let sum=0,peak=0;
  for(let f=a;f<b;f++){sum+=pcm[f]*pcm[f];peak=Math.max(peak,Math.abs(pcm[f]));}
  const rms=Math.sqrt(sum/(b-a));
  if(!finite(rms)||rms<1e-8)throw Error("監査区間が無音に近すぎます");
  levels.push({velocity:n.velocity,rms,rmsDbfs:20*Math.log10(rms),peak});
 }
 const adjacent=levels.slice(1).map((row,i)=>({
  from:levels[i].velocity,to:row.velocity,deltaDb:row.rmsDbfs-levels[i].rmsDbfs
 }));
 const regressions=adjacent.filter(x=>x.deltaDb<minAllowedStepDb);
 let worstStep=adjacent[0],maxStep=adjacent[0];
 for(const step of adjacent){
  if(step.deltaDb<worstStep.deltaDb)worstStep=step;
  if(step.deltaDb>maxStep.deltaDb)maxStep=step;
 }
 return {
  velocities:levels.length,levels,adjacent,regressions,
  regressionCount:regressions.length,
  worstStep,maxStep,peak:globalPeak,overloaded:globalPeak>1,
  kind:"instrument-velocity-33-step-rms-audit-not-listening",
  limitations:"RMS does not measure perceived loudness, timbre, or phase coloration"
 };
}
