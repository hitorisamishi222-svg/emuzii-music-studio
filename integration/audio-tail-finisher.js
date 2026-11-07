// Offline, non-destructive WAV outro finisher. No external services.
const isFiniteNumber = value => typeof value === "number" && Number.isFinite(value);

function validateAudio(channels, sampleRate) {
  if (!Array.isArray(channels) || channels.length < 1 || channels.length > 2) {
    throw new Error("1〜2チャンネルの音声が必要です");
  }
  if (!isFiniteNumber(sampleRate) || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new Error("サンプルレートが不正です");
  }
  const frames = channels[0]?.length;
  if (!Number.isInteger(frames) || frames < 1 || !channels.every(ch => ch instanceof Float32Array && ch.length === frames)) {
    throw new Error("チャンネル長が一致するFloat32Arrayが必要です");
  }
  return frames;
}

export function analyzeAudioEnding(channels, sampleRate) {
  const frames = validateAudio(channels, sampleRate);
  const lastFrames = Math.min(frames, Math.max(1, Math.round(sampleRate * 0.25)));
  let sum = 0, peak = 0, count = 0;
  for (const ch of channels) {
    for (let i = frames - lastFrames; i < frames; i++) {
      const x = Number.isFinite(ch[i]) ? ch[i] : 0;
      sum += x * x;
      peak = Math.max(peak, Math.abs(x));
      count++;
    }
  }
  const rms = Math.sqrt(sum / count);
  return {
    durationSeconds: frames / sampleRate,
    rms,
    peak,
    possibleAbruptEnding: rms >= 0.01,
    inspectedSeconds: lastFrames / sampleRate
  };
}

// Preserve every original sample, optionally apply an explicitly selected fade,
// and append true zero-valued PCM. This cannot restore missing lyrics/outro.
export function createTailSafeWav(channels, sampleRate, { silenceSeconds = 2, fadeSeconds = 0 } = {}) {
  const frames = validateAudio(channels, sampleRate);
  if (!isFiniteNumber(silenceSeconds) || silenceSeconds < 1 || silenceSeconds > 10) {
    throw new Error("無音は1〜10秒で指定してください");
  }
  if (!isFiniteNumber(fadeSeconds) || fadeSeconds < 0 || fadeSeconds > 30) {
    throw new Error("フェードは0〜30秒で指定してください");
  }
  const silenceFrames = Math.ceil(silenceSeconds * sampleRate);
  const totalFrames = frames + silenceFrames;
  const bytesPerFrame = channels.length * 2;
  const dataBytes = totalFrames * bytesPerFrame;
  if (!Number.isSafeInteger(dataBytes) || dataBytes > 512 * 1024 * 1024 || dataBytes > 0xffffffff - 36) {
    throw new Error("音声が大きすぎます。短い区間でお試しください");
  }
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const label = (offset, value) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  label(0, "RIFF"); view.setUint32(4, 36 + dataBytes, true);
  label(8, "WAVE"); label(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true);
  view.setUint16(34, 16, true);
  label(36, "data"); view.setUint32(40, dataBytes, true);
  const fadeFrames = Math.min(frames, Math.round(fadeSeconds * sampleRate));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    const gain = fadeFrames && i >= frames - fadeFrames
      ? Math.max(0, (frames - 1 - i) / Math.max(1, fadeFrames - 1))
      : 1;
    for (const ch of channels) {
      const x = Number.isFinite(ch[i]) ? ch[i] : 0;
      const s = Math.max(-1, Math.min(1, x * gain));
      view.setInt16(offset, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
      offset += 2;
    }
  }
  return {
    wav: bytes,
    report: {
      ...analyzeAudioEnding(channels, sampleRate),
      originalFrames: frames,
      silenceFrames,
      totalFrames,
      sampleRate,
      channels: channels.length,
      fadeSeconds,
      silenceSeconds: silenceFrames / sampleRate
    }
  };
}
