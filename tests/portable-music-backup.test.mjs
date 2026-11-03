import test from 'node:test';
import assert from 'node:assert/strict';
await import('../integration/portable-music-backup.js');
const api=globalThis.ASAHIMusicBackup;
const bytes=blob=>blob.arrayBuffer().then(x=>Array.from(new Uint8Array(x)));
function sample(){
  const voice=new Blob([Uint8Array.from([1,2,0,255,56])],{type:'audio/wav'});
  const backing=new Blob([Uint8Array.from([9,8,7,6,5,4,3])],{type:'audio/wav'});
  return {
    project:{id:'last',name:'夜の歌 🎵',version:'10.9.16',asahiSongId:'SONG-日本語',
      asahiTakeName:'TAKE-1',manualEditor:{
        guideNotes:[{start:0,duration:.3,midi:64}],
        chordProgression:[{root:9,suffix:'m7'}],
        songForm:[{id:'a',name:'Verse',start:0,duration:4,power:.8}]},
      tracks:[
        {id:'voice',type:'vocal',name:'歌声 🎤',blobId:'asset:voice',recordTrimStartSec:.1,start:-.05},
        {id:'back',type:'backing',name:'伴奏',blobId:'asset:back',start:0},
        {id:'synth',type:'guide',name:'ガイド',blobId:null,notes:[{start:0,duration:.3,midi:64}]}
      ]},
    audio:[{id:'asset:voice',blob:voice},{id:'asset:back',blob:back}],
    voice,backing
  };
}
test('offline portable export/import preserves every raw audio byte and song editing field',async()=>{
  const s=sample(),original=structuredClone(s.project);
  const file=await api.create(s);
  const result=await api.read(file);
  assert.deepEqual(result.project,original);
  assert.deepEqual(await bytes(result.blobs.get('asset:voice')),await bytes(s.voice));
  assert.deepEqual(await bytes(result.blobs.get('asset:back')),await bytes(s.backing));
  assert.equal(result.project.manualEditor.chordProgression[0].suffix,'m7');
  assert.equal(result.project.tracks[0].recordTrimStartSec,.1);
  assert.deepEqual(s.project,original);
});
test('corrupted payload, truncated file and extra trailer are all rejected',async()=>{
  const s=sample(),file=await api.create(s),raw=new Uint8Array(await file.arrayBuffer());
  const flipped=raw.slice();flipped[flipped.length-2]^=0x40;
  await assert.rejects(()=>api.read(new Blob([flipped])),/CRCが一致/);
  await assert.rejects(()=>api.read(file.slice(0,file.size-1)),/途中で切れています/);
  await assert.rejects(()=>api.read(new Blob([file,Uint8Array.of(19)])),/余分なデータ/);
});
test('damaged header or manifest is rejected before any audio is exposed',async()=>{
  const file=await api.create(sample()),raw=new Uint8Array(await file.arrayBuffer());
  const m=raw.slice();m[0]^=0x08;
  await assert.rejects(()=>api.read(new Blob([m])),/未対応/);
  const len=raw.slice();const offset=new TextEncoder().encode('ASAHI-MUSIC-BACKUP-V1\n').length;
  new DataView(len.buffer).setUint32(offset,0xffffffff,true);
  await assert.rejects(()=>api.read(new Blob([len])),/管理情報の長さ/);
  const changed=raw.slice();changed[offset+8+4]^=1;
  await assert.rejects(()=>api.read(new Blob([changed])),/管理情報のCRC/);
});
test('missing, extra, duplicated audio references cannot be exported',async()=>{
  const s=sample();
  await assert.rejects(()=>api.create({project:s.project,audio:[s.audio[0]]}),/音声の数/);
  await assert.rejects(()=>api.create({project:s.project,audio:[s.audio[0],s.audio[0]]}),/重複/);
  await assert.rejects(()=>api.create({project:s.project,audio:[s.audio[0],{id:'asset:bad',blob:s.backing}]}),/欠損/);
});
test('audio-free synthetic arrangement can be backed up without network',async()=>{
  const project={id:'last',tracks:[{id:'synth',type:'guide',notes:[{start:0,duration:1,midi:60}],blobId:null}]};
  const file=await api.create({project,audio:[]}),loaded=await api.read(file);
  assert.deepEqual(loaded.project,project);
  assert.equal(loaded.blobs.size,0);
});
