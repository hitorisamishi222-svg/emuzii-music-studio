import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root=process.cwd();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8'};
function syntheticWav({duration=1.3,start=0,end=.4,freq=440}={}){
  const sr=16000,n=Math.round(duration*sr),out=Buffer.alloc(44+n*2);
  out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVE',8);
  out.write('fmt ',12);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);
  out.writeUInt16LE(1,22);out.writeUInt32LE(sr,24);out.writeUInt32LE(sr*2,28);
  out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++){const t=i/sr,active=t>=start&&t<end;
    const env=Math.min(1,(t-start)*30,(end-t)*30);
    const value=active?Math.sin(t*2*Math.PI*freq)*.36*Math.max(0,env):0;
    out.writeInt16LE(Math.round(value*32767),44+i*2);
  }
  return out;
}
function syntheticPhraseWav(){
  // Four source notes at known octaves with long breaths between each phrase.
  const sr=16000,duration=5.1,n=Math.round(sr*duration),out=Buffer.alloc(44+n*2);
  out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVE',8);
  out.write('fmt ',12);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);
  out.writeUInt16LE(1,22);out.writeUInt32LE(sr,24);out.writeUInt32LE(sr*2,28);
  out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(n*2,40);
  const phrases=[
    {from:.15,to:.82,freq:261.6256},
    {from:1.36,to:2.03,freq:523.2511},
    {from:2.57,to:3.24,freq:440},
    {from:3.78,to:4.45,freq:880}
  ];
  for(let i=0;i<n;i++){
    const t=i/sr,phrase=phrases.find(p=>t>=p.from&&t<p.to);
    const edge=phrase?Math.max(0,Math.min(1,(t-phrase.from)*35,(phrase.to-t)*35)):0;
    const y=phrase?Math.sin(t*2*Math.PI*phrase.freq)*.34*edge:0;
    out.writeInt16LE(Math.round(y*32767),44+i*2);
  }
  return out;
}
function syntheticVibratoVocalWav(){
  // A reproducible quasi-vocal challenge: harmonic formants, vibrato,
  // connected melodic leaps, and long breath pauses, without user recordings.
  const sampleRate=16000,duration=22,n=Math.round(duration*sampleRate),out=Buffer.alloc(44+n*2);
  out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVE',8);
  out.write('fmt ',12);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);
  out.writeUInt16LE(1,22);out.writeUInt32LE(sampleRate,24);out.writeUInt32LE(sampleRate*2,28);
  out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(n*2,40);
  const notes=[
    {from:.4,to:1.15,midi:60}, {from:1.28,to:2.05,midi:62},
    {from:2.18,to:2.92,midi:64},
    {from:4,to:4.78,midi:67}, {from:4.91,to:5.66,midi:72},
    {from:7.2,to:7.98,midi:69}, {from:8.10,to:8.9,midi:81},
    {from:10.4,to:11.18,midi:76}, {from:11.31,to:12.06,midi:72},
    {from:14.2,to:15.01,midi:57}, {from:15.14,to:15.92,midi:60},
    {from:20,to:20.84,midi:69}
  ];
  let current=null,phase=0;
  for(let i=0;i<n;i++){
    const time=i/sampleRate,note=notes.find(p=>time>=p.from&&time<p.to);
    if(note!==current){current=note;phase=0;}
    if(!note){out.writeInt16LE(0,44+i*2);continue;}
    const t=time-note.from,end=note.to-time;
    const env=Math.max(0,Math.min(1,t/.045,end/.06));
    const cents=15*Math.sin(2*Math.PI*4.8*t);
    const hz=440*Math.pow(2,(note.midi-69+cents/100)/12);
    phase+=2*Math.PI*hz/sampleRate;
    const voiced=.37*Math.sin(phase)+.29*Math.sin(2*phase+.15)+.18*Math.sin(3*phase+.6)+.10*Math.sin(4*phase+.3);
    const breath=.012*Math.sin(2*Math.PI*3979*time)*Math.sin(2*Math.PI*1371*time);
    const sample=Math.max(-.95,Math.min(.95,(voiced+breath)*.42*env));
    out.writeInt16LE(Math.round(sample*32767),44+i*2);
  }
  return {wav:out,notes,duration};
}
function syntheticBreathyConsonantWav(){
  // Deterministic singing challenge: build on the known 12-note melody,
  // layering voiced vibrato with unvoiced /s/-like attacks and breath noise.
  // All bytes are local synthetic data, never a listener/user recording.
  const base=syntheticVibratoVocalWav(),sr=16000,frames=Math.round(base.duration*sr);
  const out=Buffer.from(base.wav);
  let seed=0x531c83ab,previousNoise=0;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/0xffffffff*2-1;};
  for(let i=0;i<frames;i++){
    const t=i/sr,note=base.notes.find(n=>t>=n.from&&t<n.to);
    const consonant=base.notes.find(n=>t>=n.from-.14&&t<n.from-.01);
    const breath=base.notes.find(n=>t>=n.to&&t<n.to+.16);
    const raw=random(),high=raw-previousNoise;previousNoise=raw;
    let noise=.008*high;
    if(consonant)noise+=.25*high*Math.sin(Math.PI*(t-(consonant.from-.14))/.13)**2;
    if(breath)noise+=.105*high*Math.sin(Math.PI*(t-breath.to)/.16)**2;
    if(note)noise+=.02*high;
    const sung=out.readInt16LE(44+i*2)/32768;
    const result=Math.max(-.98,Math.min(.98,sung+noise));
    out.writeInt16LE(Math.round(result*32767),44+i*2);
  }
  return {...base,wav:out};
}
function syntheticFullLengthTailWav(){
  // Three-plus-minute reference: a late, short vocal must not be omitted
  // just because there is less than one analysis window left in the clip.
  const sr=16000,duration=195.22,n=Math.round(sr*duration);
  const out=Buffer.alloc(44+n*2);
  out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVE',8);
  out.write('fmt ',12);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);
  out.writeUInt16LE(1,22);out.writeUInt32LE(sr,24);out.writeUInt32LE(sr*2,28);
  out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(n*2,40);
  const notes=[
    {from:.3,to:.95,midi:60},
    {from:64.2,to:65.02,midi:69},
    {from:129.5,to:130.25,midi:64},
    {from:195.12,to:195.22,midi:72}
  ];
  for(const note of notes){
    const freq=440*Math.pow(2,(note.midi-69)/12);
    for(let i=Math.floor(note.from*sr);i<Math.ceil(note.to*sr)&&i<n;i++){
      const time=i/sr,env=Math.max(0,Math.min(1,(time-note.from)*100,(note.to-time)*100));
      const sample=.42*env*Math.sin(2*Math.PI*freq*time);
      out.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample))*32767),44+i*2);
    }
  }
  return {wav:out,notes,duration};
}
function syntheticBackingBleedWavs({variableDelay=false,shortEcho=false}={}){
  const original=syntheticBreathyConsonantWav(),sampleRate=16000;
  const backing=Buffer.from(original.wav),vocal=Buffer.from(original.wav);
  const frames=Math.round(original.duration*sampleRate),delay=Math.round(.025*sampleRate);
  const reference=new Float32Array(frames);
  for(let i=0;i<frames;i++){
    const t=i/sampleRate;
    const drum=.09*Math.sin(2*Math.PI*1987*t)*Math.exp(-32*(t%1));
    const value=.3*Math.sin(2*Math.PI*110*t)+.21*Math.sin(2*Math.PI*196*t)+.12*Math.sin(2*Math.PI*137*t)+.06*Math.sin(2*Math.PI*1901*t)+drum;
    reference[i]=value;
    backing.writeInt16LE(Math.round(Math.max(-1,Math.min(1,value))*32767),44+i*2);
  }
  for(let i=0;i<frames;i++){
    const clean=original.wav.readInt16LE(44+i*2)/32768;
    const shifted=variableDelay?Math.round((i<frames/2?.018:.043)*sampleRate):delay;
    const echoDelay=shifted+Math.round(.057*sampleRate);
    const leaked=(i>=shifted?.37*reference[i-shifted]:0)
      +(shortEcho&&i>=echoDelay?.16*reference[i-echoDelay]:0);
    vocal.writeInt16LE(Math.round(Math.max(-.99,Math.min(.99,clean+leaked))*32767),44+i*2);
  }
  return {backing,vocal,notes:original.notes};
}
function rmsWav(bytes,start,end){
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WAVE');
  const sampleRate=bytes.readUInt32LE(24),channels=bytes.readUInt16LE(22),bits=bytes.readUInt16LE(34);
  assert.equal(bits,16);
  const samples=bytes.readUInt32LE(40)/(channels*2);
  let sum=0,count=0;
  for(let i=Math.floor(start*sampleRate);i<Math.min(samples,Math.floor(end*sampleRate));i++){
    const value=bytes.readInt16LE(44+i*channels*2)/32768;
    sum+=value*value;count++;
  }
  return count?Math.sqrt(sum/count):0;
}
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname==='/sw.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end('// CI no-op SW');return}
  let p=decodeURIComponent(u.pathname);if(p.endsWith('/'))p+='index.html';
  const file=path.resolve(root,'.'+p);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('not found');return}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const base='http://127.0.0.1:'+server.address().port+'/';
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#mainFile',{state:'attached',timeout:30000});
  let aceRequests=0;
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/ace'))aceRequests++});
  await page.locator('[data-view="create"]').click();
  await page.locator('#songDesign').fill('Warm city pop with gentle piano and acoustic guitar');
  await page.locator('#lyrics').fill('[Verse]\\nここから始まる');
  await page.locator('#aceDraftPreview').click();
  await page.waitForFunction(()=>document.querySelector('#aceDraftOutput')?.textContent?.includes('OFFLINE_ONLY_NO_NETWORK'));
  const draft=await page.locator('#aceDraftOutput').textContent();
  assert.match(draft,/"audio_duration": 270/);
  assert.match(draft,/"bpm": 96/);
  assert.match(draft,/音声は生成しません/);
  assert.equal(aceRequests,0,'Offline preview must make no ACE calls');
  await page.locator('[data-view="edit"]').click();
  // The guide timbre can be auditioned without any user's audio or song.
  await page.evaluate(()=>{
    window.__hummingOscillators=[];
    window.__hummingStops=[];
    window.__previewPitchRamps=[];
    window.__previewVolumePeaks=[];
    const linear=AudioParam.prototype.linearRampToValueAtTime;
    AudioParam.prototype.linearRampToValueAtTime=function(value,time){
      if(value>.042&&value<.06)window.__previewVolumePeaks.push({value,time});
      return linear.call(this,value,time);
    };
    const ramp=AudioParam.prototype.exponentialRampToValueAtTime;
    AudioParam.prototype.exponentialRampToValueAtTime=function(value,time){
      if(value>200&&value<1200)window.__previewPitchRamps.push({value,time});
      return ramp.call(this,value,time);
    };
    const start=OscillatorNode.prototype.start;
    const stop=OscillatorNode.prototype.stop;
    OscillatorNode.prototype.start=function(...args){
      window.__hummingOscillators.push({frequency:this.frequency.value,type:this.type,time:args[0]});
      return start.apply(this,args);
    };
    OscillatorNode.prototype.stop=function(...args){
      window.__hummingStops.push({frequency:this.frequency.value,time:args[0]});
      return stop.apply(this,args);
    };
  });
  const tracksBeforePreview=await page.locator('#tracks article.track').count();
  await page.locator('#guideInstrument').selectOption('humming');
  await page.locator('#previewGuideInstrument').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('ハミング風を試聴中'));
  const previewOscillators=await page.evaluate(()=>window.__hummingOscillators);
  assert.ok(previewOscillators.length>=20,'audition must schedule actual WebAudio oscillators');
  assert.ok(previewOscillators.some(x=>Math.abs(x.frequency-261.63)<1),'C4 fundamental must be present');
  const previewStops=await page.evaluate(()=>window.__hummingStops);
  const c4Start=previewOscillators.find(x=>Math.abs(x.frequency-261.63)<1)?.time;
  const c4End=previewStops.find(x=>Math.abs(x.frequency-261.63)<1)?.time;
  // MUSIC-062 glides from C4 at the onset of D4: the oscillator's initial
  // frequency is now C4, while its frequency automation reaches D4 by 45ms.
  const d4Start=previewOscillators.find(x=>x.frequency>100&&x.time>c4Start+.25)?.time;
  const previewRamps=await page.evaluate(()=>window.__previewPitchRamps);
  assert.ok(Number.isFinite(c4End)&&Number.isFinite(d4Start));
  assert.ok(c4End>d4Start&&c4End-d4Start<.055,'connected notes must overlap gently rather than restart with a gap');
  assert.ok(previewRamps.some(x=>Math.abs(x.value-293.66)<1&&x.time>d4Start&&x.time<=d4Start+.05),
    'connected-note preview must actually glide to the new D4 pitch within 50ms');
  // MUSIC-063: the first three connected syllables get a small phrase arc;
  // the final note, separated by an intentional breath, remains neutral.
  const peakEvents=await page.evaluate(()=>window.__previewVolumePeaks);
  const phraseExpected=[.78*.95,.75*1.045,.80*.94,.72].map(x=>.086*.72*x);
  for(const expected of phraseExpected)assert.ok(peakEvents.some(x=>Math.abs(x.value-expected)<1e-6),
    'real Chromium guide audition must schedule the bounded phrase gain '+expected);
  assert.equal(peakEvents.filter(x=>x.value>.042&&x.value<.06).length,4,
    'preview has exactly four independently articulated humming notes');
  assert.equal(await page.locator('#tracks article.track').count(),tracksBeforePreview,'audition must not add song tracks');
  assert.equal(aceRequests,0,'local audition must not call paid generation API');
  await page.waitForFunction(()=>!document.querySelector('#previewGuideInstrument')?.disabled,{timeout:5000});
  console.log('PASS humming guide auditions real browser WebAudio without user audio or network');

  const backing=syntheticWav({start:.05,end:.4,freq:440});
  const vocal=syntheticWav({start:.8,end:1.15,freq:659});
  await page.locator('#mainFile').setInputFiles({name:'backing-ci.wav',mimeType:'audio/wav',buffer:backing});
  await page.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('backing-ci'),{timeout:15000});
  await page.locator('#vocalFile').setInputFiles({name:'vocal-ci.wav',mimeType:'audio/wav',buffer:vocal});
  await page.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('vocal-ci'),{timeout:15000});
  await page.evaluate(()=>{
    document.querySelector('#masterLimiter').checked=false;
    document.querySelector('#structuralRenderEnabled').checked=false;
  });
  const downloading=page.waitForEvent('download',{timeout:30000});
  await page.evaluate(()=>document.querySelector('#exportMasterWav').click());
  const download=await downloading;
  assert.match(download.suggestedFilename(),/emuzii-master-.*\.wav/);
  const pieces=[];for await(const chunk of await download.createReadStream())pieces.push(chunk);
  const rendered=Buffer.concat(pieces);
  const first=rmsWav(rendered,.13,.27);
  const second=rmsWav(rendered,.91,1.02);
  console.log('MASTER_AUDIO_RMS',JSON.stringify({first,second,bytes:rendered.length}));
  assert.ok(first>.012,'Backing must be audible in exported master at 0.2 seconds');
  assert.ok(second>.012,'Vocal must be audible in exported master at 1.0 seconds');
  // Deleting a track is reversible during the editing session. Restore
  // its original ID, slot, and raw audio before autosave snapshots it.
  const trackIds=await page.locator('#tracks article.track').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
  assert.equal(trackIds.length,2);
  await page.locator('#tracks article.track').first().locator('[data-action="delete"]').click();
  assert.equal(await page.locator('#tracks article.track').count(),1);
  assert.equal(await page.locator('#undoTrackDelete').isEnabled(),true);
  await page.locator('#undoTrackDelete').click();
  assert.deepEqual(await page.locator('#tracks article.track').evaluateAll(nodes=>nodes.map(n=>n.dataset.id)),trackIds);
  assert.equal(await page.locator('#undoTrackDelete').isEnabled(),false);
  console.log('PASS deleted backing track restores same identity and order');

  // Broken saved project must not replace the live two-track editor state.
  const beforeTracks=await page.locator('#tracks').textContent();
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open('piyoko-music-v45',1);
      req.onupgradeneeded=()=>{
        const d=req.result;
        if(!d.objectStoreNames.contains('projects'))d.createObjectStore('projects',{keyPath:'id'});
        if(!d.objectStoreNames.contains('blobs'))d.createObjectStore('blobs',{keyPath:'id'});
      };
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite');
      tx.objectStore('projects').put({id:'last',name:'Broken synthetic CI restore',tracks:[{id:'ci-missing',name:'missing-ci.wav',type:'vocal',blobId:'asset:not-present'}]});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    db.close();
  });
  await page.locator('[data-view="project"]').click();
  await page.locator('#loadProject').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源「missing-ci.wav」が見つかりません'));
  assert.equal(await page.locator('#tracks').textContent(),beforeTracks,'Broken backup must preserve current two tracks');
  console.log('PASS broken backup is refused without replacing current music');

  // Safely erase saved data without erasing the two currently edited tracks.
  await page.locator('#saveProject').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#clearProject').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('再保存するまで自動保存しません'));
  assert.equal(await page.locator('#tracks').textContent(),beforeTracks);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(180);
  const countDb=async()=>page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('piyoko-music-v45',1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
    const result=await new Promise((resolve,reject)=>{
      const tx=db.transaction(['projects','blobs'],'readonly');
      const a=tx.objectStore('projects').count(),b=tx.objectStore('blobs').count();
      tx.oncomplete=()=>resolve({projects:a.result,blobs:b.result});
      tx.onerror=()=>reject(tx.error);
    });
    db.close();return result;
  });
  assert.deepEqual(await countDb(),{projects:0,blobs:0},'Deletion should not resurrect autosave or blobs');
  await page.locator('#saveProject').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  const afterSave=await countDb();
  assert.ok(afterSave.projects>=1&&afterSave.blobs>=2,'Manual save after delete must restore audio');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-view="project"]').click();
  await page.locator('#loadProject').click();
  await page.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('vocal-ci'));
  assert.match(await page.locator('#tracks').textContent(),/backing-ci/);
  console.log('PASS delete suspends autosave, manual save re-creates audio and reload restores tracks');

  // Legacy migration: the historical blob lives ONLY in v44.
  const legacy=await browser.newPage();
  await legacy.goto(base,{waitUntil:'domcontentloaded'});
  await legacy.waitForSelector('#loadProject',{state:'attached'});
  await legacy.evaluate(async bytes=>{
    const db=await new Promise((resolve,reject)=>{
      const q=indexedDB.open('piyoko-music-v44',1);
      q.onupgradeneeded=()=>{
        if(!q.result.objectStoreNames.contains('projects'))q.result.createObjectStore('projects',{keyPath:'id'});
        if(!q.result.objectStoreNames.contains('blobs'))q.result.createObjectStore('blobs',{keyPath:'id'});
      };
      q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['projects','blobs'],'readwrite');
      tx.objectStore('blobs').put({id:'asset:legacy-audio',blob:new Blob([Uint8Array.from(bytes)],{type:'audio/wav'})});
      tx.objectStore('projects').put({id:'last',name:'CI legacy project',tracks:[{
        id:'legacy-audio',name:'legacy-voice',type:'vocal',blobId:'asset:legacy-audio'
      }]});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  },Array.from(vocal));
  await legacy.locator('[data-view="project"]').click();
  await legacy.locator('#loadProject').click();
  await legacy.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('旧バージョンのプロジェクトを復元しました'));
  assert.match(await legacy.locator('#tracks').textContent(),/legacy-voice/);
  await legacy.locator('#saveProject').click();
  await legacy.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  await legacy.reload({waitUntil:'domcontentloaded'});
  await legacy.locator('[data-view="project"]').click();
  await legacy.locator('#loadProject').click();
  await legacy.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  assert.match(await legacy.locator('#tracks').textContent(),/legacy-voice/);
  await legacy.close();
  console.log('PASS migration v44 audio copies into current v45 database and survives reload');

  // Vocal preroll regression: original Blob still has count-in samples, while
  // reloaded playback and exported WAV must use the metadata-trimmed timeline.
  const prerollPage=await browser.newPage({acceptDownloads:true});
  await prerollPage.goto(base,{waitUntil:'domcontentloaded'});
  await prerollPage.waitForSelector('#loadProject',{state:'attached'});
  await prerollPage.evaluate(async bytes=>{
    const db=await new Promise((resolve,reject)=>{
      const q=indexedDB.open('piyoko-music-v45',1);
      q.onupgradeneeded=()=>{
        if(!q.result.objectStoreNames.contains('projects'))q.result.createObjectStore('projects',{keyPath:'id'});
        if(!q.result.objectStoreNames.contains('blobs'))q.result.createObjectStore('blobs',{keyPath:'id'});
      };
      q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['projects','blobs'],'readwrite');
      tx.objectStore('blobs').put({id:'asset:preroll-ci',blob:new Blob([Uint8Array.from(bytes)],{type:'audio/wav'})});
      tx.objectStore('projects').put({id:'last',name:'Count-in metadata CI',tracks:[{
        id:'preroll-ci',name:'trimmed-vocal-ci',type:'vocal',blobId:'asset:preroll-ci',
        recordTrimStartSec:.5,gain:1,pan:0,start:0,fadeIn:0,fadeOut:0,mute:false,solo:false
      }]});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  },Array.from(vocal));
  await prerollPage.locator('[data-view="project"]').click();
  await prerollPage.locator('#loadProject').click();
  await prerollPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  assert.match(await prerollPage.locator('#durationLabel').textContent(),/0\.8s/,'1.3s original minus 0.5s count-in');
  await prerollPage.locator('#saveProject').click();
  await prerollPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  await prerollPage.reload({waitUntil:'domcontentloaded'});
  await prerollPage.locator('[data-view="project"]').click();
  await prerollPage.locator('#loadProject').click();
  await prerollPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  assert.match(await prerollPage.locator('#durationLabel').textContent(),/0\.8s/);
  const downloadTrim=prerollPage.waitForEvent('download',{timeout:30000});
  await prerollPage.evaluate(()=>{
    document.querySelector('#masterLimiter').checked=false;
    document.querySelector('#structuralRenderEnabled').checked=false;
    document.querySelector('#exportMasterWav').click();
  });
  const wavDownload=await downloadTrim,parts=[];
  for await(const chunk of await wavDownload.createReadStream())parts.push(chunk);
  const trimmedAudio=Buffer.concat(parts);
  const early=rmsWav(trimmedAudio,.05,.12),audible=rmsWav(trimmedAudio,.38,.48);
  assert.ok(early<.006,'Trimmed count-in should not introduce early vocals');
  assert.ok(audible>.012,'Vocal must start at original .8s minus trim .5s = .3s');
  const originalSize=await prerollPage.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('piyoko-music-v45');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
    const result=await new Promise((resolve,reject)=>{
      const tx=db.transaction('blobs','readonly'),q=tx.objectStore('blobs').get('asset:preroll-ci');
      q.onsuccess=()=>resolve(q.result?.blob?.size);q.onerror=()=>reject(q.error);
    });db.close();return result;
  });
  assert.equal(originalSize,vocal.length,'Original microphone bytes stay untouched');

  // Invalid metadata must not replace a valid currently edited take.
  await prerollPage.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('piyoko-music-v45');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite'),q=tx.objectStore('projects').get('last');
      q.onsuccess=()=>{const record=q.result;record.tracks[0].recordTrimStartSec=100;tx.objectStore('projects').put(record)};
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  });
  const validTracks=await prerollPage.locator('#tracks').textContent();
  await prerollPage.locator('#loadProject').click();
  await prerollPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('トリム位置が不正です'));
  assert.equal(await prerollPage.locator('#tracks').textContent(),validTracks);
  await prerollPage.close();
  console.log('PASS raw vocal recording preserved, trim metadata survives reload and unsafe trim rejected');

  // A damaged edit mix field must not replace the currently audible recording.
  const metadataPage=await browser.newPage();
  await metadataPage.goto(base,{waitUntil:'domcontentloaded'});
  await metadataPage.waitForSelector('#loadProject',{state:'attached'});
  await metadataPage.evaluate(async bytes=>{
    const db=await new Promise((resolve,reject)=>{
      const q=indexedDB.open('piyoko-music-v45',1);
      q.onupgradeneeded=()=>{
        if(!q.result.objectStoreNames.contains('projects'))q.result.createObjectStore('projects',{keyPath:'id'});
        if(!q.result.objectStoreNames.contains('blobs'))q.result.createObjectStore('blobs',{keyPath:'id'});
      };
      q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['projects','blobs'],'readwrite');
      tx.objectStore('blobs').put({id:'asset:normal-ci',blob:new Blob([Uint8Array.from(bytes)],{type:'audio/wav'})});
      tx.objectStore('projects').put({id:'last',name:'safe original',tracks:[{
        id:'normal-ci',name:'valid-ci-take',type:'vocal',blobId:'asset:normal-ci',gain:1,pan:0,start:0,fadeIn:0,fadeOut:0
      }]});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  },Array.from(vocal));
  await metadataPage.locator('[data-view="project"]').click();
  await metadataPage.locator('#loadProject').click();
  await metadataPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  const liveIds=await metadataPage.locator('#tracks article.track').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
  const liveUI=await metadataPage.locator('#tracks').textContent();
  await metadataPage.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('piyoko-music-v45');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite'),q=tx.objectStore('projects').get('last');
      q.onsuccess=()=>{
        const item=q.result;item.tracks[0].pan='NaN';tx.objectStore('projects').put(item);
      };
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  });
  await metadataPage.locator('#loadProject').click();
  await metadataPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('PANが不正'));
  assert.deepEqual(await metadataPage.locator('#tracks article.track').evaluateAll(nodes=>nodes.map(n=>n.dataset.id)),liveIds);
  assert.equal(await metadataPage.locator('#tracks').textContent(),liveUI,'Live edit must not be replaced by corrupt saved PAN');
  await metadataPage.close();
  console.log('PASS invalid stored mix field refused before editor state changes');



  // Inline track rename must persist across reload without replacing the audio.
  const renamePage=await browser.newPage();
  await renamePage.goto(base,{waitUntil:'domcontentloaded'});
  await renamePage.waitForSelector('#mainFile',{state:'attached'});
  await renamePage.locator('#mainFile').setInputFiles({name:'original-backing-ci.wav',mimeType:'audio/wav',buffer:backing});
  await renamePage.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('original-backing-ci'));
  // A clip starting before zero should show only its audible positive-time
  // portion, matching playback and the offline master renderer.
  const earlyStart=renamePage.locator('#tracks article.track').first().locator('[data-field="start"]');
  await earlyStart.fill('-0.5');
  assert.match(await renamePage.locator('#durationLabel').textContent(),/0\.8s/);
  await earlyStart.fill('0');
  assert.match(await renamePage.locator('#durationLabel').textContent(),/1\.3s/);
  const beforeRenameId=await renamePage.locator('#tracks article.track').first().getAttribute('data-id');
  await renamePage.locator('#tracks article.track').first().locator('[data-action="rename"]').click();
  const renameInput=renamePage.locator('#tracks article.track').first().locator('.track-rename');
  await renameInput.fill('優しい伴奏 🎵');
  await renameInput.press('Enter');
  assert.match(await renamePage.locator('#tracks .track-name').first().textContent(),/優しい伴奏 🎵/);
  assert.equal(await renamePage.locator('#tracks article.track').first().getAttribute('data-id'),beforeRenameId);
  await renamePage.locator('[data-view="project"]').click();
  await renamePage.locator('#saveProject').click();
  await renamePage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  await renamePage.reload({waitUntil:'domcontentloaded'});
  await renamePage.locator('[data-view="project"]').click();
  await renamePage.locator('#loadProject').click();
  await renamePage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  assert.match(await renamePage.locator('#tracks .track-name').first().textContent(),/優しい伴奏 🎵/);
  assert.equal(await renamePage.locator('#tracks article.track').first().getAttribute('data-id'),beforeRenameId);
  await renamePage.locator('[data-view="edit"]').click();
  const gain=renamePage.locator('#tracks article.track').first().locator('[data-field="gain"]');
  await gain.evaluate(el=>{el.value='0.70';el.dispatchEvent(new Event('input',{bubbles:true}))});
  const start=renamePage.locator('#tracks article.track').first().locator('[data-field="start"]');
  await start.fill('0.3');
  await renamePage.locator('[data-view="project"]').click();
  await renamePage.locator('#saveProject').click();
  await renamePage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  await renamePage.reload({waitUntil:'domcontentloaded'});
  await renamePage.locator('[data-view="project"]').click();
  await renamePage.locator('#loadProject').click();
  await renamePage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  const savedTrack=renamePage.locator('#tracks article.track').first();
  assert.equal(await savedTrack.locator('[data-field="gain"]').inputValue(),'0.7');
  assert.equal(await savedTrack.locator('[data-field="start"]').inputValue(),'0.30');
  await renamePage.close();
  console.log('PASS manual track rename survives project save/reload with original audio identity');

  // Ensure manual melody, chord progression, and song form survive ordinary
  // local project save/reload alongside the audio editing workflow.
  const editorPage=await browser.newPage();
  await editorPage.goto(base,{waitUntil:'domcontentloaded'});
  await editorPage.waitForSelector('#loadProject',{state:'attached'});
  await editorPage.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const q=indexedDB.open('piyoko-music-v45',1);
      q.onupgradeneeded=()=>{
        if(!q.result.objectStoreNames.contains('projects'))q.result.createObjectStore('projects',{keyPath:'id'});
        if(!q.result.objectStoreNames.contains('blobs'))q.result.createObjectStore('blobs',{keyPath:'id'});
      };
      q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite');
      tx.objectStore('projects').put({id:'last',name:'Manual editor CI',tracks:[],manualEditor:{
        guideNotes:[{start:.2,duration:.3,midi:65}],
        chordProgression:[{root:0,suffix:'maj7'},{root:7,suffix:'m7'}],
        songForm:[{id:'ci-verse',name:'Aメロ',start:0,duration:4,power:.65}]
      }});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  });
  await editorPage.locator('[data-view="project"]').click();
  await editorPage.locator('#loadProject').click();
  await editorPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  assert.match(await editorPage.locator('#pianoRollInfo').textContent(),/1音/);
  assert.equal(await editorPage.locator('#chordProgression').inputValue(),'Cmaj7 | Gm7');
  assert.match(await editorPage.locator('#songFormView').textContent(),/Aメロ/);
  await editorPage.locator('#saveProject').click();
  await editorPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  await editorPage.reload({waitUntil:'domcontentloaded'});
  await editorPage.locator('[data-view="project"]').click();
  await editorPage.locator('#loadProject').click();
  await editorPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  assert.match(await editorPage.locator('#pianoRollInfo').textContent(),/1音/);
  assert.equal(await editorPage.locator('#chordProgression').inputValue(),'Cmaj7 | Gm7');
  assert.match(await editorPage.locator('#songFormView').textContent(),/Aメロ/);
  // A section title is plain user data. Even if a saved project contains
  // markup-shaped text, restoring it must never create HTML elements.
  await editorPage.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const q=indexedDB.open('piyoko-music-v45');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite'),q=tx.objectStore('projects').get('last');
      q.onsuccess=()=>{
        const record=q.result;
        record.manualEditor.songForm[0].name='<img src=x onerror=window.__sectionExecuted=1>';
        tx.objectStore('projects').put(record);
      };
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  });
  await editorPage.locator('#loadProject').click();
  await editorPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  assert.equal(await editorPage.locator('#songFormView img').count(),0);
  assert.match(await editorPage.locator('#songFormView').textContent(),/<img src=x/);
  assert.equal(await editorPage.evaluate(()=>window.__sectionExecuted),undefined);
  await editorPage.close();
  console.log('PASS guide melody / chord progression / song form persist across local save and names render as text');


  // Full portable backup is a single offline file with actual microphone
  // bytes, not just settings JSON; corruption must preserve current work.
  {
  const portablePage=await browser.newPage({acceptDownloads:true});
  const calls=[];portablePage.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/ace'))calls.push(r.url())});
  await portablePage.goto(base,{waitUntil:'domcontentloaded'});
  await portablePage.waitForSelector('#mainFile',{state:'attached'});
  await portablePage.locator('#mainFile').setInputFiles({name:'portable-backing.wav',mimeType:'audio/wav',buffer:backing});
  await portablePage.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('portable-backing'));
  await portablePage.locator('#vocalFile').setInputFiles({name:'portable-voice.wav',mimeType:'audio/wav',buffer:vocal});
  await portablePage.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('portable-voice'));
  const ids=await portablePage.locator('#tracks article.track').evaluateAll(nodes=>nodes.map(x=>x.dataset.id));
  await portablePage.locator('[data-view="project"]').click();
  await portablePage.locator('#projectName').fill('持ち運びの歌 🎤');
  const saving=portablePage.waitForEvent('download',{timeout:30000});
  await portablePage.locator('#exportPortableProject').click();
  const d=await saving;
  assert.match(d.suggestedFilename(),/\.asahi-music$/);
  const parts=[];for await(const p of await d.createReadStream())parts.push(p);
  const portableBytes=Buffer.concat(parts);
  assert.ok(portableBytes.length>backing.length+vocal.length);
  const inspected=await portablePage.evaluate(async raw=>{
    const parsed=await window.ASAHIMusicBackup.read(new Blob([Uint8Array.from(raw)]));
    return {name:parsed.project.name,ids:parsed.project.tracks.map(x=>x.id),
      lengths:await Promise.all(parsed.project.tracks.map(async x=>parsed.blobs.get(x.blobId)?.size||0))};
  },Array.from(portableBytes));
  assert.equal(inspected.name,'持ち運びの歌 🎤');
  assert.deepEqual(inspected.ids,ids);
  assert.deepEqual(inspected.lengths,[backing.length,vocal.length]);
  const damaged=Buffer.from(portableBytes);damaged[damaged.length-1]^=0x40;
  await portablePage.locator('#portableProjectFile').setInputFiles({name:'damaged.asahi-music',mimeType:'application/octet-stream',buffer:damaged});
  await portablePage.waitForFunction(()=>document.querySelector('#portableProjectStatus')?.textContent?.includes('CRCが一致'));
  assert.deepEqual(await portablePage.locator('#tracks article.track').evaluateAll(nodes=>nodes.map(x=>x.dataset.id)),ids);
  await portablePage.locator('[data-view="edit"]').click();
  await portablePage.locator('#tracks article.track').first().locator('[data-action="delete"]').click();
  assert.equal(await portablePage.locator('#tracks article.track').count(),1);
  await portablePage.locator('[data-view="project"]').click();
  portablePage.once('dialog',dialog=>dialog.accept());
  await portablePage.locator('#portableProjectFile').setInputFiles({name:'valid.asahi-music',mimeType:'application/octet-stream',buffer:portableBytes});
  await portablePage.waitForFunction(()=>document.querySelector('#portableProjectStatus')?.textContent?.includes('バックアップを復元しました'));
  assert.deepEqual(await portablePage.locator('#tracks article.track').evaluateAll(nodes=>nodes.map(x=>x.dataset.id)),ids);
  await portablePage.locator('#saveProject').click();
  await portablePage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  await portablePage.reload({waitUntil:'domcontentloaded'});
  await portablePage.locator('[data-view="project"]').click();
  await portablePage.locator('#loadProject').click();
  await portablePage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  assert.deepEqual(await portablePage.locator('#tracks article.track').evaluateAll(nodes=>nodes.map(x=>x.dataset.id)),ids);
  assert.equal(calls.length,0,'Portable backup must never contact ACE API');

  // Simulate importing on a different device with a fresh browser profile.
  // Import alone must NOT create local last/autosave even if pagehide fires.
  const separateContext=await browser.newContext({acceptDownloads:true});
  const transferPage=await separateContext.newPage();
  await transferPage.goto(base,{waitUntil:'domcontentloaded'});
  await transferPage.waitForSelector('#portableProjectFile',{state:'attached'});
  await transferPage.locator('[data-view="project"]').click();
  await transferPage.locator('#portableProjectFile').setInputFiles({name:'cross-device.asahi-music',mimeType:'application/octet-stream',buffer:portableBytes});
  await transferPage.waitForFunction(()=>document.querySelector('#portableProjectStatus')?.textContent?.includes('自動保存を停止中'));
  assert.deepEqual(await transferPage.locator('#tracks article.track').evaluateAll(nodes=>nodes.map(x=>x.dataset.id)),ids);
  await transferPage.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await transferPage.waitForTimeout(1500);
  const savedCounts=async()=>transferPage.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const q=indexedDB.open('piyoko-music-v45',1);
      q.onupgradeneeded=()=>{
        if(!q.result.objectStoreNames.contains('projects'))q.result.createObjectStore('projects',{keyPath:'id'});
        if(!q.result.objectStoreNames.contains('blobs'))q.result.createObjectStore('blobs',{keyPath:'id'});
      };
      q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    });
    const count=await new Promise((resolve,reject)=>{
      const tx=db.transaction(['projects','blobs'],'readonly');
      const projects=tx.objectStore('projects').count(),blobs=tx.objectStore('blobs').count();
      tx.oncomplete=()=>resolve({projects:projects.result,blobs:blobs.result});
      tx.onerror=()=>reject(tx.error);
    });
    db.close();return count;
  });
  assert.deepEqual(await savedCounts(),{projects:0,blobs:0},'Import alone must not persist private audio automatically');
  await transferPage.locator('#saveProject').click();
  await transferPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  const savedAfterConfirm=await savedCounts();
  assert.ok(savedAfterConfirm.projects>=1&&savedAfterConfirm.blobs===2,'Explicit manual save must persist both raw recordings');
  await transferPage.reload({waitUntil:'domcontentloaded'});
  await transferPage.locator('[data-view="project"]').click();
  await transferPage.locator('#loadProject').click();
  await transferPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  assert.deepEqual(await transferPage.locator('#tracks article.track').evaluateAll(nodes=>nodes.map(x=>x.dataset.id)),ids);
  await separateContext.close();
  console.log('PASS separate device import is transient until explicit save and recovers both audio tracks');

  // Regression: restore and re-save an arrangement-only portable project,
  // including per-track chords/tone/tempo that differ from global song settings.
  const arrangeContext=await browser.newContext();
  const arrangePage=await arrangeContext.newPage();
  await arrangePage.goto(base,{waitUntil:'domcontentloaded'});
  await arrangePage.waitForSelector('#portableProjectFile',{state:'attached'});
  const arrangementPortable=await arrangePage.evaluate(async()=>{
    const project={
      id:'portable',name:'Arrangement metadata CI 🎼',
      manualEditor:{guideNotes:[],chordProgression:[],songForm:[]},
      tracks:[{
        id:'ci-song-chords',name:'CHORDS Aメロ',type:'chord-design',
        gain:.55,pan:0,start:0,duration:2,fadeIn:0,fadeOut:0,
        chords:[{root:9,suffix:'m7'}],tone:'piano',beats:4,bpm:96,
        section:'Aメロ',style:'pop',power:.78
      }]
    };
    const file=await window.ASAHIMusicBackup.create({project,audio:[]});
    return Array.from(new Uint8Array(await file.arrayBuffer()));
  });
  await arrangePage.locator('[data-view="project"]').click();
  await arrangePage.locator('#portableProjectFile').setInputFiles({
    name:'arrangement.asahi-music',mimeType:'application/octet-stream',buffer:Buffer.from(arrangementPortable)
  });
  await arrangePage.waitForFunction(()=>document.querySelector('#portableProjectStatus')?.textContent?.includes('バックアップを復元しました'));
  assert.equal(await arrangePage.locator('#tracks article.track').count(),1);
  await arrangePage.locator('#saveProject').click();
  await arrangePage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  await arrangePage.reload({waitUntil:'domcontentloaded'});
  await arrangePage.locator('[data-view="project"]').click();
  await arrangePage.locator('#loadProject').click();
  await arrangePage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  const savedArrangement=await arrangePage.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('piyoko-music-v45');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
    const entry=await new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readonly'),q=tx.objectStore('projects').get('last');
      q.onsuccess=()=>resolve(q.result?.tracks?.[0]);q.onerror=()=>reject(q.error);
    });
    db.close();return entry;
  });
  assert.deepEqual(savedArrangement.chords,[{root:9,suffix:'m7'}]);
  assert.deepEqual([savedArrangement.tone,savedArrangement.beats,savedArrangement.bpm,savedArrangement.section,savedArrangement.style,savedArrangement.power],
    ['piano',4,96,'Aメロ','pop',.78]);
  await arrangeContext.close();
  console.log('PASS per-track arrangement parameters survive portable import, save and browser reload');

  await portablePage.close();
  console.log('PASS offline portable song export, checksum refusal, import and local save restore');
  }
  // A duplicated audio track points at the same raw Blob in memory but must
  // be saved under both distinct asset ids. Re-saving must not rewrite them.
  const duplicateContext=await browser.newContext();
  const duplicatePage=await duplicateContext.newPage();
  await duplicatePage.goto(base,{waitUntil:'domcontentloaded'});
  await duplicatePage.waitForSelector('#mainFile',{state:'attached'});
  await duplicatePage.locator('#mainFile').setInputFiles({name:'shared-original.wav',mimeType:'audio/wav',buffer:backing});
  await duplicatePage.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('shared-original'));
  await duplicatePage.locator('[data-view="edit"]').click();
  await duplicatePage.locator('#tracks article.track').first().locator('[data-action="duplicate"]').click();
  assert.equal(await duplicatePage.locator('#tracks article.track').count(),2);
  await duplicatePage.evaluate(()=>{
    const native=IDBObjectStore.prototype.put;
    window.__blobPutCount=0;
    IDBObjectStore.prototype.put=function(...args){
      if(this.name==='blobs')window.__blobPutCount++;
      return native.apply(this,args);
    };
  });
  await duplicatePage.locator('[data-view="project"]').click();
  await duplicatePage.locator('#saveProject').click();
  await duplicatePage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  const initialWrites=await duplicatePage.evaluate(()=>window.__blobPutCount);
  assert.equal(initialWrites,2,'Distinct duplicated track assets must both be persisted');
  await duplicatePage.locator('#saveProject').click();
  await duplicatePage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  assert.equal(await duplicatePage.evaluate(()=>window.__blobPutCount),2,'Repeated saves must not write both Blobs again');
  await duplicatePage.reload({waitUntil:'domcontentloaded'});
  await duplicatePage.locator('[data-view="project"]').click();
  await duplicatePage.locator('#loadProject').click();
  await duplicatePage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  assert.equal(await duplicatePage.locator('#tracks article.track').count(),2);
  await duplicateContext.close();
  console.log('PASS duplicated audio tracks persist separately without repeated Blob writes');


  // MUSIC-044: A synthetic saved humming guide must be omitted from MASTER by
  // default and rendered using the live synthesizer only after explicit opt-in.
  const guideContext=await browser.newContext({acceptDownloads:true});
  const guidePage=await guideContext.newPage();
  let guideAceRequests=0;
  guidePage.on('request',req=>{if(new URL(req.url()).pathname.startsWith('/api/ace'))guideAceRequests++});
  await guidePage.goto(base,{waitUntil:'domcontentloaded'});
  await guidePage.waitForSelector('#portableProjectFile',{state:'attached'});
  const guideBytes=await guidePage.evaluate(async()=>{
    const project={
      id:'portable',name:'Synthetic humming guide only',
      manualEditor:{guideNotes:[],chordProgression:[],songForm:[]},
      tracks:[{
        id:'guide-ci',name:'Humming Guide CI',type:'guide',
        gain:.85,pan:0,start:0,guideInstrument:'humming',mute:false,solo:false,
        notes:[
          {start:.12,duration:.30,midi:69,velocity:.95},
          {start:.48,duration:.30,midi:71,velocity:.95}
        ]
      }]
    };
    const file=await window.ASAHIMusicBackup.create({project,audio:[]});
    return Array.from(new Uint8Array(await file.arrayBuffer()));
  });
  await guidePage.locator('[data-view="project"]').click();
  await guidePage.locator('#portableProjectFile').setInputFiles({
    name:'humming-guide-ci.asahi-music',mimeType:'application/octet-stream',
    buffer:Buffer.from(guideBytes)
  });
  await guidePage.waitForFunction(()=>document.querySelector('#portableProjectStatus')?.textContent?.includes('バックアップを復元しました'));
  assert.equal(await guidePage.locator('#tracks article.track').count(),1);
  await guidePage.locator('[data-view="edit"]').click();
  assert.equal(await guidePage.locator('#masterIncludeGuide').isChecked(),false,'default MASTER excludes guides');
  await guidePage.locator('#exportMasterWav').click();
  await guidePage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('ミックスする音声または伴奏がありません'));
  await guidePage.evaluate(()=>{
    window.__offlineGuideOscillators=[];
    const start=OscillatorNode.prototype.start;
    OscillatorNode.prototype.start=function(...args){
      if(this.context instanceof OfflineAudioContext)
        window.__offlineGuideOscillators.push({frequency:this.frequency.value,start:args[0]});
      return start.apply(this,args);
    };
  });
  await guidePage.locator('#masterIncludeGuide').check();
  const hummingDownload=guidePage.waitForEvent('download',{timeout:30000});
  await guidePage.locator('#exportMasterWav').click();
  const guideFile=await hummingDownload;
  assert.match(guideFile.suggestedFilename(),/emuzii-master-.*\.wav/);
  const guideParts=[];
  for await(const piece of await guideFile.createReadStream())guideParts.push(piece);
  const guideWav=Buffer.concat(guideParts);
  const guideRmsA=rmsWav(guideWav,.2,.33),guideRmsB=rmsWav(guideWav,.57,.67),guideRest=rmsWav(guideWav,1.2,1.4);
  assert.ok(guideRmsA>.003&&guideRmsB>.003,'both humming notes must sound in MASTER');
  assert.ok(guideRest<.0005,'the exported guide must respect silence after the phrase');
  const offlineOscs=await guidePage.evaluate(()=>window.__offlineGuideOscillators);
  assert.ok(offlineOscs.some(x=>Math.abs(x.frequency-440)<4),'A4 fundamental must be exported');
  assert.ok(offlineOscs.some(x=>Math.abs(x.frequency-880)<8),'humming harmonics prove live timbre was used, not the legacy single oscillator');
  assert.equal(guideAceRequests,0,'offline MASTER export must make no external GPU calls');
  await guideContext.close();
  console.log('PASS opt-in MASTER exports the real humming instrument and preserves guide-off default');
  

  // MUSIC-045: the 5-second Safari/compat rendering path must preserve a
  // sustained humming tone across BOTH of its 5s and 10s WAV chunk seams.
  const longGuideContext=await browser.newContext();
  const longGuidePage=await longGuideContext.newPage();
  // MUSIC-058/059: observe phase-rotated LFOs and all five carrier harmonics in Chromium.
  await longGuidePage.addInitScript(()=>{
    window.__sustainedPhaseWaves=[];
    const original=OfflineAudioContext.prototype.createPeriodicWave;
    OfflineAudioContext.prototype.createPeriodicWave=function(real,imag,options){
      window.__sustainedPhaseWaves.push({real:real[1],imag:imag[1],normalized:!options?.disableNormalization});
      return original.call(this,real,imag,options);
    };
  });
  let longGuideAceCalls=0;
  longGuidePage.on('request',req=>{if(new URL(req.url()).pathname.startsWith('/api/ace'))longGuideAceCalls++});
  await longGuidePage.goto(base,{waitUntil:'domcontentloaded'});
  await longGuidePage.waitForSelector('#portableProjectFile',{state:'attached'});
  const longGuideBytes=await longGuidePage.evaluate(async()=>{
    const project={
      id:'portable',name:'Long humming chunk seam CI',
      manualEditor:{guideNotes:[],chordProgression:[],songForm:[]},
      tracks:[{
        id:'long-guide-ci',name:'Long humming guide',type:'guide',
        gain:.85,pan:0,start:0,duration:13,guideInstrument:'humming',
        mute:false,solo:false,
        notes:[
          {start:4.4,duration:7.0,midi:69,velocity:.9},
          {start:12.2,duration:.35,midi:72,velocity:.8},
          // MUSIC-061: 70ms between same-pitch syllables must stay quiet.
          {start:12.62,duration:.28,midi:72,velocity:.8}
        ]
      }]
    };
    const file=await window.ASAHIMusicBackup.create({project,audio:[]});
    return Array.from(new Uint8Array(await file.arrayBuffer()));
  });
  await longGuidePage.locator('[data-view="project"]').click();
  await longGuidePage.locator('#portableProjectFile').setInputFiles({
    name:'long-humming.asahi-music',mimeType:'application/octet-stream',
    buffer:Buffer.from(longGuideBytes)
  });
  await longGuidePage.waitForFunction(()=>document.querySelector('#portableProjectStatus')?.textContent?.includes('バックアップを復元しました'));
  await longGuidePage.locator('[data-view="edit"]').click();
  await longGuidePage.locator('#compatPlay').click();
  await longGuidePage.waitForFunction(()=>document.querySelector('#compatMeta')?.textContent?.includes('13.0秒'),{timeout:30000});
  const longGuideStats=await longGuidePage.evaluate(async()=>{
    const audio=document.querySelector('#compatAudio');
    const bytes=await (await fetch(audio.src)).arrayBuffer();
    const view=new DataView(bytes),rate=view.getUint32(24,true),channels=view.getUint16(22,true);
    const dataBytes=view.getUint32(40,true),frames=dataBytes/(channels*2);
    function rms(a,b){
      const from=Math.round(a*rate),to=Math.min(frames,Math.round(b*rate));let sum=0;
      for(let i=from;i<to;i++){const y=view.getInt16(44+i*channels*2,true)/32768;sum+=y*y;}
      return Math.sqrt(sum/Math.max(1,to-from));
    }
    return {rate,frames,seam5before:rms(4.92,4.98),seam5after:rms(5.02,5.08),seam10before:rms(9.92,9.98),seam10after:rms(10.02,10.08),body5:rms(4.7,4.8),body10:rms(9.5,9.6),rest:rms(11.7,12.0),tail:rms(12.27,12.37),repeatGap:rms(12.565,12.595),repeatAttack:rms(12.70,12.78),phaseWaves:window.__sustainedPhaseWaves};
  });
  assert.equal(longGuideStats.rate,44100);
  assert.equal(longGuideStats.frames,13*44100,'full WAV must have exact duration with no repeated/dropped overlap samples');
  assert.ok(longGuideStats.seam5before>.003&&longGuideStats.seam5after>.003);
  assert.ok(longGuideStats.seam10before>.003&&longGuideStats.seam10after>.003);
  assert.ok(longGuideStats.body5>.003&&longGuideStats.body10>.003,'the same sustained note must remain audible for over 5 seconds');
  assert.ok(longGuideStats.seam5before>longGuideStats.body5*.38&&longGuideStats.seam5after>longGuideStats.body5*.38,
    '5s WAV seam must not create a false release or retrigger dip inside the sustained vowel');
  assert.ok(longGuideStats.seam10before>longGuideStats.body10*.38&&longGuideStats.seam10after>longGuideStats.body10*.38,
    '10s WAV seam must not create a false release or retrigger dip inside the sustained vowel');
  assert.ok(longGuideStats.tail>.003,'late melody should not disappear in the final chunk');
  assert.ok(longGuideStats.rest<.0005,'a genuine breath/rest remains silent');
  assert.ok(longGuideStats.repeatGap<.0005,
    '70ms silence between repeated C5 syllables must not be filled by humming legato');
  assert.ok(longGuideStats.repeatAttack>.003,
    'the repeated note must reattack audibly after its preserved separation');
  assert.ok(longGuideStats.phaseWaves.length>=14,
    'each 5s/10s seam must rephase both vibrato LFOs and all five humming carrier harmonics');
  assert.ok(longGuideStats.phaseWaves.every(w=>!w.normalized&&Math.abs(w.real*w.real+w.imag*w.imag-1)<1e-5),
    'phase-corrected sine coefficient pairs preserve bounded 1x modulation gain');
  assert.ok(longGuideStats.phaseWaves.some(w=>Math.abs(w.real)>.1),
    'real browser must apply a nonzero source-relative oscillator phase');
  assert.equal(longGuideAceCalls,0,'local WAV rendering makes no generation requests');
  await longGuideContext.close();
  console.log('PASS 13-second Safari WAV keeps a 7s sustained humming vowel across 5s and 10s seams without false envelope drops');
  
  // MUSIC-064: two distinct three-syllable phrases cross 5s and 10s.
  // Repeated-pitch syllables intentionally do not receive pitch glides.
  // Compare equal positions within the syllables after actual 44.1kHz WAV
  // rendering: the middle syllable should be gently louder in BOTH phrases.
  const phraseContext=await browser.newContext();
  const phrasePage=await phraseContext.newPage();
  let phraseAceCalls=0;
  phrasePage.on('request',req=>{if(new URL(req.url()).pathname.startsWith('/api/ace'))phraseAceCalls++});
  await phrasePage.goto(base,{waitUntil:'domcontentloaded'});
  await phrasePage.waitForSelector('#portableProjectFile',{state:'attached'});
  const phraseBytes=await phrasePage.evaluate(async()=>{
    const mk=(start)=>[0,.38,.76].map(offset=>({
      start:start+offset,duration:.34,midi:69,velocity:.8
    }));
    const project={
      id:'portable',name:'MUSIC-064 phrase seam fixture',
      manualEditor:{guideNotes:[],chordProgression:[],songForm:[]},
      tracks:[{
        id:'phrase-seam-ci',name:'Connected humming phrases',
        type:'guide',gain:.85,pan:0,start:0,duration:13,guideInstrument:'humming',
        mute:false,solo:false,notes:[...mk(4.55),...mk(9.55)]
      }]
    };
    const file=await window.ASAHIMusicBackup.create({project,audio:[]});
    return Array.from(new Uint8Array(await file.arrayBuffer()));
  });
  await phrasePage.locator('[data-view="project"]').click();
  await phrasePage.locator('#portableProjectFile').setInputFiles({
    name:'phrase-seams.asahi-music',mimeType:'application/octet-stream',
    buffer:Buffer.from(phraseBytes)
  });
  await phrasePage.waitForFunction(()=>document.querySelector('#portableProjectStatus')?.textContent?.includes('バックアップを復元しました'));
  await phrasePage.locator('[data-view="edit"]').click();
  await phrasePage.locator('#compatPlay').click();
  await phrasePage.waitForFunction(()=>document.querySelector('#compatMeta')?.textContent?.includes('13.0秒'),{timeout:30000});
  const phraseStats=await phrasePage.evaluate(async()=>{
    const bytes=await (await fetch(document.querySelector('#compatAudio').src)).arrayBuffer();
    const dv=new DataView(bytes),rate=dv.getUint32(24,true),channels=dv.getUint16(22,true);
    const frames=dv.getUint32(40,true)/(channels*2);
    function rms(a,b){
      const from=Math.round(a*rate),to=Math.min(frames,Math.round(b*rate));let sum=0;
      for(let i=from;i<to;i++){const v=dv.getInt16(44+i*channels*2,true)/32768;sum+=v*v;}
      return Math.sqrt(sum/Math.max(1,to-from));
    }
    return {rate,frames,first:[rms(4.67,4.73),rms(5.05,5.11),rms(5.43,5.49)],
      second:[rms(9.67,9.73),rms(10.05,10.11),rms(10.43,10.49)],
      rest:rms(7,8),tail:rms(11.5,12)};
  });
  assert.equal(phraseStats.rate,44100);
  assert.equal(phraseStats.frames,13*44100,'WAV phrase seam export keeps the exact full project duration');
  for(const [i,phrase] of [phraseStats.first,phraseStats.second].entries()){
    assert.ok(phrase.every(v=>v>.003),'all three phrase notes remain audible on both sides of WAV seam '+i);
    assert.ok(phrase[1]>phrase[0]*1.01&&phrase[1]>phrase[2]*1.01,
      'the middle phrase syllable remains louder even when its envelope crosses WAV seam '+i);
    assert.ok(phrase[1]<Math.max(phrase[0],phrase[2])*1.30,
      'modest phrase dynamics cannot create an outlying loud syllable at WAV seam '+i);
  }
  assert.ok(phraseStats.rest<.0005&&phraseStats.tail<.0005,
    'true phrase rests and the final song tail must stay silent');
  assert.equal(phraseAceCalls,0,'local phrase WAV export must not use paid generation APIs');
  await phraseContext.close();
  console.log('PASS MUSIC-064 short humming phrase dynamics survive both 5s/10s WAV seams with rests intact');

  
  // MUSIC-046: actual guide extraction must recover deliberately changed
  // octaves after silence, not lock to an earlier note in the song.
  const pitchContext=await browser.newContext();
  const pitchPage=await pitchContext.newPage();
  const pitchErrors=[];pitchPage.on('pageerror',e=>pitchErrors.push(String(e)));
  await pitchPage.goto(base,{waitUntil:'domcontentloaded'});
  await pitchPage.waitForSelector('#vocalFile',{state:'attached'});
  await pitchPage.locator('[data-view="edit"]').click();
  await pitchPage.locator('#guideInstrument').selectOption('humming');
  await pitchPage.locator('#vocalFile').setInputFiles({
    name:'octave-phrase-ci.wav',mimeType:'audio/wav',buffer:syntheticPhraseWav()
  });
  await pitchPage.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('octave-phrase-ci'));
  await pitchPage.locator('#makeGuide').click();
  await pitchPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('✓ メロディ'),{timeout:30000});
  const extracted=await pitchPage.locator('#tracks article.track').filter({hasText:'MELODY GUIDE'}).locator('button.note-step').allTextContents();
  for(const expected of ['C4','C5','A4','A5'])
    assert.ok(extracted.includes(expected),'phrase-aware pitch analysis must recover '+expected+'; got '+JSON.stringify(extracted));
  assert.ok(extracted.length>=4&&extracted.length<=12,'guide should contain natural distinct phrases, not hundreds of spurious notes');
  assert.equal(await pitchPage.locator('#tracks article.track').count(),2,'keep the source vocal alongside the newly generated guide');
  assert.deepEqual(pitchErrors,[]);
  await pitchContext.close();
  console.log('PASS browser extracts C4/C5/A4/A5 after long silent breaths without octave lock');

  // MUSIC-047: harmonic/vibrato voice-like fixture with melodic octave leaps.
  const vibratoContext=await browser.newContext();
  const vibratoPage=await vibratoContext.newPage();
  const fixture=syntheticVibratoVocalWav();
  await vibratoPage.goto(base,{waitUntil:'domcontentloaded'});
  await vibratoPage.waitForSelector('#vocalFile',{state:'attached'});
  await vibratoPage.locator('[data-view="edit"]').click();
  await vibratoPage.locator('#guideInstrument').selectOption('humming');
  await vibratoPage.locator('#vocalFile').setInputFiles({
    name:'vibrato-harmonic-vocal.wav',mimeType:'audio/wav',buffer:fixture.wav
  });
  await vibratoPage.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('vibrato-harmonic-vocal'));
  await vibratoPage.locator('#makeGuide').click();
  await vibratoPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('✓ メロディ'),{timeout:45000});
  const vibratoNotes=await vibratoPage.locator('#tracks article.track').filter({hasText:'MELODY GUIDE'}).locator('button.note-step').allTextContents();
  const expected=['C4','D4','E4','G4','C5','A4','A5','E5','C5','A3','C4','A4'];
  let matched=0,searchFrom=0;
  for(const note of expected){
    const at=vibratoNotes.indexOf(note,searchFrom);
    if(at>=0){matched++;searchFrom=at+1;}
  }
  console.log('QUASI_VOCAL_NOTES',JSON.stringify({matched,vibratoNotes}));
  assert.ok(matched>=10,
    'quasi-vocal harmonic vibrato extraction should preserve at least 10 of 12 notes in order; matched '+matched+' notes: '+JSON.stringify(vibratoNotes));
  assert.ok(vibratoNotes.includes('A5')&&vibratoNotes.includes('A3'),'large range changes must survive without octave-locking');
  assert.ok(vibratoNotes.length<=22,'rests must not become hundreds of false note events');
  assert.equal(await vibratoPage.locator('#tracks article.track').count(),2);
  await vibratoContext.close();
  console.log('PASS quasi-vocal harmonic vibrato fixture extracted 12-note long-form melodic phrases');
  
  // MUSIC-048: the same 12-note melody with noisy consonant onsets and
  // unvoiced exhalation must not create false guide notes in the rests.
  const consonantContext=await browser.newContext();
  const consonantPage=await consonantContext.newPage();
  const noisy=syntheticBreathyConsonantWav();
  await consonantPage.goto(base,{waitUntil:'domcontentloaded'});
  await consonantPage.waitForSelector('#vocalFile',{state:'attached'});
  await consonantPage.locator('[data-view="edit"]').click();
  await consonantPage.locator('#guideInstrument').selectOption('humming');
  await consonantPage.locator('#vocalFile').setInputFiles({
    name:'breathy-consonants-ci.wav',mimeType:'audio/wav',buffer:noisy.wav
  });
  await consonantPage.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('breathy-consonants-ci'));
  await consonantPage.locator('#makeGuide').click();
  await consonantPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('✓ メロディ'),{timeout:45000});
  const consonantNotes=await consonantPage.locator('#tracks article.track').filter({hasText:'MELODY GUIDE'}).locator('button.note-step').allTextContents();
  const consonantExpected=['C4','D4','E4','G4','C5','A4','A5','E5','C5','A3','C4','A4'];
  const consonantTiming=await consonantPage.locator('#tracks article.track').filter({hasText:'MELODY GUIDE'}).locator('button.pr-note').evaluateAll(nodes=>nodes.map(n=>({midi:n.textContent,title:n.title})));
  const onsets=consonantTiming.map(note=>Number.parseFloat(note.title.split(' / ')[1]));
  const expectedOnsets=noisy.notes.map(n=>n.from);
  assert.equal(onsets.length,expectedOnsets.length,'source and extracted notes must align one-to-one');
  const timingErrors=onsets.map((onset,i)=>Math.abs(onset-expectedOnsets[i]));
  const averageOnsetError=timingErrors.reduce((a,b)=>a+b,0)/timingErrors.length;
  console.log('BREATHY_VOCAL_TIMING',JSON.stringify({onsets,expectedOnsets,averageOnsetError}));
  assert.ok(averageOnsetError<.02,'sung consonant note-on synchronization should average under 20ms, observed '+averageOnsetError);
  console.log('BREATHY_VOCAL_NOTES',JSON.stringify({consonantNotes,expected:consonantExpected}));
  assert.deepEqual(consonantNotes,consonantExpected,'consonant hiss, breath and noise must not create phantom pitches');
  assert.equal(await consonantPage.locator('#tracks article.track').count(),2,'raw synthetic source must remain alongside guide');
  await consonantContext.close();
  console.log('PASS consonant and breath-laden singer extracts 12 notes without extras');
  
  // MUSIC-049: 3m15s sparse song with an actual 100ms final sung note.
  // Input-only fixture; do not store or modify any existing project.
  const fullContext=await browser.newContext();
  const fullPage=await fullContext.newPage();
  const longVoice=syntheticFullLengthTailWav();
  let longAceRequests=0;
  fullPage.on('request',req=>{if(new URL(req.url()).pathname.startsWith('/api/ace'))longAceRequests++});
  await fullPage.goto(base,{waitUntil:'domcontentloaded'});
  await fullPage.waitForSelector('#vocalFile',{state:'attached'});
  await fullPage.locator('[data-view="edit"]').click();
  await fullPage.locator('#guideInstrument').selectOption('humming');
  await fullPage.locator('#vocalFile').setInputFiles({
    name:'195-second-sparse-tail.wav',mimeType:'audio/wav',buffer:longVoice.wav
  });
  await fullPage.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('195-second-sparse-tail'));
  await fullPage.locator('#makeGuide').click();
  await fullPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('✓ メロディ'),{timeout:90000});
  const fullNotes=await fullPage.locator('#tracks article.track').filter({hasText:'MELODY GUIDE'}).locator('button.pr-note').evaluateAll(nodes=>nodes.map(n=>({midi:n.textContent,title:n.title})));
  console.log('FULL_SONG_LAST_NOTES',JSON.stringify(fullNotes));
  assert.deepEqual(fullNotes.map(n=>n.midi),['C4','A4','E4','C5'],'the last sung 100ms C5 must not be omitted');
  const tail=fullNotes.at(-1),tailStart=Number.parseFloat(tail.title.split(' / ')[1]);
  const tailDuration=Number(tail.title.split(' / ')[2].replace('s',''));
  assert.ok(tailStart>=195.07&&tailStart<195.22,'last note must keep its actual near-end timestamp');
  assert.ok(tailStart+tailDuration<=195.23,'guide note must never extend beyond physical source duration');
  assert.equal(await fullPage.locator('#tracks article.track').count(),2);
  assert.equal(longAceRequests,0,'local 3-minute analysis must be offline');
  await fullContext.close();
  console.log('PASS 195-second full-song synthetic voice keeps its 100ms terminal note');
  
  // MUSIC-051: a reference backing track is intentionally leaked into the
  // vocal take with 25ms acoustic delay. Only explicit opt-in may subtract it.
  const bleedContext=await browser.newContext();
  const bleedPage=await bleedContext.newPage();
  const leaked=syntheticBackingBleedWavs();
  let bleedAceCalls=0;
  bleedPage.on('request',req=>{if(new URL(req.url()).pathname.startsWith('/api/ace'))bleedAceCalls++});
  await bleedPage.goto(base,{waitUntil:'domcontentloaded'});
  await bleedPage.waitForSelector('#mainFile',{state:'attached'});
  await bleedPage.locator('[data-view="edit"]').click();
  assert.equal(await bleedPage.locator('#guideBackingReference').isChecked(),false,'backing reference cancellation defaults OFF');
  await bleedPage.locator('#mainFile').setInputFiles({name:'backing-ref-ci.wav',mimeType:'audio/wav',buffer:leaked.backing});
  await bleedPage.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('backing-ref-ci'));
  await bleedPage.locator('#vocalFile').setInputFiles({name:'bleed-voice-ci.wav',mimeType:'audio/wav',buffer:leaked.vocal});
  await bleedPage.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('bleed-voice-ci'));
  assert.equal(await bleedPage.locator('#tracks article.track').count(),2,'backing and raw vocal remain separate original tracks');
  await bleedPage.locator('#guideBackingReference').check();
  await bleedPage.locator('#guideInstrument').selectOption('humming');
  await bleedPage.locator('#makeGuide').click();
  await bleedPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('伴奏漏れ補正あり'),{timeout:45000});
  const bleedNotes=await bleedPage.locator('#tracks article.track').filter({hasText:'MELODY GUIDE'}).locator('button.note-step').allTextContents();
  const expectedBleedNotes=['C4','D4','E4','G4','C5','A4','A5','E5','C5','A3','C4','A4'];
  console.log('BLEED_REFERENCE_NOTES',JSON.stringify({bleedNotes,expectedBleedNotes}));
  assert.deepEqual(bleedNotes,expectedBleedNotes,'opt-in 25ms-aligned reference cancellation preserves all 12 sung notes');
  assert.equal(await bleedPage.locator('#tracks article.track').count(),3,'both original audio tracks remain after guide creation');
  assert.equal(bleedAceCalls,0,'reference cancellation must remain completely offline');
  await bleedContext.close();
  console.log('PASS real Chromium reference cancels 25ms-delayed backing bleed without changing default');

  // MUSIC-052: the same singing changes monitor latency at 11s; the
  // calibration must work in BOTH halves rather than locking to one delay.
  const driftContext=await browser.newContext();
  const driftPage=await driftContext.newPage();
  const driftFixture=syntheticBackingBleedWavs({variableDelay:true});
  await driftPage.goto(base,{waitUntil:'domcontentloaded'});
  await driftPage.waitForSelector('#mainFile',{state:'attached'});
  await driftPage.locator('[data-view="edit"]').click();
  assert.equal(await driftPage.locator('#guideBackingReference').isChecked(),false,'delay compensation must be opt-in');
  await driftPage.locator('#mainFile').setInputFiles({name:'drift-backing-ci.wav',mimeType:'audio/wav',buffer:driftFixture.backing});
  await driftPage.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('drift-backing-ci'));
  await driftPage.locator('#vocalFile').setInputFiles({name:'drift-voice-ci.wav',mimeType:'audio/wav',buffer:driftFixture.vocal});
  await driftPage.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('drift-voice-ci'));
  await driftPage.locator('#guideBackingReference').check();
  await driftPage.locator('#guideInstrument').selectOption('humming');
  await driftPage.locator('#makeGuide').click();
  await driftPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('伴奏漏れ補正あり'),{timeout:45000});
  const driftNotes=await driftPage.locator('#tracks article.track').filter({hasText:'MELODY GUIDE'}).locator('button.note-step').allTextContents();
  const expectedDrift=['C4','D4','E4','G4','C5','A4','A5','E5','C5','A3','C4','A4'];
  console.log('DRIFT_VOCAL_NOTES',JSON.stringify({driftNotes,expectedDrift}));
  assert.deepEqual(driftNotes,expectedDrift,'18ms first half and 43ms second half must retain all 12 singing notes');
  assert.equal(await driftPage.locator('#tracks article.track').count(),3,'retain original reference and voice');
  await driftContext.close();
  console.log('PASS opt-in browser guide extraction tolerates changed backing latency mid-song');
  
  // MUSIC-053: a direct 25ms monitor leak has a distinct echo at 82ms.
  // A single reference offset leaves the echo in the recorded vocal.
  const reflectedContext=await browser.newContext();
  const reflectedPage=await reflectedContext.newPage();
  reflectedPage.on('console',message=>{
    if(message.text().includes('GUIDE_REFERENCE_DIAGNOSTIC'))console.log('REFLECTED_MODEL',message.text());
  });
  const reflected=syntheticBackingBleedWavs({shortEcho:true});
  await reflectedPage.goto(base,{waitUntil:'domcontentloaded'});
  await reflectedPage.waitForSelector('#mainFile',{state:'attached'});
  await reflectedPage.locator('[data-view="edit"]').click();
  assert.equal(await reflectedPage.locator('#guideBackingReference').isChecked(),false);
  await reflectedPage.locator('#mainFile').setInputFiles({name:'echo-backing-ci.wav',mimeType:'audio/wav',buffer:reflected.backing});
  await reflectedPage.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('echo-backing-ci'));
  await reflectedPage.locator('#vocalFile').setInputFiles({name:'echo-vocal-ci.wav',mimeType:'audio/wav',buffer:reflected.vocal});
  await reflectedPage.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('echo-vocal-ci'));
  await reflectedPage.locator('#guideBackingReference').check();
  await reflectedPage.locator('#guideInstrument').selectOption('humming');
  await reflectedPage.locator('#makeGuide').click();
  await reflectedPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('伴奏漏れ補正あり'),{timeout:45000});
  const reflectedNotes=await reflectedPage.locator('#tracks article.track').filter({hasText:'MELODY GUIDE'}).locator('button.note-step').allTextContents();
  console.log('REFLECTED_BLEED_NOTES',JSON.stringify(reflectedNotes));
  assert.deepEqual(reflectedNotes,['C4','D4','E4','G4','C5','A4','A5','E5','C5','A3','C4','A4'],
    'direct+reflected monitor accompaniment must leave the clean 12-note vocal guide');
  assert.equal(await reflectedPage.locator('#tracks article.track').count(),3,'the input voice and backing must both be preserved');
  await reflectedContext.close();
  console.log('PASS browser reflected 82ms monitor echo remains out of twelve-note singing guide');
  
  assert.deepEqual(errors,[],'No page errors during real WAV render');
  console.log('PASS actual Chromium multi-track MASTER WAV export contains backing and vocal');
}finally{
  if(browser)await browser.close().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
}
