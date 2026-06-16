# Doppler — quản lý secret (prod + dev)

Production env trên VPS được **đồng bộ từ Doppler** mỗi lần GitHub Actions deploy (khi có `DOPPLER_TOKEN`). Local dev có thể dùng `doppler run` thay vì copy `.env` tay.

Liên quan: [project-overview.md](./project-overview.md) § deploy, `.github/workflows/deploy.yml`, `.env.example` (chỉ tên biến, không giá trị).

---

## 1. Tạo project trên Doppler (một lần)

1. Đăng ký [Doppler](https://dashboard.doppler.com/) → **Create Project** (vd. `messenger-bot`).
2. Tạo **configs**:
   - `dev` — máy dev / ngrok
   - `prd` — VPS production (`PORT=5007`, `CHAT_RATE_LIMIT_ENABLED=true`, …)
3. Import biến từ `.env` VPS hiện tại:

```bash
# Trên máy có file prod (không commit)
doppler login
doppler setup --project messenger-bot --config prd
doppler secrets upload /path/to/production.env
```

Hoặc paste từng key trên dashboard. **Không** commit file prod vào git.

4. Config `dev`: copy từ `prd` rồi chỉnh `PORT=3001`, URL local, tắt ops nếu cần.

---

## 2. GitHub Actions — service token

1. Doppler → Project **messenger-bot** → Config **prd** → **Access** → **Service Tokens** → Generate (read-only).
2. GitHub repo → **Settings** → **Secrets and variables** → **Actions** → New secret:
   - Name: `DOPPLER_TOKEN`
   - Value: token vừa tạo (chỉ gắn config `prd`)

Mỗi deploy `main` (hoặc workflow_dispatch):

```text
docker build → push ghcr.io/... → POST /messenger/ops/ci-deploy (HTTPS, không SSH)
```

Env prod: Doppler webhook → `POST /messenger/ops/doppler-sync` (không qua GitHub).

**GitHub secrets bắt buộc cho deploy HTTP:**

| Secret | Mục đích |
|--------|----------|
| `INTERNAL_API_KEY` | Bearer token — cùng giá trị `INTERNAL_API_KEY` trong Doppler `prd` |
| `GHCR_PULL_TOKEN` | (tuỳ chọn trên CI) — trên VPS đặt trong Doppler `prd` để container `docker pull` |

**Repository variable (tuỳ chọn):** `VPS_PUBLIC_URL` = `https://aiassist.aihubproduction.com` (mặc định trong script nếu không set).

Nếu **chưa** set `INTERNAL_API_KEY` trên GitHub Actions, bước deploy HTTP fail — thêm secret rồi re-run workflow.

**Lần đầu sau khi bật HTTP deploy:** VPS cần image có endpoint `ci-deploy`. SSH từ máy local (GitHub Actions thường bị chặn port 22):

```bash
cd ~/messenger-bot
echo "$GHCR_PULL_TOKEN" | docker login ghcr.io -u lengocanh2005it --password-stdin
export IMAGE=ghcr.io/lengocanh2005it/messenger-ai-for-student:latest
docker pull "$IMAGE"
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

Sau đó mọi push `main` chỉ cần CI build + HTTP trigger.

Nếu **chưa** set `DOPPLER_TOKEN`, workflow sync-env vẫn gọi webhook doppler-sync trên VPS (không tải env qua SCP).

---

## 3. Dev local với Doppler

```bash
# Cài CLI: https://docs.doppler.com/docs/install-cli
doppler login
doppler setup --project messenger-bot --config dev

# Chạy app (không cần file .env trên disk)
npm run start:dev:doppler

# Script khác
doppler run -- npm run study-reminder:jobs
```

Vẫn có thể dùng `.env` + `npm run start:dev` nếu chưa cài Doppler.

---

## 4. Đổi secret prod — full-auto (webhook VPS)

1. Sửa trên Doppler config **`prd`** (dashboard hoặc CLI).
2. Doppler webhook → `POST https://aiassist.aihubproduction.com/messenger/ops/doppler-sync` (tự sync + restart).

**Không cần** GitHub Actions khi chỉ đổi env.

**Thủ công (không webhook):** `npm run env:sync-prod` hoặc Actions → **Sync production env (no image build)**.

### CI deploy code (`deploy.yml`)

| Thay đổi git | CI làm gì |
|--------------|-----------|
| `src/`, `Dockerfile`, `package*.json` | lint + test + **build image** + deploy |
| Chỉ `docker-compose`, workflow, scripts | **Bỏ qua build** — VPS dùng image `:latest` |
| Chỉ `docs/` | **Không chạy** workflow |

Docker build vẫn dùng **GHA layer cache** (`cache-from/to: type=gha`).

### Setup webhook (một lần)

1. Doppler → **messenger-bot** → **prd** → **Webhooks** → Add.
2. **URL:** `https://aiassist.aihubproduction.com/messenger/ops/doppler-sync`
3. **Custom header:** `x-internal-api-key: <INTERNAL_API_KEY>` (giá trị trong config `prd`).
4. Trên Doppler `prd`, thêm secret:
   - `DOPPLER_RUNTIME_TOKEN` = service token read-only `prd` (cùng token GitHub secret `DOPPLER_TOKEN`).

Sau deploy image có tính năng này, kiểm tra tay:

```bash
curl -sS -X POST https://aiassist.aihubproduction.com/messenger/ops/doppler-sync \
  -H "x-internal-api-key: YOUR_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"project":"messenger-bot","config":"prd"}'
# → HTTP 202 {"accepted":true}
```

---

## 5. Rotate secret (vd. Meta App Secret)

1. Sửa giá trị trên Doppler dashboard (config `prd`) — webhook tự sync VPS.
2. Hoặc push `main` / Re-run Deploy — CI vẫn ghi `.env` khi deploy code.

Không cần SSH sửa `.env` tay.

---

## 6. Checklist

- [x] Project + configs `dev` / `prd` trên Doppler (`messenger-bot`)
- [x] Secrets `prd` từ VPS; `dev` từ local (PORT=3001)
- [x] GitHub secret `DOPPLER_TOKEN` (service token config `prd`)
- [ ] Deploy thành công; log CI có dòng `Applied .env from Doppler` và `Deployment complete — container messenger-bot is healthy`
- [x] Repo: `.doppler.yaml` + `doppler setup` (dev)

- [ ] Webhook Doppler → `POST /messenger/ops/doppler-sync` + `DOPPLER_RUNTIME_TOKEN` trên `prd`

---

## 7. Bảo mật

- **Không** commit `.env`, không paste secret trong PR/chat.
- Service token **chỉ read**, scope **một config** (`prd`).
- File trên VPS: `chmod 600` (CI dùng `install -m 600`).
