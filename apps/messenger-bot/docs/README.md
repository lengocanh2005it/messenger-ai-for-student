# Project Documentation

POC **WISPACE × Facebook Messenger** — learning reports, study session reminders, and two-way IELTS chat AI via Messenger (OpenAI).

| Document | Content |
|----------|---------|
| [project-overview.md](./project-overview.md) | Overview: features, architecture, DB, API, cron, env, quota runbook (section 12) |
| [chat-rate-limit-quota.md](./chat-rate-limit-quota.md) | Chat rate limit **V1 ✓** + hardening **H1–H7 ✓**; ops scripts; `CHAT_QUEUE_SHARED` scale |
| [edge-cases-roadmap.md](./edge-cases-roadmap.md) | Project-wide gaps (linking, reports, reminders, chat, ops) + remediation phases |
| [messenger-link-security.md](./messenger-link-security.md) | `ref` / `userId` security: IDOR risks, HMAC vs one-time token, trade-offs, phase L4 |
| [messenger-link-integration.md](./messenger-link-integration.md) | Detailed linking flow (current vs L4) + **WISPACE API contract** (body/response) |
| [study-session-reminder.md](./study-session-reminder.md) | Reminders: sync → jobs → dispatch → LLM; `POST /messenger/study-calendar/sync` |
| [c2-master-implementation-plan.md](./c2-master-implementation-plan.md) | **Master plan C2** — quota Q0–Q2 + LLM T0–T2; PR-A→D; pre-implementation checklist |
| [llm-usage-tracking-plan.md](./llm-usage-tracking-plan.md) | Pointer → master plan (condensed version) |
| [scale-phase-b-runbook.md](./scale-phase-b-runbook.md) | **Preparation** for scaling to 2 instances (Phase B); after C2 |

AI agent guidelines: [AGENTS.md](../AGENTS.md). Code layer rules: `.claude/rules/clean-architecture.md`.

## WISPACE Integration (Study Session Reminders)

After each create / update / delete on the Wispace schedule API (`POST` / `DELETE` `/api/UserCalendar`):

```http
POST {messenger-service}/messenger/study-calendar/sync
Content-Type: application/json
X-Internal-Api-Key: {INTERNAL_API_KEY}

{ "userId": 2597 }
```

Details: [study-session-reminder.md §3.6](./study-session-reminder.md#36-api-sync-khi-lịch-học-thay-đổi).

## Ops (I1 + S1)

```bash
npm run ops:health
npm run chat-quota:status -- --ops
npm run study-reminder:jobs -- --failed
npm run study-reminder:jobs -- --stuck
```

Full runbook: [project-overview.md §12](./project-overview.md#12-runbook--rate-limit-chat-v1).
