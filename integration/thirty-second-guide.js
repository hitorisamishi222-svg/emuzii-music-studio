// Minimal deterministic note-event renderer. No external samples or paid APIs.
// This produces a SYNTHETIC guide, not a claim of real instrument quality.
export function renderGuidePhrase(notes,{sampleRate=24000,seconds=30}={}){
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>48000)throw Error("Invalid sample rate");
 if(!Number.isFinite(seconds)||seconds<=0||seconds>60)throw Error("Invalid duration");
 if(!Array.isArray(notes)||notes.length>2048)throw Error("Invalid notes");
 const frames=Math.ceil(sampleRate*seconds);
 const pcm=new Float32Array(frames);
 for(const note of notes){
  if(!note||![note.start,note.duration,note.midi,note.velocity].every(Number.isFinite))throw Error("Invalid note");
  const {start,duration,midi,velocity}=note;
  if(start<0||duration<=0||duration>seconds||start+duration>seconds||midi<24||midi>108||velocity<0||velocity>127)throw Error("Note out of bounds");
  const first=Math.round(start*sampleRate),end=Math.min(frames,Math.round((start+duration)*sampleRate));
  const freq=440*Math.pow(2,(midi-69)/12);
  const amp=(velocity/127)*0.13;
  for(let i=first;i<end;i++){
   const t=(i-first)/sampleRate;
   const tail=(end-i)/sampleRate;
   const envelope=Math.min(1,t/0.018,tail/0.09);
   pcm[i]+=amp*envelope*(Math.sin(2*Math.PI*freq*t)+0.22*Math.sin(4*Math.PI*freq*t));
  }
 }
 for(let i=0;i<pcm.length;i++)pcm[i]=Math.tanh(pcm[i]);
 return {sampleRate,pcm,durationSeconds:seconds,kind:"synthetic-guide-only"};
}
export function createThirtySecondGuideScore(){
 const melody=[60,64,67,69,67,64,62,60,57,60,64,67,65,62,60];
 const notes=[];
 for(let i=0;i<melody.length;i++){
  notes.push({start:i*2,duration:1.7,midi:melody[i],velocity:i%4===0?90:72});
  notes.push({start:i*2,duration:1.85,midi:[48,53,55,48][Math.floor(i/4)%4],velocity:42});
 }
 return notes;
}
