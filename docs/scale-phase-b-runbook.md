# Runbook — Scale Giai đoạn B (2 instance)

Tài liệu **chuẩn bị vận hành** khi POC tăng từ **1 instance** lên **2 instance** NestJS phía sau Nginx — **chưa triển khai** cho đến khi có trigger metric (mục 2).

Liên quan: [project-overview.md](./project-overview.md) §10, [chat-rate-limit-quota.md](./chat-rate-limit-quota.md) §H7, [doppler-secrets.md](./doppler-secrets.md), `deploy/nginx/`.

---

## 1. Mục tiêu Giai đoạn B

| | |
|---|---|
| **Quy mô** | ~200–800 học viên active; chat dồn giờ (tối, sau thông báo) |
| **Kiến trúc** | 2 container Nest + Nginx `upstream` + Redis + PostgreSQL dùng chung |
| **Không đổi** | URL webhook Meta, schema DB, logic trong `src/` |
| **VPS tham chiếu** | `69.62.74.196` — 2 vCPU, Redis đã chạy (`~/redis`) |

**Chia được gì:** nhiều user nhắn **cùng lúc** → 2 pod xử lý webhook / flush chat song song.

**Vẫn nghẽn ở:** OpenAI RPM/TPM (2 pod dùng chung API key); nhắc lịch >50 job due/vòng (tuần tự LLM).

---

## 2. Khi nào mới triển khai (trigger)

**Không** bật sớm chỉ vì chuẩn bị. Bật khi **≥2** dấu hiệu sau kéo dài vài ngày:

| Metric | Ngưỡng gợi ý |
|--------|----------------|
| CPU process messenger | >50% trong giờ cao điểm |
| Latency chat (webhook → reply) | p95 >25–30s (trừ user hết quota) |
| Log OpenAI | 429 / timeout tăng rõ |
| Dead-letter webhook | Retry / backlog tăng |

**Hiện trạng POC (tham chiếu):** 1 container ~50 MB RAM, CPU ~0% → **giữ 1 instance**; runbook này để sẵn khi cần.

Monitor trước khi scale:

```bash
npm run ops:health
docker stats messenger-bot --no-stream   # trên VPS
```

---

## 3. Sơ đồ mục tiêu

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

- **Không** sticky session — mỗi webhook vào pod bất kỳ.
- State chat phải nằm **Redis + DB**, không RAM pod đơn lẻ → bắt buộc `CHAT_QUEUE_SHARED=true`.

---

## 4. Trade-off — lợi ích vs mất mát

Phần này trả lời: **scale 2 instance đổi lấy gì, trả giá gì** — để quyết định có đáng bật khi đạt trigger (mục 2).

### 4.1. Được gì (lợi ích)

| Lợi ích | Giải thích |
|---------|------------|
| **Xử lý song song webhook chat** | Nhiều user nhắn cùng lúc → Nginx chia request giữa 2 pod; mỗi pod flush / gọi LLM độc lập cho PSID khác nhau. |
| **Giảm nguy cơ 1 process quá tải** | CPU / event loop của **một** Node không gánh hết peak (tối, sau thông báo). |
| **Rolling deploy mềm hơn** | Có thể recreate từng pod; Nginx route sang pod còn sống (khi cấu hình upstream đúng). |
| **Bật đúng kiến trúc multi-pod** | Redis store đã có — `CHAT_QUEUE_SHARED=true` là bước bắt buộc để chat không vỡ khi LB chia webhook. |
| **Cron báo cáo có leader** | Chỉ 1 pod chạy schedule 08:00; pod còn lại tập trung webhook. |

Lợi ích **rõ nhất** khi **nhiều PSID chat cùng lúc** và **CPU 1 instance** là nút thắt — **không** phải khi chỉ “nhiều học viên đăng ký” mà ít nhắn.

### 4.2. Mất / trả giá gì (chi phí)

| Trade-off | Chi tiết |
|-----------|----------|
| **Độ phức tạp vận hành** | 2 container, 2 port, Nginx upstream, env leader, health check đôi, rollback phức tạp hơn 1 pod. |
| **Doppler + Compose** | `.env` chung không đủ — `INSTANCE_ID` override từng service; dễ cấu hình sai leader. |
| **2 vCPU VPS chia sẻ** | 2 pod + Postgres + Redis + service khác **tranh CPU** — không phải “gấp đôi sức mạnh”. |
| **RAM & connection DB** | ~2× footprint process app; ~2× connection pool TypeORM tới PostgreSQL. |
| **Cron / loop chạy 2 lần** | Nhắc lịch dispatch adaptive: **cả 2 pod** poll DB (`claimJob` chống gửi trùng, nhưng **thêm query**). |
| **OpenAI không nhân đôi** | Cùng API key → **cùng quota RPM/TPM**; 2 pod có thể **đụng 429 sớm hơn** khi peak LLM cao. |
| **Latency 1 user gần như không đổi** | Vẫn debounce ~2s + LLM ~5–20s — **không** giảm thời gian chờ cá nhân. |
| **Phụ thuộc Redis bắt buộc** | `CHAT_QUEUE_SHARED=true` — Redis down ảnh hưởng chat multi-pod nặng hơn mode 1 instance (debounce RAM local). |
| **Debug khó hơn** | Log 2 container; webhook vào pod ngẫu nhiên — cần `INSTANCE_ID` trong log khi điều tra. |
| **Chi phí triển khai** | PR compose + nginx + deploy script + cutover + theo dõi 48h. |

### 4.3. Vẫn không giải quyết được (dù đã 2 instance)

| Vấn đề | Ghi chú |
|--------|---------|
| OpenAI chậm / 429 | Nâng tier API; **`LlmExecutionService`** (`LLM_MAX_CONCURRENT`, retry) ✓ — multi-pod cần Redis gate sau |
| >50 nhắc lịch due cùng phút | Vẫn tuần tự LLM, `LIMIT 50`/vòng dispatch. |
| Sync lịch cron 30 phút | Tải tăng theo số user; advisory lock — không scale bằng thêm pod chat. |
| Meta Send API | Gần như không phải nút thắt ở quy mô học viên IELTS. |

### 4.4. So sánh nhanh

| | 1 instance | 2 instance (Giai đoạn B) |
|---|-------------|---------------------------|
| Concurrent webhook | Hạn chế 1 CPU / 1 event loop | Tốt hơn (2 event loop) |
| Latency 1 user | ~2s debounce + LLM | **Gần như giống** |
| Độ phức tạp ops | Thấp | Cao hơn |
| Áp lực OpenAI | 1 luồng | 2 luồng → dễ 429 hơn nếu peak |
| Chi phí máy | Thấp | Cao hơn (~2 process) |
| Phù hợp khi | Tải thấp (prod hiện tại) | CPU/webhook peak, chat dồn giờ |

### 4.5. Kết luận thực tế

**Đổi lấy:** khả năng **chia HTTP / chat concurrent** và **headroom CPU** khi peak.

**Trả giá:** **phức tạp vận hành**, **phụ thuộc Redis**, **~2× tài nguyên process**, **không** cải thiện latency LLM từng user hay nhân đôi quota OpenAI.

Với VPS **2 core** và tải **~0% CPU** (tham chiếu prod) → lợi ích **gần bằng 0**, chỉ có chi phí — **giữ 1 instance** cho đến khi metric mục 2 đạt ngưỡng.

**Thay thế nhẹ hơn trước khi scale:** nâng tier OpenAI, theo dõi `npm run ops:health`, tránh deploy giờ cao điểm — đôi khi đủ mà chưa cần pod thứ 2.

---

## 5. Điều kiện tiên quyết (checklist trước cutover)

- [ ] Redis chạy ổn: `curl -sf http://127.0.0.1:5007/health/redis` → `{"ok":true,...}`
- [ ] Prod đã có: `REDIS_ENABLED=true`, `CHAT_QUEUE_STORE=redis`, `CHAT_DEDUPE_STORE=redis`, `CHAT_HISTORY_STORE=redis`
- [ ] `CHAT_RATE_LIMIT_ENABLED=true`, `ENFORCE_PROD_CHAT_QUOTA=true`
- [ ] Backup `.env` / Doppler config `prd` (snapshot trước đổi)
- [ ] Cửa sổ triển khai: **ngoài giờ chat cao** (tránh tối sau thông báo)
- [ ] Quyền `sudo` trên VPS để `nginx -t && systemctl reload nginx`

---

## 6. Biến môi trường

### 6.1. Chung (`.env` / Doppler `prd` — **cùng** trên cả 2 pod)

Thêm hoặc đổi khi scale:

```env
CHAT_QUEUE_SHARED=true

CRON_LEADER_ENABLED=true
CRON_LEADER_INSTANCE_ID=messenger-bot-1
```

Giữ nguyên (prod đã có):

```env
REDIS_ENABLED=true
REDIS_HOST=redis.aihubproduction.com
CHAT_QUEUE_STORE=redis
CHAT_DEDUPE_STORE=redis
CHAT_HISTORY_STORE=redis
CHAT_RATE_LIMIT_ENABLED=true
```

**Không** đặt `INSTANCE_ID` trong Doppler nếu dùng chung một config — sẽ trùng trên cả 2 pod (xem 6.2).

### 6.2. Riêng từng pod (override Docker Compose — **bắt buộc**)

| Pod | `INSTANCE_ID` | `PORT` (trong container) | Bind host |
|-----|---------------|--------------------------|-----------|
| `messenger-bot-1` | `messenger-bot-1` | `5007` | `127.0.0.1:5007` |
| `messenger-bot-2` | `messenger-bot-2` | `5008` | `127.0.0.1:5008` |

### 6.3. Cron leader — đọc đúng code

`ReportCronLeaderService` so sánh:

```text
INSTANCE_ID (pod hiện tại) === CRON_LEADER_INSTANCE_ID (tên leader)
```

| Biến | Pod 1 | Pod 2 |
|------|-------|-------|
| `CRON_LEADER_ENABLED` | `true` | `true` |
| `CRON_LEADER_INSTANCE_ID` | `messenger-bot-1` | `messenger-bot-1` (**giống nhau**) |
| `INSTANCE_ID` | `messenger-bot-1` | `messenger-bot-2` (**khác nhau**) |

→ Chỉ pod 1 chạy cron **báo cáo 08:00** và **retry dispatch `*/15`**. Pod 2 log: `Report cron skipped on non-leader instance`.

**Cảnh báo:** `CRON_LEADER_ENABLED=true` mà thiếu `CRON_LEADER_INSTANCE_ID` → **cả 2 pod** vẫn chạy cron (có warn log; R4 claim vẫn chống gửi trùng nhưng lãng phí).

### 6.4. Doppler

- Secret chung: `CHAT_QUEUE_SHARED`, `CRON_LEADER_*` — upload lên config `prd`.
- `INSTANCE_ID` / port pod 2: **không** đưa vào Doppler chung — override trong `docker-compose` từng service.
- Sau deploy Doppler: webhook `/messenger/ops/doppler-sync` recreate container — đảm bảo compose 2 service vẫn giữ override `INSTANCE_ID`.

---

## 7. Hạ tầng cần thay (khi implement — tham chiếu)

> Phần này mô tả **việc sẽ làm**; file repo **chưa** đổi cho đến khi team quyết định triển khai.

### 7.1. Docker Compose

Hiện tại (`docker-compose.prod.yml`): một service, `container_name: messenger-bot` cố định → **không** scale được.

Mục tiêu: hai service `messenger-bot-1` / `messenger-bot-2`, bỏ `container_name` cố định, mỗi service một port host.

Khái niệm:

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
    # volumes, user, group_add — giống service hiện tại

  messenger-bot-2:
    image: ${IMAGE}
    env_file: .env
    environment:
      INSTANCE_ID: messenger-bot-2
      PORT: "5008"
    ports:
      - "127.0.0.1:5008:5008"
```

Deploy path VPS: `/home/ngoc_anh/messenger-bot/`.

### 7.2. Nginx

File: `/etc/nginx/sites-available/aiassist.aihubproduction.com` (repo: `deploy/nginx/aiassist.aihubproduction.com.conf`).

Thêm `upstream` và thay `proxy_pass`:

```nginx
upstream messenger_bot {
    server 127.0.0.1:5007;
    server 127.0.0.1:5008;
}

location = /webhook {
    proxy_pass http://messenger_bot;
    # giữ client_max_body_size, limit_req, headers như cũ
}

location / {
    proxy_pass http://messenger_bot;
    # giữ headers như cũ
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 7.3. Deploy script (`.github/scripts/vps-deploy.sh`)

Cần mở rộng khi triển khai thật:

- Health check **cả** `:5007` và `:5008` (`/health/db`, `/health/redis`)
- `docker compose ps` — 2 service healthy
- Log tail cả 2 container

---

## 8. Hành vi từng luồng sau scale

| Luồng | 2 instance |
|-------|------------|
| Chat text | Webhook → pod bất kỳ → buffer Redis (`CHAT_QUEUE_SHARED`) → worker poll 2s flush |
| Dedupe `mid` | Redis — cross-pod |
| Quota ngày | PostgreSQL atomic (H3) |
| Báo cáo 08:00 | Chỉ leader `INSTANCE_ID=messenger-bot-1` |
| Report retry `*/15` | Chỉ leader |
| Nhắc lịch dispatch | **Cả 2 pod** adaptive loop; `claimJob` — không gửi trùng |
| Sync study 30 phút | Advisory lock — 1 pod/lần |
| Evening rollover / cleanup | Advisory lock — 1 pod/lần |
| Dead-letter webhook 5 phút | Advisory lock — 1 pod/lần |

---

## 9. Quy trình triển khai (draft)

### 9.1. Trước cutover

1. Snapshot Doppler `prd` + backup `~/messenger-bot/.env`
2. Merge PR ops (compose + nginx + deploy script) — khi sẵn sàng code
3. Set Doppler: `CHAT_QUEUE_SHARED=true`, `CRON_LEADER_ENABLED=true`, `CRON_LEADER_INSTANCE_ID=messenger-bot-1`
4. Deploy image mới + compose 2 service
5. Cập nhật Nginx upstream → `nginx -t` → reload

### 9.2. Sau cutover (15–30 phút)

```bash
# Health từng pod
curl -sf http://127.0.0.1:5007/health/db
curl -sf http://127.0.0.1:5008/health/db
curl -sf http://127.0.0.1:5007/health/redis
curl -sf http://127.0.0.1:5008/health/redis

# Qua Nginx
curl -sf https://aiassist.aihubproduction.com/health/db

# Leader
docker logs messenger-bot-2 2>&1 | tail -50 | grep -i "Report cron skipped" || true

# Chat thủ công: nhắn Messenger → bot reply; quota tăng
npm run chat-quota:status -- --psid=<PSID>
```

Theo dõi **48h**: CPU, RAM, `npm run ops:health`, log OpenAI 429, dead-letter.

### 9.3. Rollback

1. Nginx: `proxy_pass` lại chỉ `127.0.0.1:5007`
2. `docker compose stop messenger-bot-2` (hoặc `up` một service)
3. `.env`: `CHAT_QUEUE_SHARED=false` (tùy chọn nếu về 1 pod)
4. `CRON_LEADER_ENABLED=false`
5. Reload nginx + recreate pod 1

Nếu chat lạ sau rollback: kiểm tra key Redis prefix `chat:*` (chỉ flush khi hiểu impact).

---

## 10. Giới hạn Giai đoạn B (không kỳ vọng quá)

| Vấn đề | Giai đoạn B | Hướng sau |
|--------|-------------|-----------|
| OpenAI 429 khi peak | Có thể vẫn xảy ra | Nâng tier API; tăng `LLM_MAX_CONCURRENT` hoặc Redis gate khi 2 pod |
| >50 nhắc due cùng phút | Nhắc muộn vài phút | Delayed queue / worker song song (roadmap) |
| Sync 30 phút full-scan | Tải tăng theo số user | Wispace wire sync API (đã có) |
| VPS 2 core đầy | Không nên thêm pod 3 | Nâng 4 vCPU hoặc VPS riêng messenger |

---

## 11. So sánh 1 vs 2 instance (prod hiện tại)

| | 1 instance (hiện tại) | 2 instance (Giai đoạn B) |
|---|----------------------|---------------------------|
| `CHAT_QUEUE_SHARED` | `false` | `true` |
| `CRON_LEADER_ENABLED` | `false` | `true` |
| Nginx | 1 backend `:5007` | `upstream` 5007 + 5008 |
| Container | `messenger-bot` | `messenger-bot-1`, `messenger-bot-2` |
| Khi nào | Tải thấp | Trigger mục 2 |

Chi tiết trade-off: mục 4.

---

## 12. Việc implement sau (không làm trong bước runbook này)

Khi team quyết định triển khai, PR ops-only gồm:

1. `docker-compose.prod.yml` — 2 service + `INSTANCE_ID` override
2. `deploy/nginx/aiassist.aihubproduction.com.conf` — `upstream`
3. `.github/scripts/vps-deploy.sh` — health 2 port
4. `.env.example` — comment `CHAT_QUEUE_SHARED` + `CRON_LEADER_*` khi scale
5. Tick checklist mục 5 trong runbook này

**Không** cần sửa `src/` cho scale cơ bản Giai đoạn B.

---

*Runbook chuẩn bị — chưa deploy production. Cập nhật ngày ghi runbook khi thực hiện cutover thật.*
