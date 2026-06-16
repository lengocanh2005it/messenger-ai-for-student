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
doppler secrets download → production.env → SCP VPS → .env
docker build → push ghcr.io/... → VPS docker compose pull && up -d
```

Nếu **chưa** set `DOPPLER_TOKEN`, CI bỏ qua bước sync env — VPS giữ `.env` cũ.

**`GHCR_PULL_TOKEN`:** classic PAT scope `read:packages` (cùng user sở hữu repo) để VPS `docker login` pull image private.

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
2. Doppler webhook gọi `POST https://aiassist.aihubproduction.com/messenger/ops/doppler-sync`.
3. App tải secret mới → ghi `/deploy/.env` → `docker compose up --force-recreate` (~ vài chục giây).

**Không cần** Re-run GitHub Actions chỉ để đổi env (deploy code vẫn qua push `main` như cũ).

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
