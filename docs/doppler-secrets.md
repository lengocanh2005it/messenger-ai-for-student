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
doppler secrets download → production.env → SCP VPS → publish/.env
```

Nếu **chưa** set `DOPPLER_TOKEN`, CI bỏ qua bước sync — VPS giữ `.env` cũ (hành vi trước đây).

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

## 4. Rotate secret (vd. Meta App Secret)

1. Sửa giá trị trên Doppler dashboard (config `prd`).
2. Push `main` hoặc **Run workflow** Deploy → CI ghi `.env` mới lên VPS → `pm2 reload`.

Không cần SSH sửa `.env` tay.

---

## 5. Checklist

- [x] Project + configs `dev` / `prd` trên Doppler (`messenger-bot`)
- [x] Secrets `prd` từ VPS; `dev` từ local (PORT=3001)
- [x] GitHub secret `DOPPLER_TOKEN` (service token config `prd`)
- [ ] Deploy thành công; log CI có dòng `Applied .env from Doppler`
- [x] Repo: `.doppler.yaml` + `doppler setup` (dev)

---

## 6. Bảo mật

- **Không** commit `.env`, không paste secret trong PR/chat.
- Service token **chỉ read**, scope **một config** (`prd`).
- File trên VPS: `chmod 600` (CI dùng `install -m 600`).
