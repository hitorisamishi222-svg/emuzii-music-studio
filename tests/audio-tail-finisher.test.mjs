import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAudioEnding, createTailSafeWav } from "../integration/audio-tail-finisher.js";

const sr = 44100;
const view = wav => new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

test("preserves the original stereo samples and adds two seconds of zero PCM", () => {
  const a = new Float32Array([0, .25, -.25, .5, -.5, 0]);
  const b = new Float32Array([0, -.5, .5, .125, -.125, 0]);
  const originalA = a.slice(), originalB = b.slice();
  const { wav, report } = createTailSafeWav([a, b], sr);
  const v = view(wav);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
  assert.equal(v.getUint32(4, true), wav.length - 8);
  assert.equal(v.getUint32(40, true), wav.length - 44);
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), sr);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(report.totalFrames, 6 + 2 * sr);
  assert.equal(report.silenceFrames, sr * 2);
  assert.equal(v.getInt16(44 + 4, true), 8192);
  assert.equal(v.getInt16(44 + 6, true), -16384);
  assert.deepEqual(a, originalA);
  assert.deepEqual(b, originalB);
  for (let i = 44 + 6 * 4; i < wav.length; i++) assert.equal(wav[i], 0);
});

test("uses exact ceil rounding and a valid mono header", () => {
  const {wav,report} = createTailSafeWav([new Float32Array([0, 1, -1])], 48000, {silenceSeconds:1.001});
  assert.equal(report.silenceFrames, Math.ceil(48000 * 1.001));
  const v = view(wav);
  assert.equal(v.getUint16(22,true),1);
  assert.equal(v.getInt16(44 + 2,true),32767);
  assert.equal(v.getInt16(44 + 4,true),-32768);
  assert.equal(wav.length, 44 + (3 + report.silenceFrames) * 2);
});

test("warns about a possibly abrupt ending but never silently trims samples", () => {
  const src=new Float32Array(sr);
  src.fill(.2);
  const r=analyzeAudioEnding([src],sr);
  assert.equal(r.possibleAbruptEnding,true);
  const {wav}=createTailSafeWav([src],sr);
  const v=view(wav);
  assert.equal(v.getInt16(44+(sr-1)*2,true),6553);
});

test("no false abrupt-ending warning for a quiet final quarter-second",()=>{
  const src=new Float32Array(sr);
  src.fill(.25,0,sr/2);
  const r=analyzeAudioEnding([src],sr);
  assert.equal(r.possibleAbruptEnding,false);
});

test("opt-in fade ends at zero, original samples untouched",()=>{
  const src=new Float32Array(sr);
  src.fill(.4);
  const {wav}=createTailSafeWav([src],sr,{fadeSeconds:2});
  const v=view(wav);
  assert.equal(v.getInt16(44,true)>0,true);
  assert.equal(v.getInt16(44+(sr-1)*2,true),0);
  assert.equal(src[sr-1]>.39,true);
});

test("rejects malformed input and unsafe arguments",()=>{
  assert.throws(()=>createTailSafeWav([],sr),/チャンネル/);
  assert.throws(()=>createTailSafeWav([new Float32Array(4),new Float32Array(3)],sr),/チャンネル長/);
  assert.throws(()=>createTailSafeWav([new Float32Array(4)],0),/サンプルレート/);
  assert.throws(()=>createTailSafeWav([new Float32Array(4)],sr,{silenceSeconds:0}),/無音/);
  assert.throws(()=>createTailSafeWav([new Float32Array(4)],sr,{fadeSeconds:31}),/フェード/);
});
