# ASAHI Vocal v0.20.3 / MUSIC STUDIO v10.9.11 DEV

## v10.9.11 追加内容

v10.9.10 の ASAHI Vocal 連携診断を拡張し、実際の戻り経路を診断内で通す。

- 診断用 `.asahiproj` を端末内handoff DBへ `kind: to-studio` として保存。
- 実際の `ASAHI_VOCAL_RETURN` MessageEvent を発火。
- 本番と同じ `handleAsahiReturnMessage()` → `consumeAsahiReturnToken()` → `importAsahiProjectFile()` の経路で取り込み。
- `ASAHI_VOCAL_RETURN_ACK` を3秒以内に受信できることを確認。
- ACK後にhandoff DBの一時データが削除されることを確認。
- 戻った診断TAKEの配置が 3.10秒（sourceStartSec 3.25 + offsetSeconds -0.15）であることを確認。
- vocal CRC32記録が一致することを確認。
- 診断開始前から存在していた全トラックについて、順序とオブジェクト参照が変化していないことを確認。
- 診断後は元のtracks / SONG ID / TAKE名 / offsetへ復元し、診断用データを残さない。

## 既存のv10.9.10診断から継続する検査

- IndexedDB handoff保存 / 読込 / 削除。
- Blob読み戻し。
- 日本語TAKE名。
- sourceStartSec 3.25秒。
- offsetSeconds -0.15秒。
- .asahiproj CRC検査。
- 実取り込み位置 3.10秒。
- 同一TAKEの二重追加防止。

## 配信確認

- 開発版入口: HTTP 200。
- app-v10.3.2.html: HTTP 200。
- 配信本体タイトル: emuzii MUSIC STUDIO v10.9.11 DEV。
- 配信済みメインJavaScript: 構文PASS。
- postMessage戻りリスナー: あり。
- 診断用return MessageEvent: あり。
- ACK待機: あり。
- 既存トラック保持判定: あり。
- 診断用return token cleanup: あり。

## 実機で残る確認

- iPhone / Safariで「歌入れv0.20.3を開く」。
- 実録音後「総合ミュージックへ戻す」で元タブへTAKEが追加される。
- 実際のガイド / 他トラックが残る。
- ACK成功後にVocalタブが閉じる。
- ポップアップブロック時の同一タブフォールバック。
- Androidアプリは従来どおり `.asahiproj` ファイル受け渡し。

## 保護

本番URL / main は変更しない。v10.9.11は `feature/vocal-recorder-v1` 開発ブランチのみ。
