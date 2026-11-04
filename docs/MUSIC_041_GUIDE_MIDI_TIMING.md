# MUSIC-041 — ガイドMIDIの時刻ずれを防ぐ

## 背景
ガイドメロディのMIDI書き出しでは `guide.start+n.start` をそのまま使用していた。旧形式のガイドトラックで `start` が欠けると非数のイベント時刻を生成し、また負の開始位置で本来すでに終了している音符も0秒から新たに鳴らす可能性があった。

## 実装済みの修正
- `guide.start` が省略された場合は0秒として扱い、音符の元の開始時刻と休符間隔を維持する。
- `guide.start` がマイナスの場合、0秒以前に完全終了した音符はMIDIへ出さない。
- 0秒をまたぐ音符は音声再生の `scheduleTone` と同じく、0秒から本来の終了時刻までに切り詰める。
- 非有限の音符時刻・長さ、不正なMIDI音程は出力対象から外す。
- 聞こえる有効音符がなければMIDIファイルを作らない。入力音符・原音・SONG ID・保存DBは変更しない。
- 長いガイドでは本来の終了位置までMIDIトラックの末尾を保持する。

## 自動回帰検査
`tests/master-multitrack-contract.test.mjs` で、生成されたMIDIバイト列をテスト側で復号し、以下を検証する。
- ガイド開始時刻が未設定でも音符の間隔が保持される。
- 負開始位置で完全不可聴な音符が出ず、部分可聴音符が0秒から正しい終了時刻になる。
- 不正な音符の除外、メロディトラックへの安全なフォールバック、入力データ非変更。

合格記録：
- 歌入れブリッジ・実Chromium・MIDI・MASTER検査: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/41804572531
- ロードマップ・プロキシ・保存安全性検査: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/41804287077

## 未検証の境界
iPhone/Android実機のMIDI再生音質、ガイド音源の聴感、実GPU生成、本番公開は未検証。本番URLと `main` は変更しない。
