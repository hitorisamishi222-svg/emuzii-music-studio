/**
 * Optional outro safety utility. Pure JS, runs in browser or Node.
 * Input stays immutable. Works on RIFF/WAVE PCM 16/24/32-bit and IEEE float32.
 * Does NOT verify that lyrics finished or that a musical outro is complete.
 */
function fail(message) { throw new Error("WAV outro: " + message); }
function readAscii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
function writeU32(view, at, value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) fail('RIFF size limit exceeded');
  view.setUint32(at, value, true);
}
function parseWav(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 44) fail('file too short');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') fail('only RIFF/WAVE is supported');
  const riffEnd = 8 + view.getUint32(4, true);
  if (riffEnd !== bytes.byteLength) fail('RIFF size does not match file length');
  let fmt = null, data = null;
  for (let p = 12; p < riffEnd;) {
    if (p + 8 > riffEnd) fail('truncated chunk header');
    const id = readAscii(bytes, p, 4);
    const length = view.getUint32(p + 4, true);
    const start = p + 8;
    const end = start + length;
    if (end > riffEnd || end + (length % 2) > riffEnd) fail('truncated chunk');
    if (id === 'fmt ') {
      if (fmt || length < 16) fail('invalid fmt chunk');
      const format = view.getUint16(start, true);
      const channels = view.getUint16(start + 2, true);
      const sampleRate = view.getUint32(start + 4, true);
      const byteRate = view.getUint32(start + 8, true);
      const blockAlign = view.getUint16(start + 12, true);
      const bitDepth = view.getUint16(start + 14, true);
      const supported = (format === 1 && [16, 24, 32].includes(bitDepth)) || (format === 3 && bitDepth === 32);
      if (!supported) fail('unsupported audio format (expect PCM16/24/32 or float32)');
      const width = bitDepth / 8;
      if (!channels || channels > 8 || !sampleRate || sampleRate > 192000 || blockAlign !== channels * width || byteRate !== sampleRate * blockAlign) fail('invalid fmt parameters');
      fmt = { format, channels, sampleRate, blockAlign, bitDepth, width };
    } else if (id === 'data') {
      if (data) fail('multiple data chunks not supported');
      data = { chunkOffset: p, start, length, end, paddedEnd: end + (length % 2) };
    }
    p = end + (length % 2);
  }
  if (!fmt || !data || !data.length || data.length % fmt.blockAlign) fail('missing or misaligned audio');
  return { bytes, view, fmt, data, frames: data.length / fmt.blockAlign };
}
function sampleAt(view, fmt, dataStart, frame, channel) {
  const offset = dataStart + frame * fmt.blockAlign + channel * fmt.width;
  if (fmt.format === 3) return view.getFloat32(offset, true);
  if (fmt.bitDepth === 16) return view.getInt16(offset, true) / 32768;
  if (fmt.bitDepth === 32) return view.getInt32(offset, true) / 2147483648;
  let value = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
  if (value & 0x800000) value -= 0x1000000;
  return value / 8388608;
}
function writeSample(view, fmt, dataStart, frame, channel, value) {
  const offset = dataStart + frame * fmt.blockAlign + channel * fmt.width;
  const v = Math.max(-1, Math.min(1, value));
  if (fmt.format === 3) return view.setFloat32(offset, v, true);
  const range = 2 ** (fmt.bitDepth - 1);
  const int = Math.round(v * (v < 0 ? range : range - 1));
  if (fmt.bitDepth === 16) return view.setInt16(offset, int, true);
  if (fmt.bitDepth === 32) return view.setInt32(offset, int, true);
  const unsigned = int < 0 ? int + 0x1000000 : int;
  view.setUint8(offset, unsigned & 255);
  view.setUint8(offset + 1, (unsigned >>> 8) & 255);
  view.setUint8(offset + 2, (unsigned >>> 16) & 255);
}
function zeroFrame(view, fmt, start, f) {
  for (let c = 0; c < fmt.channels; c++) if (sampleAt(view, fmt, start, f, c) !== 0) return false;
  return true;
}
/**
 * Add digital silence after the existing music, optionally fade the existing
 * final audio before the silence. Never overwrites source. A positive fadeSeconds
 * is explicit opt-in because it can shorten an unfinished final vocal/note.
 */
export function finishWavOutro(input, { silenceSeconds = 2, fadeSeconds = 0 } = {}) {
  for (const [label, value, upper] of [['silenceSeconds', silenceSeconds, 30], ['fadeSeconds', fadeSeconds, 30]]) {
    if (!Number.isFinite(value) || value < 0 || value > upper) fail(label + ' must be 0–' + upper);
  }
  const { bytes, view, fmt, data, frames } = parseWav(input);
  const durationBefore = frames / fmt.sampleRate;
  const lastWindowFrames = Math.min(frames, Math.max(1, Math.round(fmt.sampleRate * 0.04)));
  let energy = 0;
  for (let f = frames - lastWindowFrames; f < frames; f++) {
    for (let c = 0; c < fmt.channels; c++) {
      const v = sampleAt(view, fmt, data.start, f, c);
      if (!Number.isFinite(v)) fail('non-finite float sample');
      energy += v * v;
    }
  }
  const lastWindowRms = Math.sqrt(energy / (lastWindowFrames * fmt.channels));
  const mayEndAbruptly = lastWindowRms > 0.01;
  let existingZeroFrames = 0;
  for (let f = frames - 1; f >= 0 && zeroFrame(view, fmt, data.start, f); f--) existingZeroFrames++;
  const requestedFrames = Math.ceil(silenceSeconds * fmt.sampleRate);
  const appendedFrames = Math.max(0, requestedFrames - existingZeroFrames);
  const appendedBytes = appendedFrames * fmt.blockAlign;
  const newDataLength = data.length + appendedBytes;
  if (newDataLength > 0xffffffff || bytes.byteLength + appendedBytes > 0xffffffff) fail('result too large');
  const previousPad = data.length % 2;
  const nextPad = newDataLength % 2;
  const result = new Uint8Array(bytes.byteLength + appendedBytes - previousPad + nextPad);
  result.set(bytes.subarray(0, data.end), 0);
  result.set(bytes.subarray(data.paddedEnd), data.end + appendedBytes + nextPad);
  const nextView = new DataView(result.buffer);
  writeU32(nextView, 4, result.byteLength - 8);
  writeU32(nextView, data.chunkOffset + 4, newDataLength);
  const fadeFrames = Math.min(frames, Math.ceil(fadeSeconds * fmt.sampleRate));
  if (fadeFrames > 0) {
    for (let i = 0; i < fadeFrames; i++) {
      const frame = frames - fadeFrames + i;
      const gain = fadeFrames === 1 ? 0 : 1 - i / (fadeFrames - 1);
      for (let c = 0; c < fmt.channels; c++) {
        const value = sampleAt(nextView, fmt, data.start, frame, c);
        writeSample(nextView, fmt, data.start, frame, c, value * gain);
      }
    }
  }
  return {
    wav: result,
    report: {
      channels: fmt.channels, sampleRate: fmt.sampleRate, bitDepth: fmt.bitDepth,
      durationBefore, durationAfter: (frames + appendedFrames) / fmt.sampleRate,
      trailingSilenceBefore: existingZeroFrames / fmt.sampleRate,
      trailingSilenceAfter: (existingZeroFrames + appendedFrames) / fmt.sampleRate,
      appendedSilenceSeconds: appendedFrames / fmt.sampleRate,
      fadeSecondsApplied: fadeFrames / fmt.sampleRate,
      lastWindowRms, mayEndAbruptly,
      warning: mayEndAbruptly && fadeFrames === 0
        ? 'Source is still audible at file end. Adding silence cannot repair truncated lyrics or a cut-off outro; inspect the source and extend it before release.'
        : 'Check by listening: completed lyrics and natural outro cannot be verified from WAV samples alone.'
    }
  };
}
