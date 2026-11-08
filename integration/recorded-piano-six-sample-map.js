// Fixed recorded-piano *test fixture* manifest. No sound files are bundled.
// Upstream: Meta Open Sound, CC0-1.0, pinned commit 251c0be57d5d1b3242b91f53e0cde62ab1cb42d9.
// The CI must validate every downloaded sample SHA256 and upstream license.
export const RECORDED_PIANO_UPSTREAM=Object.freeze({
  repo:"facebookincubator/Meta-open-sound",
  commit:"251c0be57d5d1b3242b91f53e0cde62ab1cb42d9",
  license:"CC0-1.0",
  manifestSha256:"d6414ab35d2920b00714e86a919a14ac547136db711c5ecfea2d74acf405a527",
  licenseSha256:"a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499"
});
// Limit each recorded sample to nearby pitches; out-of-range notes are not silently shifted by several octaves.
const records=[
  ["C3",48,42,53, "Vel01","b1f925572614bbe494e5a82ca75abd04fdee256c92d58619544dd86fe1cee479",0,80],
  ["C3",48,42,53, "Vel03","cd800dd561d3980c62db9fd48e008821fe374c23ce59abf25749c89ba607f966",81,127],
  ["C4",60,54,65,"Vel01","8af4661a8396e8bb2247f576d3b201e34f68f0289268c28b70018c607178d8be",0,80],
  ["C4",60,54,65,"Vel03","f6df379bfb60e074fdb640eb33298a3150960b9c27fa9247740036fb8d9b55d6",81,127],
  ["C5",72,66,78,"Vel01","1f2f6fcf79537c6d5011d13783a48d68749edc0cdbfa00356bc25072b1f00fd4",0,80],
  ["C5",72,66,78,"Vel03","d447e6331aa7b37d7405b10531ecbba70211e4e7973e9b55bdae5c307cd88f23",81,127]
];
export const RECORDED_PIANO_SAMPLES=Object.freeze(records.map(([pitch,rootMidi,loKey,hiKey,velocityLayer,sha256,loVel,hiVel])=>Object.freeze({
  file:`INSPiano_${velocityLayer}_${pitch}_01.ogg`,
  pitch,rootMidi,loKey,hiKey,velocityLayer,sha256,loVel,hiVel
})));
export function createRecordedPianoSfz(){
  return RECORDED_PIANO_SAMPLES.map(x=>`<region> sample=${x.file} lokey=${x.loKey} hikey=${x.hiKey} pitch_keycenter=${x.rootMidi} lovel=${x.loVel} hivel=${x.hiVel} volume=-9 ampeg_attack=0.015 ampeg_release=0.09`).join("\n");
}
