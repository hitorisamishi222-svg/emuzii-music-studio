import test from 'node:test';
import assert from 'node:assert/strict';
await import('../integration/asahi-project-reader.js');
const read=globalThis.ASAHIProjectReader.read;
const enc=new TextEncoder(),MAGIC=enc.encode('ASAHI-PROJECT-V1\n');
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return ((c^0xffffffff)>>>0).toString(16).padStart(8,'0')}
function pack({mode='both',change=()=>{},extra=new Uint8Array(0)}={}){
 const vocal=Uint8Array.from([1,2,3,4,5,6]),backing=Uint8Array.from([7,8,9]);
 const meta={schema:'asahi-vocal-take-v1',songId:'SONG-保護-CI',takeName:'歌のTAKE🎤',offsetSeconds:-0.1,sourceStartSec:1.25,recordingMode:'mix'};
 const manifest={schema:'asahi-vocal-project-v1',metadata:meta,vocal:mode==='backing'||mode==='empty'?null:{name:'voice.wav',mimeType:'audio/wav',size:vocal.length,crc32:crc(vocal)},backing:mode==='vocal'||mode==='empty'?null:{name:'伴奏.wav',mimeType:'audio/wav',size:backing.length,crc32:crc(backing)}};
 change(manifest);
 const head=enc.encode(JSON.stringify(manifest)),length=new Uint8Array(4);
 new DataView(length.buffer).setUint32(0,head.length,true);
 return new Blob([MAGIC,length,head,...(manifest.vocal?[vocal]:[]),...(manifest.backing?[backing]:[]),extra]);
}
test('Japanese SONG/TAKE and original audio bytes survive read without editing',async()=>{
 const b=pack(),out=await read(b);
 assert.equal(out.metadata.songId,'SONG-保護-CI');assert.equal(out.metadata.takeName,'歌のTAKE🎤');
 assert.equal(out.metadata.sourceStartSec,1.25);assert.equal(out.metadata.offsetSeconds,-0.1);
 assert.deepEqual(Array.from(new Uint8Array(await out.vocalBlob.arrayBuffer())),[1,2,3,4,5,6]);
 assert.equal(b.size,pack().size);
});
test('legacy project without start position uses zero',async()=>{
 const out=await read(pack({change:m=>delete m.metadata.sourceStartSec}));assert.equal(out.metadata.sourceStartSec,0);
});
test('valid vocal-only and backing-only projects are accepted',async()=>{
 const voice=await read(pack({mode:'vocal'})),backing=await read(pack({mode:'backing'}));
 assert.equal(voice.vocalBlob.size,6);assert.equal(voice.backingBlob,null);
 assert.equal(backing.vocalBlob,null);assert.equal(backing.backingBlob.size,3);
});
test('empty song project is rejected',async()=>{
 await assert.rejects(()=>read(pack({mode:'empty'})),/歌声と伴奏がありません/);
});
test('unsupported metadata schema and recording mode are rejected',async()=>{
 await assert.rejects(()=>read(pack({change:m=>m.metadata.schema='unsupported'})),/バージョン/);
 await assert.rejects(()=>read(pack({change:m=>m.metadata.recordingMode='invalid'})),/録音モード/);
});
test('out-of-range offsets are rejected',async()=>{
 await assert.rejects(()=>read(pack({change:m=>m.metadata.offsetSeconds=-3.01})),/補正値/);
 await assert.rejects(()=>read(pack({change:m=>m.metadata.offsetSeconds=3.01})),/補正値/);
});
test('oversized or truncated payload declarations are rejected',async()=>{
 await assert.rejects(()=>read(pack({change:m=>m.vocal.size=999})),/途中で切れています/);
 const bytes=new Uint8Array(await pack().arrayBuffer());
 new DataView(bytes.buffer).setUint32(MAGIC.length,65537,true);
 await assert.rejects(()=>read(new Blob([bytes])),/管理情報/);
});
test('unsupported header and extra trailing bytes are rejected',async()=>{
 const broken=new Uint8Array(await pack().arrayBuffer());broken[0]=0;
 await assert.rejects(()=>read(new Blob([broken])),/未対応/);
 await assert.rejects(()=>read(pack({extra:Uint8Array.from([77])})),/余分なデータ/);
});
