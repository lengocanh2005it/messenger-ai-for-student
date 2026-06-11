---
name: verify
description: Build and test this NestJS project before finishing a task. Use when completing code changes, before commit, or when user asks to verify/check the build.
disable-model-invocation: true
---

# Verify POC

Run in order; fix failures before reporting done:

```bash
npm run build
npm run test
npm run lint
```

If prompts changed, confirm `dist/prompts/` contains updated `.system.txt` files after build.

If study-reminder schedule logic changed, ensure `study-reminder-schedule.service.spec.ts` passes.

Do not commit unless user explicitly asks.
