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
