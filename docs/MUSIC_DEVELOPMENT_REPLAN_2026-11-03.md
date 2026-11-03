# ASAHI MUSIC STUDIO — 開発計画再構築（2026-11-03）

## 目的・設計原則

「作る。歌う。自分で直す。」を第一目的にする。MANUAL FIRST · EDIT 70% / AI ASSIST 30% は編集主体・AI補助という**設計思想**であって、機能割合の実測値ではない。完璧を待って停止するのでなく、使える形から安全に改善する。実機テストが止まっても、他の工程は進める。原則は低コスト・追加有料APIなし。

ユーザーの私的な会話本文、評価や感謝の言葉は公開リポジトリに転載しない。そこから得られた製品上の原則のみ記録する。

## 既存資産と確証

- 本番 main: `ec5b91b70829a085784a80fc9f4172daba0913e3`。公開URL・本番データ・リポジトリを変更しない。
- 開発 branch: `feature/vocal-recorder-v1`、Studio v10.9.16・Vocal v0.20.6。
- `integration/ASAHI_PROJECT_FORMAT.md`: 音声原本、SONG ID、TAKE、録音開始・ズレ補正、旧形式互換を保護。
- 実ChromiumでStudio⇄Web Vocalは往復合格：GitHub Actions Run [41264984862](https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/41264984862)。
- Android R6 QA APKのビルド・署名/同梱HTML検査は合格：Run [41264984847](https://github.com/hitorisamishi222-svg/emuzii-music-studio/actions/runs/41264984847)。**Android実機テストではない**。
- ACE-Step 1.5は`api/ace/[...path].js` にプロキシ実装、`docs/ACE_STEP_CLOUD.md` に手順あり。ただし実GPU接続・音楽生成は未実証であり、費用や秘密鍵の設定を勝手に行わない。
- ASAHI COMMON ENGINE は別案件で作業キュー/復元/承認の試作が進んだが、本リポジトリとの実API接続・常時稼働は**未実証**。この計画ファイルを「接続済み」と誤認しない。

## 継続実行できる仕事の区分

本計画は `planning/music-roadmap-v1.json` が正本。`node scripts/music-plan.mjs --next` は依存関係が満たされた最優先の実行候補だけを表示。`--json` は `eligible` / `waiting` / `blocked` / `done` を区分。**読み取り専用**で、タスク実行、GitHub push、デプロイ、GPU課金、通知送信、別システムへの同期はしない。

優先順位：
1. 手動編集の実コード機能棚卸しと、未完成・不足機能の整理。
2. ACE-Stepの認証・未設定時のfail-closed監査（費用発生なし）。
3. SONG ID/TAKE/原音/タイミングの保存形式回帰。
4. 共通エンジンへ渡す作業・証拠・保留理由のローカル契約。実API照合後にのみ実連携。
5. 演奏・編曲・MIX・MASTER・書き出しの編集機能の改善。
6. Android実機確認は独立して保留。音楽制作本体を止めない。
7. 本番統合は明示承認・受入試験・rollback条件が整うまで禁止。

`done` には証拠が必須。依存未完了は `waiting`、人間承認/実機/GPU依存は `blocked`。合格済み検査の不必要な繰り返しを避け、変更の影響がある検査を行う。開発ブランチ以外は変更しない。

## 次のコード作業

最初の実行候補は MUSIC-010（MANUAL FIRST機能棚卸し）。同時に独立して着手できる候補は MUSIC-011（ACE-Step安全監査）、MUSIC-012（音声形式保護検査）、MUSIC-013（共通エンジン連携契約）。これは**開発用の候補提示であり、自律ワーカーが稼働しているという意味ではない**。
