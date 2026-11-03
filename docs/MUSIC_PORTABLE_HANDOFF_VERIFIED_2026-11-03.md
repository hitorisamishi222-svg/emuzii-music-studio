# 2026-11-03 Portable MUSIC STUDIO handoff — verified

Scope: **development branch only**. Existing production, customer recordings, Android R6 and ACE-Step GPU untouched.

## MUSIC-035 completed
- Single offline `.asahi-music` file bundles project data and raw audio blobs. Header/manifest/audio CRC32 checks reject damaged files before editor replacement.
- Real Chromium tests: backing + vocal export; corrupted import refused while editing unchanged; valid import with original track IDs; manual save and reload; fresh isolated browser context import without silent autosave (including pagehide), followed by explicit local save of both audio blobs. All PASS:
  - https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/41631739889
  - https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/41632535906
- CRC32 detects accidental corruption; it is **not a cryptographic signature** or proof of authorship.

## MUSIC-036 completed
- Per-track arrangement fields (`chords`, `tone`, `beats`, `bpm`, `section`, `style`, `power`) are now preserved in local and portable project records and validated before restore.
- Legacy absent fields remain null, without reconstructing unavailable arrangement data.
- Real Chromium synthetic arrangement-only portable file → import → explicit local save → page reload → retrieve saved track and assert chord/root/tone/BPM/section exact match:
  - https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/41632535906

## Remaining boundaries
- Confirmed: developer-side Chromium and Node CI for synthetic recordings, not a physical phone or PC DAW listening test.
- No real ACE-Step GPU generation, no COMMON ENGINE always-on connection, no Production merge/deploy; those are separately blocked tasks.
- A user who imports a portable file must explicitly press **編集状態を保存** to persist it on that device; the file itself should be kept as backup.
