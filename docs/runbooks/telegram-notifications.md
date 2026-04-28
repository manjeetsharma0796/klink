---
title: Telegram notifications setup
purpose: One-time setup + maintenance runbook for the GitHub-Actions-driven Telegram bot that posts PR/push events to the team group
last_updated: 2026-04-28
---

# Telegram notifications

GitHub Actions workflow at [`.github/workflows/telegram-notify.yml`](../../.github/workflows/telegram-notify.yml) posts to a Telegram group on every PR and direct push. Zero infrastructure beyond two GitHub Secrets.

## 1. What this does

| Trigger | Tag |
|---|---|
| PR opened with title `claim: T-XXX` | `[CLAIM]` |
| PR opened with title `T-XXX —` | `[REVIEW]` |
| Other PR opened | `[PR]` |
| `claim:` PR merged | `[LOCK]` |
| `T-XXX` PR merged | `[DONE]` |
| Other PR merged | `[MERGED]` |
| Direct push to `main` (no PR) | `[PUSH]` |

Squash-merge commits and merge commits on push are skipped to avoid double-notifying — the PR-merged step has already announced them.

## 2. One-time setup

Done by one person. Total time ~10 minutes. The other devs only need to join the group (step 2.1).

### 2.1 Create the Telegram group

1. Telegram → menu → **New Group**.
2. Name: `klink-dev` (or whatever the team agrees).
3. Add the four devs.
4. Paste the group invite link in the team's existing channel so everyone confirms they joined.

### 2.2 Create the bot

1. In Telegram, open a chat with `@BotFather`.
2. Send `/newbot`.
3. Display name: `Klink CI`.
4. Username (must end in `bot`, globally unique): e.g. `klink_ci_bot`.
5. BotFather replies with a token like `7712345678:AAH...`. **This is the API key — treat as a password.** Save it for step 2.5.

### 2.3 Add the bot to the group

1. Open the `klink-dev` group → tap group name → **Add member**.
2. Search the bot's username → add.
3. Admin promotion is **not** required — the bot only needs to send messages.

### 2.4 Get the chat ID

The bot's privacy mode is on by default, which means it only sees `/commands` in groups. Two ways:

**Option A (fastest):** in the group, send `/start@klink_ci_bot` (or whatever the bot's username is). Then run, replacing the token:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"
```

In the JSON, find `"chat": { "id": -1001234567890, ... }`. **For groups the ID is negative**; supergroups start with `-100`. Save it.

**Option B:** message `@userinfobot` in DM, then forward any message from your group to it — it replies with the chat_id.

### 2.5 Add GitHub secrets

GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | the token from step 2.2 |
| `TELEGRAM_CHAT_ID` | the negative chat ID from step 2.4 |

Never commit either to the repo. They live only in GitHub Secrets and are injected at workflow runtime.

### 2.6 Smoke test

1. Open a throwaway PR titled `claim: T-999` against `main`. Expect a `[CLAIM]` message in Telegram within ~10 seconds.
2. Close it without merging — no merge message (correct).
3. Open another PR titled `T-999 — smoke test`. Merge it. Expect `[REVIEW]` then `[DONE]`.
4. Delete the throwaway branches.

If steps 1 or 3 produce no message, check the **Actions** tab → the workflow run → step logs. Common causes are below.

## 3. Setup attestation

The first dev to complete §2 fills in this row, which closes T-407.

| Dev | Date | Bot username | Group chat_id (last 4 digits, mask the rest) | Notes |
|---|---|---|---|---|
| _(pending)_ | YYYY-MM-DD | `@klink_ci_bot` | `...XXXX` | _e.g. used Option A for chat_id; supergroup migration auto-happened on add of 5th member_ |

## 4. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `getUpdates` returns `{ "ok": true, "result": [] }` | bot has privacy on and no command was sent | send `/start@<botname>` in the group, retry |
| Workflow runs but Telegram silent | wrong chat_id (positive instead of negative, or missing `-100` prefix for supergroups) | re-fetch chat_id with the bot's perspective via `getUpdates` |
| Workflow step exits with `Bad Request: chat not found` | bot was removed from group, or chat_id changed (group → supergroup migration) | re-add bot, re-fetch chat_id, update `TELEGRAM_CHAT_ID` secret |
| `parse_mode=Markdown` failure on a PR title containing literal `*` or backtick | Markdown can't be escaped in legacy mode | switch to `parse_mode=MarkdownV2` in the workflow and add `\` escaping, OR drop `parse_mode` entirely |
| Squash-merged PR triggers both `[DONE]` and `[PUSH]` | the regex skip in the push step missed an unusual commit format | tighten the regex in `.github/workflows/telegram-notify.yml` § "Push to main" |
| Bot can't be added to group | rare — bot was banned via @BotFather. Re-create or check `/mybots` settings | |

## 5. Rotating the bot token

If the token leaks (committed by accident, posted publicly, etc.):

1. `@BotFather` → `/mybots` → select bot → **API Token** → **Revoke current token**. Old token is dead immediately.
2. Copy the new token.
3. GitHub repo → Secrets → update `TELEGRAM_BOT_TOKEN`.
4. Trigger any PR event to verify the workflow still posts.

The chat_id does not change unless the group itself is recreated or migrates from group to supergroup.

## 6. Future extensions

| Idea | Trigger | When to do it |
|---|---|---|
| CI failure notification | `workflow_run: completed` referencing the CI workflow by name | after T-404 / T-405 land — the `workflow_run` trigger requires explicit workflow names, so it can't be wired generically yet |
| Daily stale-claim digest | `schedule: cron: '0 9 * * *'` | once T-101 is closed and real claims start landing |
| Devnet deploy notification | extra step in the deploy workflow | with T-113 |
| GitHub-username → Telegram-handle mapping for @-mentions | env-var map in the workflow | optional polish; ask the team if anyone wants it |
