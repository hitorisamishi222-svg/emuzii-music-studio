import assert from 'node:assert/strict';
import { finishWavOutro } from '../integration/wav-outro-safety.mjs';

function fixture({ format = 1, bits = 16, channels = 1, frames = 100, sampleRate = 1000, lastSilent = 0, postChunk = false } = {}) {
  const width = bits / 8, blockAlign = channels * width, length = frames * blockAlign;
  const extra = postChunk ? 12 : 0;
  const bytes = new Uint8Array(44 + length + extra);
  const view = new DataView(bytes.buffer);
  const write = (offset, str) => { for (let i = 0; i < str.length; i++) bytes[offset+i] = str.charCodeAt(i); };
  write(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, format, true);
  view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true); view.setUint16(34, bits, true);
  write(36, 'data'); view.setUint32(40, length, true);
  for (let f = 0; f < frames - lastSilent; f++) {
    for (let c = 0; c < channels; c++) {
      const offset = 44 + f*blockAlign + c*width;
      if (format === 3) view.setFloat32(offset, 0.25, true);
      else if (bits === 16) view.setInt16(offset, 8192, true);
      else if (bits === 24) { bytes[offset] = 0; bytes[offset+1] = 0x20; bytes[offset+2] = 0; }
      else view.setInt32(offset, 536870912, true);
    }
  }
  if (postChunk) { write(44+length, 'JUNK'); view.setUint32(44+length+4, 4, true); write(44+length+8, 'TEST'); }
  return bytes;
}

{
  const original = fixture(); const saved = original.slice();
  const {wav, report} = finishWavOutro(original, {silenceSeconds:2});
  assert.deepEqual(original, saved, 'original preserved');
  assert.equal(report.appendedSilenceSeconds, 2);
  assert.equal(report.trailingSilenceAfter, 2);
  assert.equal(report.durationAfter, 2.1);
  assert.equal(report.mayEndAbruptly, true);
  assert.match(report.warning, /cannot repair truncated lyrics/);
  assert.equal(new DataView(wav.buffer).getUint32(40, true), 100 * 2 + 2000 * 2);
  assert.equal(new DataView(wav.buffer).getUint32(4,true), wav.length-8);
}
{
  const original = fixture({bits:24,channels:2,lastSilent:75});
  const result = finishWavOutro(original, {silenceSeconds:0.1});
  assert.equal(result.report.trailingSilenceBefore, 0.075);
  assert.equal(result.report.appendedSilenceSeconds, 0.025);
  assert.equal(result.report.trailingSilenceAfter, 0.1);
}
{
  const original = fixture({format:3,bits:32,lastSilent:100});
  const result = finishWavOutro(original, {silenceSeconds:0.08});
  assert.deepEqual(result.wav, original, 'already silent WAV should be identical');
  assert.equal(result.report.appendedSilenceSeconds, 0);
}
{
  const original = fixture({postChunk:true});
  const result = finishWavOutro(original, {silenceSeconds:0.05});
  const end = result.wav.length;
  assert.equal(new TextDecoder().decode(result.wav.subarray(end-12,end-8)), 'JUNK');
  assert.equal(new TextDecoder().decode(result.wav.subarray(end-4)), 'TEST');
}
{
  const original = fixture();
  const result = finishWavOutro(original, {silenceSeconds:0.1,fadeSeconds:0.02});
  const view = new DataView(result.wav.buffer);
  assert.equal(view.getInt16(44 + 99 * 2, true), 0);
  assert.equal(result.report.fadeSecondsApplied, 0.02);
}
{
  const badFormat = fixture(); new DataView(badFormat.buffer).setUint16(34, 8, true);
  assert.throws(() => finishWavOutro(badFormat), /unsupported audio format/);
  assert.throws(() => finishWavOutro(fixture(), {silenceSeconds:-1}), /silenceSeconds/);
  assert.throws(() => finishWavOutro(fixture().subarray(0,60)), /RIFF size/);
}
console.log('wav-outro-safety: 6 targeted tests passed');
