# Runbook — Scale Phase B (2 Instances)

This document is **operational preparation** for scaling the POC from **1 instance** to **2 NestJS instances** behind Nginx — **not yet deployed** until metric triggers are met (section 2).

Related: [project-overview.md](./project-overview.md) §10, [chat-rate-limit-quota.md](./chat-rate-limit-quota.md) §H7, [doppler-secrets.md](./doppler-secrets.md), `deploy/nginx/`.

---

## 1. Phase B Objectives

| | |
|---|---|
| **Scale** | ~200–800 active students; chat surges during peak hours (evenings, after notifications) |
| **Architecture** | 2 Nest containers + Nginx `upstream` + Redis + shared PostgreSQL |
| **No changes** | Meta webhook URL, DB schema, logic in `src/` |
| **Reference VPS** | `69.62.74.196` — 2 vCPU, Redis already running (`~/redis`) |

**What it solves:** multiple users messaging **at the same time** → 2 pods handle webhook / chat flush in parallel.

**Still bottlenecked at:** OpenAI RPM/TPM (2 pods share same API key); reminders >50 jobs due per cycle (LLM sequential).

---

## 2. When to Deploy (Trigger)

**Do not** enable early just because it is ready. Enable when **≥2** of the following signs persist for several days:

| Metric | Suggested threshold |
|--------|-------------------|
| CPU process messenger | >50% during peak hours |
| Chat latency (webhook → reply) | p95 >25–30s (excluding users who exhausted quota) |
| OpenAI logs | 429 / timeout increasing noticeably |
| Dead-letter webhook | Retry / backlog increasing |

**Current POC status (reference):** 1 container ~50 MB RAM, CPU ~0% → **keep 1 instance**; this runbook is on standby for when needed.

Monitor before scaling:

```bash
npm run ops:health
docker stats messenger-bot --no-stream   # on VPS
```

---

## 3. Target Architecture Diagram

```text
Meta webhook
    → Nginx (aiassist.aihubproduction.com)
        → round-robin
            → messenger-bot-1  127.0.0.1:5007
            → messenger-bot-2  127.0.0.1:5008
                    ↓
            Redis (dedupe, queue, history)
            PostgreSQL (ai_chat_bot_db)
            OpenAI / Wispace API / Meta Send API
```

- **No** sticky session — each webhook goes to any pod.
- Chat state must live in **Redis + DB**, not single-pod RAM → `CHAT_QUEUE_SHARED=true` is mandatory.

---

## 4. Trade-offs — Benefits vs Costs

This section answers: **what do you gain and what do you pay for scaling to 2 instances** — to decide if it is worth enabling when the trigger (section 2) is met.

### 4.1. Benefits

| Benefit | Explanation |
|---------|-------------|
| **Parallel webhook chat processing** | Multiple users messaging at once → Nginx splits requests across 2 pods; each pod flushes / calls LLM independently for different PSIDs. |
| **Reduced risk of single-process overload** | CPU / event loop of **one** Node does not carry the entire peak (evenings, after notifications). |
| **Smoother rolling deploys** | Can recreate pods one at a time; Nginx routes to the surviving pod (when upstream is configured correctly). |
| **Proper multi-pod architecture** | Redis store already exists — `CHAT_QUEUE_SHARED=true` is the mandatory step so chat does not break when LB splits webhooks. |
| **Report cron has leader** | Only 1 pod runs the 08:00 schedule; the other pod focuses on webhooks. |

Benefits are **most clear** when **many PSIDs chat simultaneously** and **single-instance CPU** is the bottleneck — **not** when there are just "many registered students" who rarely message.

### 4.2. Costs / Trade-offs

| Trade-off | Details |
|-----------|---------|
| **Operational complexity** | 2 containers, 2 ports, Nginx upstream, leader env, dual health checks, rollback more complex than 1 pod. |
| **Doppler + Compose** | Shared `.env` is not enough — `INSTANCE_ID` override per service; easy to misconfigure leader. |
| **2 vCPU VPS shared** | 2 pods + Postgres + Redis + other services **compete for CPU** — not "double the power". |
| **RAM & DB connections** | ~2× app process footprint; ~2× TypeORM connection pool to PostgreSQL. |
| **Cron / loop runs twice** | Reminder dispatch adaptive: **both pods** poll DB (`claimJob` prevents duplicate sends, but **adds query**). |
| **OpenAI does not double** | Same API key → **same RPM/TPM quota**; 2 pods may **hit 429 sooner** during high LLM peaks. |
| **Single-user latency nearly unchanged** | Still debounce ~2s + LLM ~5–20s — **does not** reduce individual wait time. |
| **Mandatory Redis dependency** | `CHAT_QUEUE_SHARED=true` — Redis down impacts multi-pod chat more heavily than single-instance mode (local RAM debounce). |
| **Harder debugging** | Logs from 2 containers; webhooks hit random pod — need `INSTANCE_ID` in logs when investigating. |
| **Deployment cost** | PR for compose + nginx + deploy script + cutover + 48h monitoring. |

### 4.3. Still Not Solved (Even with 2 Instances)

| Issue | Notes |
|-------|-------|
| OpenAI slow / 429 | Upgrade API tier; **`LlmExecutionService`** (`LLM_MAX_CONCURRENT`, retry) ✓ — multi-pod needs Redis gate later |
| >50 reminders due in same minute | Still sequential LLM, `LIMIT 50`/dispatch cycle |
| 30-minute full-scan sync cron | Load grows with user count; advisory lock — does not scale by adding chat pods |
| Meta Send API | Nearly never a bottleneck at IELTS student scale |

### 4.4. Quick Comparison

| | 1 instance | 2 instances (Phase B) |
|---|-----------|----------------------|
| Concurrent webhook | Limited to 1 CPU / 1 event loop | Better (2 event loops) |
| Single-user latency | ~2s debounce + LLM | **Nearly identical** |
| Ops complexity | Low | Higher |
| OpenAI pressure | 1 thread | 2 threads → easier to hit 429 at peak |
| Machine cost | Low | Higher (~2 processes) |
| Best when | Low load (current prod) | CPU/webhook peak, chat surges |

### 4.5. Practical Conclusion

**What you gain:** ability to **split HTTP / chat concurrency** and **CPU headroom** during peaks.

**What you pay:** **operational complexity**, **Redis dependency**, **~2× process resources**, **no improvement** in per-user LLM latency or OpenAI quota doubling.

With a **2-core** VPS and **~0% CPU** load (prod reference) → benefits are **nearly zero**, only costs — **keep 1 instance** until section 2 metrics reach threshold.

**Lighter alternatives before scaling:** upgrade OpenAI tier, monitor `npm run ops:health`, avoid deploys during peak hours — sometimes sufficient without needing a second pod.

---

## 5. Prerequisites (Pre-Cutover Checklist)

- [ ] Redis stable: `curl -sf http://127.0.0.1:5007/health/redis` → `{"ok":true,...}`
- [ ] Prod already has: `REDIS_ENABLED=true`, `CHAT_QUEUE_STORE=redis`, `CHAT_DEDUPE_STORE=redis`, `CHAT_HISTORY_STORE=redis`
- [ ] `CHAT_RATE_LIMIT_ENABLED=true`, `ENFORCE_PROD_CHAT_QUOTA=true`
- [ ] Backup `.env` / Doppler config `prd` (snapshot before changes)
- [ ] Deploy window: **outside peak chat hours** (avoid evenings after notifications)
- [ ] `sudo` access on VPS for `nginx -t && systemctl reload nginx`

---

## 6. Environment Variables

### 6.1. Shared (`.env` / Doppler `prd` — **same** on both pods)

Add or change when scaling:

```env
CHAT_QUEUE_SHARED=true

CRON_LEADER_ENABLED=true
CRON_LEADER_INSTANCE_ID=messenger-bot-1
```

Keep as-is (already in prod):

```env
REDIS_ENABLED=true
REDIS_HOST=redis.aihubproduction.com
CHAT_QUEUE_STORE=redis
CHAT_DEDUPE_STORE=redis
CHAT_HISTORY_STORE=redis
CHAT_RATE_LIMIT_ENABLED=true
```

**Do not** set `INSTANCE_ID` in Doppler if using a shared config — it would be the same on both pods (see 6.2).

### 6.2. Per-Pod Overrides (Docker Compose — **required**)

| Pod | `INSTANCE_ID` | `PORT` (inside container) | Bind host |
|-----|---------------|--------------------------|-----------|
| `messenger-bot-1` | `messenger-bot-1` | `5007` | `127.0.0.1:5007` |
| `messenger-bot-2` | `messenger-bot-2` | `5008` | `127.0.0.1:5008` |

### 6.3. Cron Leader — Read the Code Correctly

`ReportCronLeaderService` compares:

```text
INSTANCE_ID (current pod) === CRON_LEADER_INSTANCE_ID (leader name)
```

| Variable | Pod 1 | Pod 2 |
|----------|-------|-------|
| `CRON_LEADER_ENABLED` | `true` | `true` |
| `CRON_LEADER_INSTANCE_ID` | `messenger-bot-1` | `messenger-bot-1` (**same**) |
| `INSTANCE_ID` | `messenger-bot-1` | `messenger-bot-2` (**different**) |

→ Only pod 1 runs the **08:00 report cron** and **retry dispatch `*/15`**. Pod 2 logs: `Report cron skipped on non-leader instance`.

**Warning:** `CRON_LEADER_ENABLED=true` without `CRON_LEADER_INSTANCE_ID` → **both pods** still run cron (with warn log; R4 claim still prevents duplicate sends but wastes resources).

### 6.4. Doppler

- Shared secrets: `CHAT_QUEUE_SHARED`, `CRON_LEADER_*` — upload to config `prd`.
- `INSTANCE_ID` / pod 2 port: **do not** put in shared Doppler — override in each service's `docker-compose`.
- After Doppler deploy: webhook `/messenger/ops/doppler-sync` recreates container — ensure compose for both services retains `INSTANCE_ID` overrides.

---

## 7. Infrastructure Changes (when implementing — reference)

> This section describes **what will be done**; repo files have **not** changed yet until the team decides to deploy.

### 7.1. Docker Compose

Currently (`docker-compose.prod.yml`): single service, fixed `container_name: messenger-bot` → **cannot** scale.

Target: two services `messenger-bot-1` / `messenger-bot-2`, remove fixed `container_name`, each service with its own host port.

Concept:

```yaml
services:
  messenger-bot-1:
    image: ${IMAGE}
    env_file: .env
    environment:
      INSTANCE_ID: messenger-bot-1
      PORT: "5007"
    ports:
      - "127.0.0.1:5007:5007"
    # volumes, user, group_add — same as current service

  messenger-bot-2:
    image: ${IMAGE}
    env_file: .env
    environment:
      INSTANCE_ID: messenger-bot-2
      PORT: "5008"
    ports:
      - "127.0.0.1:5008:5008"
```

VPS deploy path: `/home/ngoc_anh/messenger-bot/`.

### 7.2. Nginx

File: `/etc/nginx/sites-available/aiassist.aihubproduction.com` (repo: `deploy/nginx/aiassist.aihubproduction.com.conf`).

Add `upstream` and change `proxy_pass`:

```nginx
upstream messenger_bot {
    server 127.0.0.1:5007;
    server 127.0.0.1:5008;
}

location = /webhook {
    proxy_pass http://messenger_bot;
    # keep client_max_body_size, limit_req, headers as before
}

location / {
    proxy_pass http://messenger_bot;
    # keep headers as before
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 7.3. Deploy Script (`.github/scripts/vps-deploy.sh`)

Needs to be extended for real deployment:

- Health check **both** `:5007` and `:5008` (`/health/db`, `/health/redis`)
- `docker compose ps` — 2 services healthy
- Log tail for both containers

---

## 8. Per-Flow Behavior After Scaling

| Flow | 2 instances |
|------|------------|
| Chat text | Webhook → any pod → Redis buffer (`CHAT_QUEUE_SHARED`) → worker polls every 2s to flush |
| `mid` dedupe | Redis — cross-pod |
| Daily quota | PostgreSQL atomic (H3) |
| 08:00 reports | Only leader `INSTANCE_ID=messenger-bot-1` |
| Report retry `*/15` | Only leader |
| Reminder dispatch | **Both pods** adaptive loop; `claimJob` — no duplicate sends |
| 30-minute study sync | Advisory lock — 1 pod at a time |
| Evening rollover / cleanup | Advisory lock — 1 pod at a time |
| Dead-letter webhook 5min | Advisory lock — 1 pod at a time |

---

## 9. Deployment Procedure (Draft)

### 9.1. Pre-Cutover

1. Snapshot Doppler `prd` + backup `~/messenger-bot/.env`
2. Merge ops PR (compose + nginx + deploy script) — when code is ready
3. Set Doppler: `CHAT_QUEUE_SHARED=true`, `CRON_LEADER_ENABLED=true`, `CRON_LEADER_INSTANCE_ID=messenger-bot-1`
4. Deploy new image + compose with 2 services
5. Update Nginx upstream → `nginx -t` → reload

### 9.2. Post-Cutover (15–30 minutes)

```bash
# Health per pod
curl -sf http://127.0.0.1:5007/health/db
curl -sf http://127.0.0.1:5008/health/db
curl -sf http://127.0.0.1:5007/health/redis
curl -sf http://127.0.0.1:5008/health/redis

# Through Nginx
curl -sf https://aiassist.aihubproduction.com/health/db

# Leader
docker logs messenger-bot-2 2>&1 | tail -50 | grep -i "Report cron skipped" || true

# Manual chat: send Messenger → bot replies; quota increments
npm run chat-quota:status -- --psid=<PSID>
```

Monitor for **48h**: CPU, RAM, `npm run ops:health`, OpenAI 429 logs, dead-letter.

### 9.3. Rollback

1. Nginx: change `proxy_pass` back to `127.0.0.1:5007` only
2. `docker compose stop messenger-bot-2` (or `up` single service)
3. `.env`: `CHAT_QUEUE_SHARED=false` (optional if reverting to 1 pod)
4. `CRON_LEADER_ENABLED=false`
5. Reload nginx + recreate pod 1

If odd chat behavior after rollback: check Redis keys with prefix `chat:*` (only flush when impact is understood).

---

## 10. Phase B Limits (Do Not Over-Expect)

| Issue | Phase B | Future direction |
|-------|---------|-----------------|
| OpenAI 429 at peak | May still happen | Upgrade API tier; increase `LLM_MAX_CONCURRENT` or add Redis gate with 2 pods |
| >50 reminders due in same minute | Reminders delayed a few minutes | Delayed queue / parallel workers (roadmap) |
| 30-minute full-scan sync | Load grows with user count | Wispace wire sync API (already exists) |
| VPS 2 core exhausted | Should not add pod 3 | Upgrade to 4 vCPU or separate VPS for messenger |

---

## 11. 1 vs 2 Instance Comparison (Current Prod)

| | 1 instance (current) | 2 instances (Phase B) |
|---|---------------------|----------------------|
| `CHAT_QUEUE_SHARED` | `false` | `true` |
| `CRON_LEADER_ENABLED` | `false` | `true` |
| Nginx | 1 backend `:5007` | `upstream` 5007 + 5008 |
| Container | `messenger-bot` | `messenger-bot-1`, `messenger-bot-2` |
| When to use | Low load | Trigger from section 2 met |

Detailed trade-offs: section 4.

---

## 12. Implementation Tasks (Not Part of This Runbook)

When the team decides to deploy, the ops-only PR includes:

1. `docker-compose.prod.yml` — 2 services + `INSTANCE_ID` override
2. `deploy/nginx/aiassist.aihubproduction.com.conf` — `upstream`
3. `.github/scripts/vps-deploy.sh` — health check both ports
4. `.env.example` — comment `CHAT_QUEUE_SHARED` + `CRON_LEADER_*` for scaling
5. Tick checklist in section 5 of this runbook

**No** `src/` changes needed for basic Phase B scaling.

---

*Preparation runbook — not yet deployed to production. Update the date on this runbook when the real cutover is performed.*