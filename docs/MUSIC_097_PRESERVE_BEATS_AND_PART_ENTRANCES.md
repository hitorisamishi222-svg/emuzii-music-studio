# MUSIC-097 — 独立楽曲のリズムを勝手に伸ばさない拍位置モード

2026-11-11。MUSIC-092〜096と既存の保護対象を確認し、既存開発ブランチのみ更新。本番・原音・mainは変更しない。

## 課題
従来のMUSIC-093は、3/4の1小節を4/4の1小節へ無条件に伸縮していた。これは小節頭を合わせるには便利だが、曲の拍感を意図せず変える。複数曲を融合する時、音楽的な選択ができるようにする必要がある。

## 実装
- `integration/independent-note-grid-aligner.js` に `meterMapping` を追加。
  - `stretch-bars`（既定・従来どおり）: 元の小節を対象小節へ伸縮。
  - `preserve-beats`（明示指定のみ）: 元の拍数を保ったまま、対象BPMに配置。元3/4の1拍は対象4/4でも1拍となり、無断で4/3倍に伸ばさない。
- `partOffsetBars` で独立した各曲の開始小節を明示的に遅らせられる。全曲共通の `offsetBars` は既定どおり。
- `integration/independent-arrangement-renderer.js` までオプションを通し、ローカルサンプルでの実際のステレオWAVにも反映。
- 入力の音符・元録音は不変更。無効なモードやオフセットは拒否。

## 検証
`tests/independent-note-grid-aligner.test.mjs` で3/4→4/4の伸縮なし、曲ごとの入りの違い、入力不変、異常入力拒否を確認。`tests/independent-arrangement-renderer.test.mjs` で実際のステレオWAV合成まで確認。

初回の実装で文字列中の改行エスケープを誤ってJSコードに混入させ、CIが構文エラーになった。これを特定して修正し、再実行CIで合格。失敗履歴は隠さない。

CI: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/42877921133

## 未完了
音声ファイルのタイムストレッチ、調性・和声の自動整合、実録音でのこの新モードの聴感、iPhone/Android実機は未完了。MUSIC-077の全体完成とはしない。
