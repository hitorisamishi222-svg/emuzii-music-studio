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
