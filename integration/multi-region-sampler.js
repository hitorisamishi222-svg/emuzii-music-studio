// ASAHI MUSIC: intentionally limited multi-region SFZ planner and local WAV renderer.
// Reuses the existing single-region SFZ gate. No URL imports, group inheritance,
// sample loops, round-robin or SF2. All samples must be supplied by the user.
import { parseSingleRegionSfz, renderSampledScore } from "./local-sample-sampler.js";

export const MAX_SFZ_REGIONS = 16;

export function parseMultiRegionSfz(source) {
  if (typeof source !== "string" || !source.trim() || source.length > 20000) {
    throw Error("SFZテキストは1〜20000文字にしてください");
  }
  const clean = source.replace(/\/\/[^\n]*/g, " ").trim();
  const starts = [...clean.matchAll(/<region>/gi)];
  if (!starts.length || starts.length > MAX_SFZ_REGIONS || !clean.startsWith(starts[0][0])) {
    throw Error("この試作は<region>のみ、最大16個に対応します");
  }
  const regions = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].index, to = i + 1 < starts.length ? starts[i + 1].index : clean.length;
    regions.push(parseSingleRegionSfz(clean.slice(from, to)));
  }
  // Overlap requires round-robin/layer rules that are not yet implemented.
  // Refuse it rather than accidentally playing two samples for one note.
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i], b = regions[j];
      const keysOverlap = a.loKey <= b.hiKey && b.loKey <= a.hiKey;
      const velocitiesOverlap = a.loVel <= b.hiVel && b.loVel <= a.hiVel;
      if (keysOverlap && velocitiesOverlap) {
        throw Error("リージョン" + (i + 1) + "と" + (j + 1) + "は音域・強弱が重なっています（重複発音防止）");
      }
    }
  }
  return regions;
}

export function renderMultiRegionScore(notes, regions, samples, {sampleRate=24000,seconds=30}={}) {
  if (!Array.isArray(notes) || notes.length > 2048 || !Array.isArray(regions) ||
      regions.length < 1 || regions.length > MAX_SFZ_REGIONS || !(samples instanceof Map)) {
    throw Error("複数サンプル演奏の引数が不正です");
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000 ||
      !Number.isFinite(seconds) || seconds <= 0 || seconds > 60) {
    throw Error("出力のサンプルレート・長さが不正です");
  }
  // Validate the entire score; even notes outside sample zones are not exempt.
  for (const n of notes) {
    if (!n || ![n.start,n.duration,n.midi,n.velocity].every(Number.isFinite) ||
      n.start < 0 || n.duration <= 0 || n.start + n.duration > seconds + 0.00001 ||
      !Number.isInteger(n.midi) || n.midi < 0 || n.midi > 127 ||
      !Number.isInteger(n.velocity) || n.velocity < 0 || n.velocity > 127) {
      throw Error("音符情報が不正です");
    }
  }
  // A programmatic caller cannot bypass the parser's overlap safety.
  for (let i = 0; i < regions.length; i++) {
    const a = regions[i];
    if (!a || typeof a.sample !== "string" || !samples.has(a.sample)) throw Error("必要なWAVがありません: " + String(a?.sample));
    for (let j = i + 1; j < regions.length; j++) {
      const b = regions[j];
      if (a.loKey <= b.hiKey && b.loKey <= a.hiKey && a.loVel <= b.hiVel && b.loVel <= a.hiVel) {
        throw Error("重複リージョンの同時発音は未対応です");
      }
    }
  }
  const pcm = new Float32Array(Math.ceil(seconds * sampleRate));
  const regionUsage = [];
  let renderedNotes = 0;
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    const selected = notes.filter(n => n.midi >= r.loKey && n.midi <= r.hiKey &&
      n.velocity >= r.loVel && n.velocity <= r.hiVel);
    // Render zero-note regions too, to validate their source/parameters.
    const result = renderSampledScore(selected, samples.get(r.sample), {...r,sampleRate,seconds});
    for (let f = 0; f < pcm.length; f++) pcm[f] += result.pcm[f];
    renderedNotes += result.renderedNotes;
    regionUsage.push({index:i+1,sample:r.sample,renderedNotes:result.renderedNotes});
  }
  let peak = 0;
  for (let f = 0; f < pcm.length; f++) peak = Math.max(peak, Math.abs(pcm[f]));
  return {
    pcm,sampleRate,seconds,regionUsage,renderedNotes,skippedNotes:notes.length-renderedNotes,
    peak,overloaded:peak>1,kind:"local-multi-sample-render",sourceUnchanged:true
  };
}
