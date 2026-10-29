# emuzii MUSIC STUDIO

統合音楽システム。曲生成・編曲・REFERENCE LIBRARY・カラオケ・ボーカル録音・実歌唱歌詞照合・SONG IDENTITYを1本の制作フローへ統合する。

## 運用方針
- GitHubリポジトリは固定: `hitorisamishi222-svg/emuzii-music-studio`
- Vercelプロジェクトも固定
- Flootは使わない
- 通常更新は既存プロジェクトへ反映
- ACE-StepのGPU秘密鍵はブラウザへ出さず、Vercel中継で保持

## Current
- emuzii MUSIC STUDIO v10.10
- REF-0001: 翠の覚醒-MIO-
- SONG-0001: 翠の覚醒-MIO-
- REFERENCE → 新曲制作への特徴参照
- カラオケ / ボーカルTAKE / A-B比較
- 実歌唱歌詞照合
- SONG IDENTITY / 制作履歴
- ACE-Step 1.5 REST Bridge
- Vercel secure proxy: `/api/ace/*`

## ACE-Step production env
Vercel側に以下を設定する。
- `ACESTEP_API_URL`
- `ACESTEP_API_KEY`
- `EMUZII_PROXY_TOKEN`
- `EMUZII_ALLOWED_ORIGIN`（必要な場合）

GPU側はACE-Step 1.5公式REST APIをworkers=1で運用する。


## ASAHI 歌入れ v0.20.5 × 総合ミュージック v10.9.13 自動往復（開発ブランチ）

- 総合ミュージックから SONG ID / TAKE名を付けて `/vocal/` を開ける。
- 同一オリジンの IndexedDB `asahi-vocal-handoff-v1` を使い、伴奏Blobを端末内だけで歌入れ画面へ受け渡す。
- 歌入れ側は `↩ 総合ミュージックへ戻す` で `.asahiproj` を端末内DBへ保存し、総合側へ戻って自動取り込みできる。
- 総合側は SONG ID が違うプロジェクトを拒否し、既存伴奏がある場合は伴奏を二重追加しない。
- 同じ SONG ID + 同じ歌声 CRC32 のTAKEは二重追加しない。TAKE名が同じでも音声CRCが違えば別TAKEとして追加できる。
- `🔗 連携診断` で handoff DB の書込・Blob読込・日本語TAKE名・開始位置/補正値に加え、テスト用 `.asahiproj` のCRC検査・実取り込み3.10秒配置・同一CRCの二重追加防止・診断後の元状態復元まで確認できる。
- Androidアプリ版はWebと同じオリジンではないため、自動往復ではなく `.asahiproj` ファイル受け渡しを使用する。
- 本番URLへの反映は未実施。


### v0.20.5 / v10.9.13 安全パッチ
- 同じ SONG ID + 同じ歌声 CRC32 のTAKEを重複追加しない。
- `🔗 連携診断` を追加。
- 6時間を過ぎた未使用handoffデータを起動時に自動削除。
- 歌入れ側で消費済み `handoff` パラメータをURLから削除。
- `sourceStartSec + offsetSeconds` が負になるTAKEも0秒へ丸めず保持し、再生/WAV時に先頭を正しくスキップ。
- Web版は元の総合ミュージックタブへ `postMessage` で自動返却し、応答がない場合は `asahiReturn` URL復帰へ切り替える。
- 総合ミュージック側は歌入れ前に自動保存し、URL復帰時は同じSONG IDの自動保存を先に復元してからTAKEを取り込む。
- Android版はWebと同一オリジンではないため、自動タブ往復ではなく `.asahiproj` ファイル受け渡しを使用する。


### 2026-10-29 回帰テスト固定
- 共通 `ASAHIProjectReader` を v1.1.1 へ更新。旧プロジェクトで `sourceStartSec` が無い場合は0秒へ正規化し、0〜7200秒・0.05秒刻みを検証する。
- `tests/vocal-bridge-contract.test.mjs` と GitHub Actions `Test Vocal Bridge Contract` を追加。
- Studio↔Vocalのhandoff DB、SONG ID、開始位置、補正値、CRC重複防止、postMessage ACK、実タブ診断隔離、旧形式互換、CRC破損拒否を変更時に自動検証する。
- ルート→ローダー→アプリ→Readerのキャッシュキーも v10.9.13 / Reader v1.1.1 用に更新。
