# Nginx — messenger-bot production (VPS)

Domain: `https://aiassist.aihubproduction.com` → `127.0.0.1:5007` (Docker bind localhost only).

## Cài trên VPS (một lần / khi đổi config)

```bash
cd /home/ngoc_anh/messenger-bot   # hoặc clone repo

sudo cp deploy/nginx/messenger-bot-rate-limit.conf /etc/nginx/conf.d/
sudo cp deploy/nginx/aiassist.aihubproduction.com.conf /etc/nginx/sites-available/aiassist.aihubproduction.com
sudo ln -sf /etc/nginx/sites-available/aiassist.aihubproduction.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Docker — không expose port ra internet

`docker-compose.prod.yml`:

```yaml
ports:
  - '127.0.0.1:${PORT:-5007}:${PORT:-5007}'
```

Recreate container sau khi đổi:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

## Kiểm tra

```bash
curl -sf https://aiassist.aihubproduction.com/health/db
curl -sf --connect-timeout 3 http://127.0.0.1:5007/health/db
# Public IP:5007 phải fail / timeout
curl -sf --connect-timeout 3 http://$(curl -s ifconfig.me):5007/health/db && echo UNEXPECTED || echo OK_blocked
```

## Rate limit

- Zone `messenger_webhook`: 20 req/s per IP, burst 80 — chỉ `location = /webhook`
- Body: 256k webhook, 1m các path khác (khớp `HTTP_JSON_BODY_LIMIT` trong app)
