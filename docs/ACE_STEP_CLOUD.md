# ACE-Step 1.5 Cloud Connection

## Architecture

iPhone / Android → Vercel `/api/ace/*` → ACE-Step 1.5 GPU REST API.

GPU側のAPIキーはブラウザへ保存しない。Vercel Environment Variablesだけに保存する。

## GPU / RunPod side

Official image:

```
ghcr.io/ace-step/ace-step-1.5:latest
```

REST API mode:

```
ACESTEP_MODE=api
ACESTEP_API_PORT=8001
ACESTEP_API_WORKERS=1
ACESTEP_QUEUE_WORKERS=1
```

API key protection:

```
ACESTEP_API_KEY=<long-random-secret>
```

Model guidance from ACE-Step official GPU compatibility docs:
- VRAM >= 24GB: 4B LM can be used for highest quality.
- 16-24GB tier: 1.7B LM is the recommended safer choice.
- If memory pressure occurs, use `ACESTEP_OFFLOAD_TO_CPU=true`.

Start with:

```
cd infra/runpod
cp .env.example .env
# Edit .env without committing secrets.
docker compose up -d
```

Health check:

```
curl -H "Authorization: Bearer <ACESTEP_API_KEY>" http://127.0.0.1:8001/health
```

## Vercel side

Create/link one fixed project from this repository: `hitorisamishi222-svg/emuzii-music-studio`.

Set these Production environment variables in the Vercel dashboard:

- `ACESTEP_API_URL` = HTTPS URL of the GPU API, without a trailing slash
- `ACESTEP_API_KEY` = the GPU-side ACE-Step API key
- `EMUZII_PROXY_TOKEN` = a separate access token entered by the user in the app
- `EMUZII_ALLOWED_ORIGIN` = optional production origin restriction

The proxy currently allows only:
- `/health`
- `/v1/models`
- `/v1/stats`
- `/format_input`
- `/release_task`
- `/query_result`
- `/v1/audio`

## Generation flow

1. `POST /release_task`
2. poll `POST /query_result`
3. use `GET /v1/stats` for queue/average-job timing estimates
4. fetch completed audio from `GET /v1/audio?path=...`

The app treats progress/remaining time as an estimate, not a fabricated completion percentage.

## Security

Do not commit real secrets to GitHub.
Do not put `ACESTEP_API_KEY` in browser storage.
Use `EMUZII_PROXY_TOKEN` only as the front-to-proxy access token.

## 2026-11-03 開発ブランチの安全性変更

`EMUZII_PROXY_TOKEN` が未設定の場合、`/api/ace/*` はHTTP 503で拒否する（従来の暗黙的な匿名許可を廃止）。値が設定されていても、不正な `X-Emuzii-Access` は401で拒否する。GPU URLが設定されてもトークン無しでGPUへ中継しない。適用範囲は現時点では `feature/vocal-recorder-v1` のみ。本番環境への反映は行っていない。

`tests/ace-proxy-contract.test.mjs` は `fetch` をモックに差し替え、実GPU接続・課金API・秘密鍵を使わずに検査。安全な開発環境ではトークン未設定を正常系と見なして匿名中継を許可しない。


## API契約照合（2026-11-03 / ACE-Step 1.5公式）
一次資料: https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md

- 生成: `POST /release_task` → `response.data.task_id`
- 照会: `POST /query_result` に `{"task_id_list":["<task_id>"]}` → `response.data[0].status` は0=処理中、1=成功、2=失敗
- 成功時: `response.data[0].result` はJSON文字列なので配列としてパース。各要素の `file` に `/v1/audio?path=...` を含む
- **Web中継特有の注意**：Vercel catch-allがルート指定に `req.query.path` を使うため、フロント→Vercel側は `GET /api/ace/v1/audio?audio_path=<encoded source path>` とする。プロキシは音声取得のときだけ `audio_path` をACE-Step上流の `path` に変換する。
- ブラウザへ上流のACE-Step APIキーや上流ホストを渡さない。ユーザーが明示的に実行するまでGPUへリクエストしない。
- 本資料はAPI仕様確認および**モック検査**の記録で、実GPU生成成功を示さない。
