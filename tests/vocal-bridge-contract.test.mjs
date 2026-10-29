import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const app=fs.readFileSync(path.join(root,'app-v10.3.2.html'),'utf8');
const vocal=fs.readFileSync(path.join(root,'vocal/index.html'),'utf8');
const loader=fs.readFileSync(path.join(root,'v104-loader.js'),'utf8');

const check=(condition,label)=>{assert.ok(condition,label);console.log('PASS',label)};
const has=(source,needle,label)=>check(source.includes(needle),label);
const matches=(source,re,label)=>check(re.test(source),label);

has(app,'emuzii MUSIC STUDIO v10.9.13 DEV','Studio development version is v10.9.13');
has(vocal,'ASAHI 歌入れサポート v0.20.5','Vocal development version is v0.20.5');
has(loader,'asahi-project-reader.js?v=1202','Loader cache-busts ASAHIProjectReader v1.1.1');

for(const [source,label] of [[app,'Studio'],[vocal,'Vocal']]){
  has(source,'asahi-vocal-handoff-v1',label+' uses shared handoff database');
  has(source,'handoffs',label+' uses shared handoff store');
}
matches(app,/kind\s*:\s*["']to-vocal["']/,'Studio creates to-vocal handoff');
has(app,'sourceStartSec:timing.sourceStartSec','Studio sends sourceStartSec');
has(app,'offsetSeconds:timing.offsetSeconds','Studio sends offsetSeconds');
has(app,'backingBlob:backingTrack?.blob||null','Studio sends backing Blob when available');
has(app,'new URL("./vocal/",location.href)','Studio opens same-origin Vocal route');
has(app,'target.searchParams.set("handoff",token)','Studio passes handoff token');

has(vocal,"row.kind!=='to-vocal'",'Vocal accepts only to-vocal launch handoff');
has(vocal,'crossTabDiagnosticRequested','Vocal tracks real child-tab diagnostic launch');
has(vocal,'if(!crossTabDiagnosticRequested)await recoverInterruptedRecording()','Diagnostic launch does not touch real interrupted recording');
has(vocal,"kind:'to-studio'",'Vocal creates to-studio return handoff');
has(vocal,"window.opener.postMessage({type:'ASAHI_VOCAL_RETURN',token}",'Vocal notifies original Studio tab');
has(vocal,"data.type!=='ASAHI_VOCAL_RETURN_ACK'",'Vocal validates Studio ACK');
has(vocal,'try{window.close()}catch(e){}','Vocal closes child tab after successful ACK');

has(app,'data.type!=="ASAHI_VOCAL_RETURN"','Studio validates Vocal return message type');
has(app,'returnRow.kind==="to-studio"','Studio validates to-studio return handoff');
has(app,'ASAHI_VOCAL_RETURN_ACK','Studio sends return ACK');
has(app,'event.origin!==location.origin','Studio rejects cross-origin return messages');
has(app,'event.source!==ctx.child','Diagnostic accepts return only from the opened Vocal tab');

has(app,'placement=start+offset','Studio places vocal at sourceStartSec + offsetSeconds');
has(app,'Number(returned.start)-3.10','Studio diagnostic verifies 3.10-second placement');
has(app,'vocalCrc32===incomingVocalCrc','Studio blocks duplicate audio by CRC within SONG ID');
has(app,'existing-take','Studio preserves timing from an existing ASAHI TAKE');
has(app,'expiresAt:Date.now()+6*60*60*1000','Studio handoff has six-hour expiry');
has(vocal,'cleanupExpiredAsahiHandoffs','Vocal cleans expired handoff rows');
has(vocal,"u.searchParams.delete('handoff')",'Vocal removes consumed handoff token from URL');

has(app,'🪟 実タブ往復診断','Studio exposes real child-tab roundtrip diagnostic');
has(vocal,'実タブ往復診断：本物の中断録音には触れず','Vocal diagnostic is isolated from real recovery');
has(app,'既存ガイド/他トラックが変化しました','Studio diagnostic protects pre-existing tracks');

await import('../integration/asahi-project-reader.js');
const reader=globalThis.ASAHIProjectReader;
check(reader?.version==='1.1.1','ASAHIProjectReader v1.1.1 loaded');

const encoder=new TextEncoder();
const MAGIC=encoder.encode('ASAHI-PROJECT-V1\n');
const table=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0}return t})();
async function crc32(blob){
  let c=0xffffffff;
  const bytes=new Uint8Array(await blob.arrayBuffer());
  for(const b of bytes)c=table[(c^b)&255]^(c>>>8);
  return ((c^0xffffffff)>>>0).toString(16).padStart(8,'0');
}
async function makePack({legacy=false}={}){
  const vocalBlob=new Blob([Uint8Array.from([1,2,3,4,5,6,7,8])],{type:'audio/wav'});
  const backingBlob=new Blob([Uint8Array.from([9,10,11,12,13,14])],{type:'audio/wav'});
  const metadata={
    schema:'asahi-vocal-take-v1',
    songId:'SONG-CI-0001',
    takeName:'日本語TAKE_CI',
    offsetSeconds:-0.15,
    sourceStartSec:3.25,
    recordingMode:'mix'
  };
  if(legacy)delete metadata.sourceStartSec;
  const manifest={
    schema:'asahi-vocal-project-v1',
    metadata,
    vocal:{name:'日本語TAKE_CI-vocal.wav',mimeType:vocalBlob.type,size:vocalBlob.size,crc32:await crc32(vocalBlob)},
    backing:{name:'伴奏_CI.wav',mimeType:backingBlob.type,size:backingBlob.size,crc32:await crc32(backingBlob)}
  };
  const head=encoder.encode(JSON.stringify(manifest));
  const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,head.byteLength,true);
  return new Blob([MAGIC,size,head,vocalBlob,backingBlob],{type:'application/octet-stream'});
}

const pack=await makePack();
const parsed=await reader.read(pack);
check(parsed.metadata.songId==='SONG-CI-0001','Reader preserves SONG ID');
check(parsed.metadata.takeName==='日本語TAKE_CI','Reader preserves Japanese TAKE name');
check(Math.abs(parsed.metadata.sourceStartSec-3.25)<1e-9,'Reader preserves sourceStartSec');
check(Math.abs(parsed.metadata.offsetSeconds+0.15)<1e-9,'Reader preserves negative offsetSeconds');
check(parsed.vocalBlob.size===8&&parsed.backingBlob.size===6,'Reader preserves original audio byte sizes');

const legacy=await reader.read(await makePack({legacy:true}));
check(legacy.metadata.sourceStartSec===0,'Reader defaults legacy sourceStartSec to zero');

async function makeInvalidStartPack(value){
  const vocalBlob=new Blob([Uint8Array.from([1,2,3])],{type:'audio/wav'});
  const metadata={schema:'asahi-vocal-take-v1',songId:'SONG-CI-BAD',takeName:'bad-start',offsetSeconds:0,sourceStartSec:value,recordingMode:'mic'};
  const manifest={schema:'asahi-vocal-project-v1',metadata,vocal:{name:'v.wav',mimeType:vocalBlob.type,size:vocalBlob.size,crc32:await crc32(vocalBlob)},backing:null};
  const head=encoder.encode(JSON.stringify(manifest));
  const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,head.byteLength,true);
  return new Blob([MAGIC,size,head,vocalBlob],{type:'application/octet-stream'});
}
await assert.rejects(async()=>reader.read(await makeInvalidStartPack(-0.05)),/録音開始位置/);
console.log('PASS Reader rejects negative sourceStartSec');
await assert.rejects(async()=>reader.read(await makeInvalidStartPack(7200.05)),/録音開始位置/);
console.log('PASS Reader rejects sourceStartSec above 7200 seconds');
await assert.rejects(async()=>reader.read(await makeInvalidStartPack(1.03)),/録音開始位置/);
console.log('PASS Reader rejects sourceStartSec outside 0.05-second grid');

const badBytes=new Uint8Array(await pack.arrayBuffer());
badBytes[badBytes.length-1]^=0xff;
await assert.rejects(()=>reader.read(new Blob([badBytes])),/破損/);
console.log('PASS Reader rejects CRC-corrupted audio');

console.log('ALL VOCAL BRIDGE CONTRACT TESTS PASS');
