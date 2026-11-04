# MUSIC-039 — 持ち運びバンドルの容量超過を音声ハッシュ前に拒否

## 目的
`ASAHIMusicBundle.pack` は元々、個別音声の200MB上限を先に確認するものの、全音声合計750MBの上限を検査する前に各音源のSHA-256計算を行っていた。後で容量超過と判定されるバックアップでも不要な音声読み込み・計算が発生し得た。

## 実装
- `integration/music-portable-bundle.js` の `pack()` を二段階にする。
- 全参照ID・個別容量・合計容量・MIME長をまず照合し、超過時は音声Blobの読み込みやSHA-256に入る前に拒否する。
- その後に既存のSHA-256計算・manifest作成を実施する。
- 音源実体・SONG ID・TAKE・トラック編集情報・保存DB・本番URLを変更しない。
- 既存の `ASAHIMusicBackup` (CRC32形式) とは別のバンドル形式であり、フォーマットや上限を変更しない。

## 回帰証拠
- `tests/music-portable-bundle.test.mjs` に実データを大量生成しない、4件×200MB相当のサイズ報告だけを行うテストBlobを追加。
- テストBlobは音声データ読み込み時に例外を発するため、上限超過をSHA-256前に拒否したことを検査できる。
- オフラインテストCI: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/41783961587
- 変更時ブラウザ連携CI: https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/41783940084

## 境界
これらは合成データによる開発版CIの合格。iPhone/Android実機、本番統合、実GPU接続の証拠ではない。公開反映には別途承認が必要。
