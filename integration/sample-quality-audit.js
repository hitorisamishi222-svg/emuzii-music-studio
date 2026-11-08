// ASAHI MUSIC - offline, advisory quality inspection for user-provided samples.
// This diagnoses WAV-decoded PCM, not instrument realism or legal rights.
// All input arrays remain unchanged.
const finite = n => typeof n === "number" && Number.isFinite(n);
export function analyzeInstrumentSample(sample, {quietThreshold=0.002}={}) {
  if (!sample || !Array.isArray(sample.channels) ||
      sample.channels.length<1 || sample.channels.length>2 ||
      !Number.isInteger(sample.sampleRate) || sample.sampleRate<8000 || sample.sampleRate>192000) {
    throw Error("音源のチャンネルまたはサンプルレートが不正です");
  }
  const channels=sample.channels,frames=channels[0]?.length;
  if (!Number.isSafeInteger(frames) || frames<1 ||
      !channels.every(ch=>ch instanceof Float32Array&&ch.length===frames)) {
    throw Error("音源のチャンネル長・形式が不正です");
  }
  if (!finite(quietThreshold) || quietThreshold<=0 || quietThreshold>0.1) {
    throw Error("静音検出のしきい値が不正です");
  }
  let energy=0,total=0,peak=0,clippedFrames=0;
  const means=channels.map(()=>0);
  for(let i=0;i<frames;i++){
    let frameClipped=false;
    for(let j=0;j<channels.length;j++){
      const v=channels[j][i];
      if(!finite(v))throw Error("非数値のPCMが含まれています");
      const abs=Math.abs(v);
      if(abs>=0.999)frameClipped=true;
      energy+=v*v;means[j]+=v;
      peak=Math.max(peak,abs);
      total++;
    }
    if(frameClipped)clippedFrames++;
  }
  const rms=Math.sqrt(energy/total);
  const dcOffset=Math.max(...means.map(m=>Math.abs(m/frames)));
  const windowFrames=Math.max(1,Math.round(sample.sampleRate*.02));
  const scanQuiet=(reverse)=>{
    let count=0;
    for(let end=reverse?frames:0;reverse?end>0:end<frames;){
      const a=reverse?Math.max(0,end-windowFrames):end;
      const b=reverse?end:Math.min(frames,end+windowFrames);
      let sum=0;
      for(const ch of channels)for(let k=a;k<b;k++)sum+=ch[k]*ch[k];
      const localRms=Math.sqrt(sum/((b-a)*channels.length));
      if(localRms>quietThreshold)break;
      count+=b-a;
      end=reverse?a:b;
    }
    return count/sample.sampleRate;
  };
  const durationSeconds=frames/sample.sampleRate;
  const leadingQuietSeconds=scanQuiet(false);
  const trailingQuietSeconds=scanQuiet(true);
  const issues=[];
  const nearSilence=rms<0.0002 && peak<0.001;
  if(nearSilence)issues.push("near_silence");
  if(clippedFrames>0)issues.push("possible_clipping");
  if(dcOffset>=0.03)issues.push("dc_offset");
  if(!nearSilence && trailingQuietSeconds<0.02 && rms>0.004)issues.push("active_end");
  if(durationSeconds<0.2)issues.push("very_short");
  return {
    sampleRate:sample.sampleRate,channels:channels.length,frames,durationSeconds,
    rms,rmsDbfs:rms>0?20*Math.log10(rms):null,peak,
    peakDbfs:peak>0?20*Math.log10(peak):null,
    dcOffset,clippedFrames,clippedFrameRatio:clippedFrames/frames,
    leadingQuietSeconds,trailingQuietSeconds,nearSilence,
    issues,usableForPreview:!nearSilence
  };
}
