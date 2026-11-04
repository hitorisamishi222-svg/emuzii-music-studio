import test from 'node:test';
import assert from 'node:assert/strict';
await import('../integration/music-portable-bundle.js');
const bundle=globalThis.ASAHIMusicBundle;
const source=()=>{
  const project={id:'portable',name:'手作りの歌 🎶',asahiSongId:'SONG-Q',asahiTakeName:'TAKE-3',
    tracks:[{id:'backing',name:'伴奏',type:'backing',blobId:'asset:backing',start:-.2,gain:.7},
            {id:'voice',name:'歌声',type:'vocal',blobId:'asset:voice',start:.25,recordTrimStartSec:.3}],
    manualEditor:{guideNotes:[{start:0,duration:.3,midi:64}],chordProgression:[{root:0,suffix:'maj7'}],
      songForm:[{name:'Aメロ',start:0,duration:4,power:.6}]}};
  const assets=[{id:'asset:backing',blob:new Blob([new Uint8Array([0,1,2,254,255])],{type:'audio/wav'})},
    {id:'asset:voice',blob:new Blob([new Uint8Array([1,2,3,4,5,6,7,8])],{type:'audio/webm'})}];
  return {project,assets};
};
test('pack and unpack preserves raw audio, song identity, and manual editor data',async()=>{
  const original=source(),snapshot=structuredClone(original.project);
  const packed=await bundle.pack(original),unpacked=await bundle.unpack(packed);
  assert.deepEqual(original.project,snapshot);
  assert.deepEqual(unpacked.project,snapshot);
  assert.deepEqual(unpacked.assets.map(a=>a.id),original.assets.map(a=>a.id));
  for(let i=0;i<original.assets.length;i++){
    assert.deepEqual(Array.from(new Uint8Array(await unpacked.assets[i].blob.arrayBuffer())),
      Array.from(new Uint8Array(await original.assets[i].blob.arrayBuffer())));
    assert.equal(unpacked.assets[i].blob.type,original.assets[i].blob.type);
  }
});
test('tampered, truncated, and appended payloads fail without returning partial data',async()=>{
  const packed=await bundle.pack(source()),original=new Uint8Array(await packed.arrayBuffer());
  const tampered=original.slice();tampered[tampered.length-1]^=0xff;
  await assert.rejects(()=>bundle.unpack(new Blob([tampered])),/検査値が一致/);
  await assert.rejects(()=>bundle.unpack(new Blob([original.slice(0,-1)])),/長さが不正/);
  await assert.rejects(()=>bundle.unpack(new Blob([original,new Uint8Array([1])])),/長さが不正/);
});
test('unknown format and bad header length fail closed',async()=>{
  const bytes=new Uint8Array(await (await bundle.pack(source())).arrayBuffer());
  const badMagic=bytes.slice();badMagic[0]=0;
  await assert.rejects(()=>bundle.unpack(new Blob([badMagic])),/対応していない/);
  const badSize=bytes.slice();new DataView(badSize.buffer).setUint32(22,0xffffffff,true);
  await assert.rejects(()=>bundle.unpack(new Blob([badSize])),/破損/);
});
test('audio references must be exact and unique',async()=>{
  const a=source();a.assets.pop();
  await assert.rejects(()=>bundle.pack(a),/揃っていません/);
  const b=source();b.assets[1].id=b.assets[0].id;
  await assert.rejects(()=>bundle.pack(b),/不正/);
  const c=source();c.project.tracks[1].id='backing';
  await assert.rejects(()=>bundle.pack(c),/重複/);
});

test('rejects a bundle above total capacity before hashing any audio bytes',async()=>{
  class MetadataOnlyBlob extends Blob{
    get size(){return 200*1024*1024}
    async arrayBuffer(){throw Error('SHA-256 ran before capacity preflight')}
  }
  const project={id:'oversize',tracks:Array.from({length:4},(_,i)=>({id:'track-'+i,blobId:'asset:'+i}))};
  const assets=Array.from({length:4},(_,i)=>({id:'asset:'+i,blob:new MetadataOnlyBlob([Uint8Array.of(i)])}));
  await assert.rejects(()=>bundle.pack({project,assets}),/合計音源容量が上限/);
});
