# ASAHI Vocal Project v1 — 連携仕様

歌入れ専用アプリで保存したプロジェクトをORISONと総合ミュージックへ渡す形式です。歌声・伴奏は元の音声ファイルのまま格納し、合成済みWAVで上書きしません。

- 拡張子：`.asahiproj`
- バイナリ構成：UTF-8 `ASAHI-PROJECT-V1\n`（17バイト）、little-endian uint32のJSONヘッダ長、UTF-8 JSONヘッダ、歌声バイト列、伴奏バイト列
- `manifest.schema`：`asahi-vocal-project-v1`
- `manifest.metadata.schema`：`asahi-vocal-take-v1`
- メタデータ：`songId`、`takeName`、`offsetSeconds`（-3〜+3秒）、`recordingMode`、音声情報など
- 各音声：`name`、`mimeType`、`size`、`crc32`。ない場合は`null`
- CRC32は偶発的破損検査用であり、暗号署名や本人認証ではありません
- 従来の歌声のみの`.asahitake`バックアップ形式とは別形式。旧バックアップは録音アプリ側で引き続き復元可能

## 統合用リーダー

`integration/asahi-project-reader.js` を読み込み、ファイル選択で得た `File` または `Blob` に対して次のAPIを使えます。

```js
const {metadata, vocalBlob, backingBlob} = await ASAHIProjectReader.read(file);
// metadata.songId の受け入れ可否は総合ミュージック側で確認する
// vocalBlob と backingBlob は元音声のまま、別TAKEとして保存する
```

読み取り時にサイズ、スキーマ、補正値、CRC32を検証します。リーダー自体はファイルを改変せず、ストレージ保存・サーバー通信も行いません。

## 現状と未実装

v0.12の歌入れ専用アプリはプロジェクトの書き出し・復元に対応しています。総合ミュージックの本番画面への直接取り込みボタン、SONG IDにひもづくTAKE登録、クラウド同期、編集済みプロジェクトの再書き出しは未実装です。総合ミュージック本番環境の既存データは変更していません。
