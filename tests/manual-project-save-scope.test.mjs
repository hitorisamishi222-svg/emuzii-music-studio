import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app-v10.3.2.html',import.meta.url),'utf8');
function section(start,end){const a=app.indexOf(start),b=app.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return app.slice(a,b)}
test('advanced export is clearly labeled as settings JSON without audio',()=>{
  assert.match(app,/💾 編集設定JSON保存/);
  assert.match(app,/📂 編集設定JSON読込/);
  assert.match(app,/歌声・伴奏・録音などの音源は含みません/);
  assert.match(app,/音源は「保存」→「編集状態を保存」/);
});
test('settings JSON serializer does not falsely claim to include track blobs',()=>{
  const s=section('function v8ProjectData(){','function saveV8ProjectFile(){');
  assert.match(s,/format:"emuzii_PROJECT"/);
  assert.doesNotMatch(s,/\btracks\s*:/);
  assert.doesNotMatch(s,/\bblob\s*:/);
  assert.match(app,/編集設定JSONを保存しました（音源は含みません）/);
});
test('local project save still persists audio blobs and does not depend on settings JSON',()=>{
  const s=section('async function persistTrackBlob(t){','function scheduleAutoSave(');
  assert.match(s,/idbPut\("blobs",\{id:blobId,blob:t\.blob\}\)/);
  assert.match(s,/async function persistProject\(id/);
  assert.match(s,/音源を含めて端末に保存しました/);
  assert.doesNotMatch(s,/v8ProjectData\(/);
});
test('broken audio backup refuses restore before changing current tracks',async()=>{
  const s=section('function normalizeSavedTrack(m){','async function saveProject(){');
  const existing=[{id:'current',name:'Live take',gain:1}];
  const state={tracks:existing};
  const restore=(new Function('idbGet','decodeBlob','state','setStatus','DB_NAME',s+';return restoreProjectRecord;'))(
    async()=>null,async()=>null,state,()=>{},'piyoko-music-v45'
  );
  const project={tracks:[{id:'bad',name:'Missing WAV',type:'vocal',blobId:'asset:not-found'}]};
  await assert.rejects(()=>restore(project),/見つかりません/);
  assert.equal(state.tracks,existing,'The existing track array must not be replaced');
  await assert.rejects(()=>restore({}),/一覧が不正/);
  assert.equal(state.tracks,existing);
});
test('failed audio decode refuses restore before editing current work',async()=>{
  const s=section('function normalizeSavedTrack(m){','async function saveProject(){');
  const existing=[{id:'current'}],state={tracks:existing};
  const restore=(new Function('idbGet','decodeBlob','state','setStatus','DB_NAME',s+';return restoreProjectRecord;'))(
    async()=>({blob:new Blob([Uint8Array.from([1,2,3])])}),async()=>null,state,()=>{},'piyoko-music-v45'
  );
  await assert.rejects(()=>restore({tracks:[{id:'bad',type:'vocal',blobId:'asset:bad'}]}),/復号できません/);
  assert.equal(state.tracks,existing);
});
test('audio references are scoped to the current database, not legacy pointers',async()=>{
  const s=section('async function persistTrackBlob(t){','async function makeProjectRecord(id){');
  const rows=[],cache=new WeakMap();
  const persist=(new Function('idbPut','persistedBlobRefs','audioStorageGeneration',s+';return persistTrackBlob;'))(
    async(store,row)=>{rows.push({store,row})},cache,0
  );
  const current={id:'legacy-take',blob:new Blob([Uint8Array.from([1,2,3])]),_blobId:'asset:legacy-take'};
  assert.equal(await persist(current),'asset:legacy-take');
  assert.equal(rows.length,1,'old _blobId alone does not skip saving audio');
  await persist(current);
  assert.equal(rows.length,1,'unchanged audio not re-written during autosave');
});
test('deleted storage invalidates cached audio even with same blob reference',async()=>{
  const s=section('async function persistTrackBlob(t){','async function makeProjectRecord(id){');
  const rows=[],cache=new WeakMap(),blob=new Blob(['recording']);
  let generation=0;
  const make=(gen)=>(new Function('idbPut','persistedBlobRefs','audioStorageGeneration',s+';return persistTrackBlob;'))(
    async(store,row)=>rows.push(row),cache,gen
  );
  const audio={id:'take-1',blob};
  await make(generation)(audio);
  assert.equal(rows.length,1);
  generation++;
  await make(generation)(audio);
  assert.equal(rows.length,2,'deleted destination must be re-populated');
});
test('autosave is suspended after explicit delete until manual save',()=>{
  const s=section('async function persistProject(id,','async function restoreProjectRecord(p,');
  assert.match(s,/autoSaveSuspended/);
  assert.match(s,/queueProjectWrite/);
  assert.match(s,/if\(id==="last"\)/);
  assert.match(app,/audioStorageGeneration\+\+/);
  assert.match(app,/自動保存停止中/);
});
test('raw vocal count-in trim is persisted as metadata and restored safely',()=>{
  const capture=section('recorder.onstop=async()=>{','recorder.start(200);');
  assert.match(capture,/recordTrimStartSec=type==="vocal"/);
  assert.match(capture,/buffer=trimBuffer\(buffer,recordTrimStartSec\)/);
  assert.match(capture,/type,buffer,blob,recordTrimStartSec/);
  const serialized=section('async function makeProjectRecord(id){','async function persistProject(id,');
  assert.match(serialized,/recordTrimStartSec:Number\.isFinite/);
  const restore=section('function normalizeSavedTrack(m){','async function saveProject(){');
  assert.match(restore,/Number\(m\.recordTrimStartSec\?\?0\)/);
  assert.match(restore,/trimBuffer\(decoded,trim\)/);
  assert.match(restore,/トリム位置が不正です/);
});
test('deleted tracks have a session undo with project-switch guard',()=>{
  const helpers=section('function updateTrackDeleteUndo(){','function renderTracks() {');
  assert.match(helpers,/deletedTrackStack\.push\(\{track,index\}\)/);
  assert.match(helpers,/state\.tracks\.splice\(Math\.min\(last\.index,state\.tracks\.length\),0,last\.track\)/);
  assert.match(app,/id="undoTrackDelete"/);
  assert.match(app,/state\.deletedTrackStack=\[\];state\.guideWave/);
  assert.match(app,/state\.deletedTrackStack=\[\];renderTracks\(\)/);
});
test('legacy track fields normalize without losing the source identifiers',()=>{
  const part=section('function normalizeSavedTrack(m){','async function restoreProjectRecord(p,');
  const normalize=(new Function(part+';return normalizeSavedTrack;'))();
  const result=normalize({id:'old-v43-take',name:'Old voice',type:'vocal',blobId:'asset:old-v43-take'});
  assert.equal(result.id,'old-v43-take');
  assert.equal(result.blobId,'asset:old-v43-take');
  assert.deepEqual([result.gain,result.pan,result.start,result.fadeIn,result.fadeOut],[1,0,0,0,0]);
  assert.equal(result.notes,null);
});
test('corrupt mix and note metadata cannot enter a restored track',()=>{
  const part=section('function normalizeSavedTrack(m){','async function restoreProjectRecord(p,');
  const normalize=(new Function(part+';return normalizeSavedTrack;'))();
  const base={id:'take',name:'Saved take',type:'vocal'};
  for(const v of [{...base,pan:'NaN'},{...base,gain:'Infinity'},{...base,start:'<script>'},
    {...base,fadeIn:{}},{...base,type:'vocal"><img src=x>'},{...base,notes:[null]},
    {...base,notes:[{start:0,duration:.2,midi:'NaN'}]}]){
    assert.throws(()=>normalize(v),/不正/);
  }
  const notes=normalize({...base,type:'guide',notes:[{start:'0.5',duration:'0.3',midi:'64',velocity:0.8}]});
  assert.equal(notes.notes[0].midi,64);
  assert.equal(notes.notes[0].start,.5);
});
test('duplicate identifiers and malformed track metadata are rejected before replacing current audio',async()=>{
  const part=section('function normalizeSavedTrack(m){','async function saveProject(){');
  const existing=[{id:'still-editing',name:'Unchanged live take'}],state={tracks:existing};
  const restore=(new Function('idbGet','decodeBlob','state','setStatus','DB_NAME',part+';return restoreProjectRecord;'))(
    async()=>null,async()=>null,state,()=>{},'piyoko-music-v45'
  );
  await assert.rejects(()=>restore({tracks:[{id:'duplicate',type:'vocal'},{id:'duplicate',type:'vocal'}]}),/重複トラックID/);
  await assert.rejects(()=>restore({tracks:[{id:'invalid',type:'vocal',pan:'NaN'}]}),/PANが不正/);
  assert.equal(state.tracks,existing);
});
test('track rename changes metadata only and supports cancel/blank name protection',()=>{
  const s=section('item.querySelector(".track-name").textContent = track.name;','item.querySelectorAll("[data-field]").forEach(input => {');
  assert.match(app,/data-action="rename"/);
  assert.match(s,/finishRename\(true\)/);
  assert.match(s,/finishRename\(false\)/);
  assert.match(s,/track\.name=next;scheduleAutoSave\(\)/);
  assert.doesNotMatch(s,/track\.id\s*=/);
  assert.doesNotMatch(s,/track\.blob\s*=/);
  assert.match(s,/トラック名は空欄にできません/);
});
test('asynchronous blob saving writes one consistent pre-edit snapshot',async()=>{
  const s=section('async function makeProjectRecord(id){','async function persistProject(id,');
  let releaseFirst;
  const gate=new Promise(resolve=>{releaseFirst=resolve});
  const backing={id:'backing',name:'伴奏A',type:'backing',blob:new Blob(['backing-a']),gain:.8,pan:-.2,start:0,fadeIn:0,fadeOut:0,notes:null};
  const vocal={id:'vocal',name:'歌TAKE 1',type:'vocal',blob:new Blob(['vocal-a']),gain:.6,pan:.3,start:.2,fadeIn:0,fadeOut:0,notes:[{midi:64,start:0,duration:.3}],asahiProject:{songId:'SONG-001',takeName:'TAKE 1'}};
  const state={tracks:[backing,vocal],guideWave:'sine',guideInstrument:'electone',asahiSongId:'SONG-001',asahiTakeName:'TAKE 1'};
  const wrap=value=>({value});
  const els={
    projectName:wrap('作品A'),songTitle:wrap('First title'),songDesign:wrap('ballad'),lyrics:wrap('first words'),
    bpm:wrap('96'),songKey:wrap('A minor'),songLength:wrap('4:30'),aiAmount:wrap('10'),localStyle:wrap('jpop'),
    arrangement:{textContent:'original arrangement'},
    vocalBridgeSongId:wrap('SONG-001'),vocalBridgeTakeName:wrap('TAKE 1'),recordOffset:wrap('120')
  };
  const persisted=[];
  const persistTrackBlob=async source=>{
    persisted.push({id:source.id,blob:source.blob});
    if(source.id==='backing')await gate;
    return 'asset:'+source.id;
  };
  const build=(new Function('state','els','cleanAsahiText','persistTrackBlob',s+';return makeProjectRecord;'))(
    state,els,x=>String(x),persistTrackBlob
  );
  const pending=build('last');
  // Edits while the first audio blob is awaiting storage must not leak into
  // an already initiated save.
  vocal.name='edited during save';
  vocal.notes[0].midi=83;
  vocal.asahiProject.takeName='TAKE 2';
  state.tracks.splice(0,1);
  state.tracks.push({id:'new-track',name:'new',type:'vocal',blob:new Blob(['new'])});
  els.songTitle.value='second title';
  els.arrangement.textContent='second arrangement';
  releaseFirst();
  const saved=await pending;
  assert.deepEqual(saved.tracks.map(t=>t.id),['backing','vocal']);
  assert.deepEqual(saved.tracks.map(t=>t.blobId),['asset:backing','asset:vocal']);
  assert.equal(saved.tracks[1].name,'歌TAKE 1');
  assert.equal(saved.tracks[1].notes[0].midi,64);
  assert.equal(saved.tracks[1].asahiProject.takeName,'TAKE 1');
  assert.equal(saved.create.title,'First title');
  assert.equal(saved.create.arrangement,'original arrangement');
  assert.deepEqual(persisted.map(t=>t.id),['backing','vocal']);
  assert.equal(persisted[1].blob,vocal.blob);
});
test('negative clip start reduces total audible timeline instead of extending it',()=>{
  const src=section('function maxDuration() {','function waveform(');
  const state={tracks:[
    {id:'backing',start:-.5,buffer:{duration:1.3}},
    {id:'vocal',start:.2,buffer:{duration:.9}},
    {id:'guide',start:-.1,duration:.4,notes:[{start:0,duration:.15}]}
  ]};
  const compute=(new Function('state',src+';return maxDuration;'))(state);
  assert.ok(Math.abs(compute()-1.1)<1e-9,'End must match audible positive-time content');
  state.tracks=[{id:'vocal',start:-.5,buffer:{duration:1.3}}];
  assert.ok(Math.abs(compute()-.8)<1e-9,'Trimmed start should remove .5s from visible duration');
  state.tracks[0].start=.3;
  assert.ok(Math.abs(compute()-1.6)<1e-9,'Positive start should extend visible duration');
});
test('local audio project record snapshots manual guide, chords, and song form before async persistence',async()=>{
  const s=section('async function makeProjectRecord(id){','async function persistProject(id,');
  let release;const gate=new Promise(resolve=>release=resolve);
  const state={
    tracks:[{id:'take',name:'Audio take',type:'vocal',blob:new Blob(['original'])}],
    guideNotes:[{start:.1,duration:.4,midi:64}],
    chordProgression:[{root:0,suffix:'maj7'}],
    songForm:[{id:'section-a',name:'Verse',start:0,duration:3,power:.7}],
    guideWave:'triangle',guideInstrument:'electone',asahiSongId:'SONG-A',asahiTakeName:'TAKE-A'
  };
  const v=value=>({value});
  const els={projectName:v('A'),songTitle:v('Song A'),songDesign:v('soft'),lyrics:v('words'),bpm:v('96'),
    songKey:v('A minor'),songLength:v('4:30'),aiAmount:v('10'),localStyle:v('jpop'),arrangement:{textContent:'pre-edit'},
    vocalBridgeSongId:v('SONG-A'),vocalBridgeTakeName:v('TAKE-A'),recordOffset:v('0')};
  const build=(new Function('state','els','cleanAsahiText','persistTrackBlob',s+';return makeProjectRecord;'))(
    state,els,x=>String(x),async t=>{await gate;return 'asset:'+t.id}
  );
  const promise=build('last');
  state.guideNotes[0].midi=80;
  state.chordProgression[0].root=8;
  state.songForm[0].name='Another song';
  release();
  const result=await promise;
  assert.equal(result.manualEditor.guideNotes[0].midi,64);
  assert.equal(result.manualEditor.chordProgression[0].root,0);
  assert.equal(result.manualEditor.songForm[0].name,'Verse');
  assert.equal(result.tracks[0].blobId,'asset:take');
});
test('malformed manual editor cannot replace current project and old saves remain compatible',()=>{
  const s=section('function normalizeSavedManualEditor(editor){','async function restoreProjectRecord(');
  const normalize=(new Function(s+';return normalizeSavedManualEditor;'))();
  assert.deepEqual(normalize(undefined),{guideNotes:[],chordProgression:[],songForm:[]});
  const ed={guideNotes:[{start:.5,duration:.2,midi:72}],chordProgression:[{root:9,suffix:'m7'}],
    songForm:[{name:'Aメロ',start:0,duration:3.2,power:.8}]};
  assert.deepEqual(normalize(ed),ed);
  for(const invalid of [
    {guideNotes:[{start:'no',duration:.2,midi:64}]},
    {guideNotes:[{start:0,duration:-1,midi:64}]},
    {chordProgression:[{root:99,suffix:'m'}]},
    {songForm:[{name:'Chorus',start:0,duration:'invalid',power:1}]}
  ])assert.throws(()=>normalize(invalid),/不正/);
});
test('settings JSON import does not overwrite the original audio tracks',()=>{
  const s=section('async function loadV8ProjectFromFile(file){','function ptMedian(');
  assert.doesNotMatch(s,/state\.tracks\s*=/);
  assert.match(s,/編集設定JSONを復元しました（音源は変更しません）/);
});
