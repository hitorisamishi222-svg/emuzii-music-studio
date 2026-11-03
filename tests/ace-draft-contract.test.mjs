import test from 'node:test';
import assert from 'node:assert/strict';
await import('../integration/ace-step-request.js');
const ace=globalThis.ASAHIAceStep;
test('official-compatible offline draft, without network or source mutation',()=>{
  const source={prompt:'warm city pop, piano and guitar',lyrics:'[Verse]\n遠い街',length:'4:30',bpm:'96',key:'A minor'};
  const copy=structuredClone(source),d=ace.buildDraft(source);
  assert.deepEqual(source,copy);
  assert.equal(d.audio_duration,270);assert.equal(d.bpm,96);
  assert.equal(d.key_scale,'A minor');assert.equal(d.vocal_language,'ja');assert.equal(d.audio_format,'wav');assert.equal(d.lyrics,source.lyrics);
  assert.equal(d.task_type,'text2music');
});
test('instrumental default and limits reject invalid draft safely',()=>{
  assert.equal(ace.buildDraft({prompt:'ambient',length:'0:30',bpm:120,key:'C'}).lyrics,'[inst]');
  assert.throws(()=>ace.buildDraft({prompt:'',length:'2:00',bpm:120,key:'C'}),/曲設計/);
  assert.throws(()=>ace.buildDraft({prompt:'pop',length:'9:99',bpm:120,key:'C'}),/曲尺/);
  assert.throws(()=>ace.buildDraft({prompt:'pop',length:'10:01',bpm:120,key:'C'}),/曲尺/);
  assert.throws(()=>ace.buildDraft({prompt:'pop',length:'0:09',bpm:120,key:'C'}),/曲尺/);
  assert.throws(()=>ace.buildDraft({prompt:'pop',length:'2:00',bpm:301,key:'C'}),/BPM/);
});
test('parse native ACE-Step 1.5 response wrapper with numeric statuses',()=>{
  assert.equal(ace.taskId({code:200,data:{task_id:'ci-123'}}),'ci-123');
  assert.throws(()=>ace.taskId({task_id:'ci-123'}),/形式/);
  const waiting=ace.result({code:200,data:[{task_id:'ci-123',status:0}]},'ci-123');
  assert.equal(waiting.finished,false);
  const done=ace.result({code:200,data:[{task_id:'ci-123',status:1,result:JSON.stringify([{file:'/v1/audio?path=%2Ftmp%2Fmock.wav'}])}]},'ci-123');
  assert.equal(done.status,1);
  assert.deepEqual(done.files,[{sourcePath:'/tmp/mock.wav',proxyUrl:'/api/ace/v1/audio?audio_path=%2Ftmp%2Fmock.wav'}]);
  const failed=ace.result({code:200,data:[{task_id:'ci-123',status:2}]},'ci-123');
  assert.equal(failed.status,2);
  assert.throws(()=>ace.result({code:200,data:[]},'ci-123'),/不明/);
});
test('reject arbitrary audio links and malformed result text',()=>{
  const response=f=>({code:200,data:[{task_id:'ci',status:1,result:JSON.stringify([{file:f}])}]});
  assert.deepEqual(ace.result(response('https://evil.invalid/file.mp3'),'ci').files,[]);
  assert.deepEqual(ace.result(response('/api/ace/v1/audio?path=/secret'),'ci').files,[]);
  assert.throws(()=>ace.result({code:200,data:[{task_id:'ci',status:1,result:'broken'}]},'ci'),/解析/);
});
