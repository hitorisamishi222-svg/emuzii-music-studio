# MUSIC-095 — 独立2曲を実録音ピアノで演奏して融合（2026-11-10）

## 引継ぎと保護
MUSIC-092（独立ステムのステレオ融合）→ MUSIC-093（拍子・BPMの共通グリッド）→ MUSIC-094（ローカルサンプラーを接続）を引き継ぎ。既存開発ブランチ `feature/vocal-recorder-v1` のみ。main・本番URL・音源原本・SONG ID・TAKEは変更しない。

## 今回の実作業
`tests/real-piano-independent-arrangement-browser.test.mjs` を追加し、既存の実録音ピアノCIへ統合。

- Meta Open Soundの固定リビジョン `251c0be57d5d1b3242b91f53e0cde62ab1cb42d9` にあるCC0-1.0ピアノ録音OGGを6個取得し、既存の公式LICENSE・manifest・各SHA-256検証を通す。
- ChromiumのAudioContextで、弱音のC3とC4をデコード。
- 曲A：90BPM・3拍子・C4の旋律2音。曲B：140BPM・4拍子・C3のベース2音。120BPM・4拍子へ明示変換し、別々に実録音ピアノで演奏。
- 左右の定位とヘッドルームを付けて合成し、5秒のステレオ演奏＋2秒の完全無音の16bit WAVを生成。
- 2曲の演奏が消えていないこと、音割れがないこと、左右に差があること、元録音を変更していないこと、同じ入力でWAVバイト列が一致することを自動検査。
- CIのArtifactに `two-independent-songs-real-cc0-piano.wav` と監査用JSONを保存（公開アプリへのサンプル同梱はしない）。

## 合格基準と未実施
自動テストが合格しても、それは「実録音の2つの独立パートを音声として融合できる」技術合格に限定する。録音の音楽的自然さ、和声や調性の自動判断、別楽器への適用、iPhone/Android実機、耳による聴感は未合格。MUSIC-077の高度な複数楽曲融合全体も未完了。

CI: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42659931400
