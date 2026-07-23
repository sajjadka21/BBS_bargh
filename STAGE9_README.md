# Stage 9 — Manual operations, special bill requests, and project support

This patch is cumulative over Stage 8.

## What changed

### Telegram administrator

`🛡 مدیریت` now includes the existing system status, user management, city management, and special-request review.

City management adds three explicitly manual operations:

- `🔄 Fetch کامل الان`
- `🔎 کشف شهرهای منتظر`
- `🌐 کشف همه شهرهای Maztozi`

Every operation asks for confirmation and dispatches a GitHub Actions workflow to the self-hosted runner. There is no weekly or automatic Maztozi discovery. The normal six-hour fetch remains separate.

When a new city is registered with automatic discovery, the bot offers `🔎 کشف الان` immediately. Discovery results never become active without a second administrator confirmation. Bulk discovery applies only clean, non-conflicting rows and never deletes existing cities automatically.

### Special bill-identifier requests

Authorized users can submit:

- province
- county
- a private label such as home/shop
- bill identifier

The bill identifier is normalized, encrypted with AES-GCM, and stored with only a hash and last four digits available for normal listings. The administrator must explicitly confirm before the full identifier is decrypted into the private admin chat.

Approval in this stage means “accepted for technical provider integration”. It does **not** claim that daily automatic lookup is already active. Each electricity provider still needs a tested adapter. Requests that cannot be supported can be rejected and the user is notified.

### Support

- Native Telegram Stars invoices: 25, 50, 100, or 250 Stars.
- Optional voluntary USDT support: wallet/network display, amount and TXID submission, then manual admin confirmation.
- USDT support never unlocks special access and is not a replacement for Stars for paid digital services.
- `/terms`, `/support`, and `/paysupport` are available.

### Browser installation

The discovery script uses the locally installed Google Chrome with Playwright. It does not download Playwright Chromium, avoiding the regional CDN 403 error.

## Install

```powershell
cd "D:\project\BBS_bargh"

Expand-Archive `
  .\stage9.zip `
  -DestinationPath . `
  -Force

python -W error -m py_compile `
  .\khamooshi_notify.py `
  .\discover_maztozi_sources.py `
  .\khamooshi_config.py

cd .\worker
npm run typecheck

npx wrangler d1 migrations apply `
  bbs-bargh-db `
  --remote

npx wrangler deploy
```

Expected migration:

```text
0010_manual_special_support.sql ✅
```

No database reset is required.

## One-time local Chrome check

```powershell
cd "D:\project\BBS_bargh"

powershell `
  -ExecutionPolicy Bypass `
  -File .\install_discovery.ps1
```

This only installs the Python Playwright package if missing and verifies that the system Google Chrome launches headlessly. It does not run `playwright install chromium`.

## GitHub Actions setup

The new workflow file must be committed on the default branch:

```text
.github/workflows/manual-operations.yml
```

The repository must already have these GitHub Actions secrets:

```text
WORKER_SYNC_URL
WORKER_SYNC_SECRET
```

Create a fine-grained GitHub personal access token restricted to `sajjadka21/BBS_bargh`, with repository permission `Actions: Read and write`. Store it only as a Cloudflare Worker secret:

```powershell
cd "D:\project\BBS_bargh\worker"
npx wrangler secret put GITHUB_ACTIONS_TOKEN
```

Do not paste the token into chat, source code, Git, or `wrangler.jsonc`.

Defaults used by the Worker:

```text
GITHUB_REPOSITORY=sajjadka21/BBS_bargh
GITHUB_WORKFLOW_FILE=manual-operations.yml
GITHUB_REF=main
```

They only need to be configured when the repository, workflow file, or branch changes.

## Bill identifier encryption key

Generate and store a strong, stable key. Losing or changing this key prevents old identifiers from being decrypted.

```powershell
cd "D:\project\BBS_bargh\worker"

$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$key = [Convert]::ToBase64String($bytes)
$key | npx wrangler secret put BILL_ID_ENCRYPTION_KEY
[Array]::Clear($bytes, 0, $bytes.Length)
Remove-Variable key
$rng.Dispose()
```

Keep an offline backup of this key in a password manager.

## Optional USDT setup

For manual USDT support, configure:

```powershell
cd "D:\project\BBS_bargh\worker"
npx wrangler secret put SUPPORT_USDT_ADDRESS
npx wrangler secret put SUPPORT_USDT_NETWORK
npx wrangler secret put SUPPORT_CONTACT
```

Examples of network labels are `TRC20` or `ERC20`. The configured address must belong to that exact network. A dedicated self-custody or merchant wallet is safer for attribution than a shared/rotating exchange deposit address. In this stage the administrator verifies the transaction manually before confirming it.

## Refresh Telegram webhook for Stars

After deployment, update the webhook so `pre_checkout_query` is included:

```powershell
$WorkerUrl = "https://bbs-bargh-bot.sajadkazemi1380.workers.dev"
$headers = @{ Authorization = "Bearer $env:WORKER_SYNC_SECRET" }

Invoke-RestMethod `
  -Method Post `
  -Uri "$WorkerUrl/admin/set-webhook" `
  -Headers $headers
```

## Commit and push

```powershell
cd "D:\project\BBS_bargh"

git add `
  .github/workflows/manual-operations.yml `
  khamooshi_notify.py `
  discover_maztozi_sources.py `
  install_discovery.ps1 `
  worker/src/cities.ts `
  worker/src/config.ts `
  worker/src/database.ts `
  worker/src/index.ts `
  worker/src/manual-operations.ts `
  worker/src/special-requests.ts `
  worker/src/support.ts `
  worker/src/telegram.ts `
  worker/src/types.ts `
  worker/migrations/0010_manual_special_support.sql `
  worker/admin/db_stats.sql `
  STAGE9_README.md

git commit -m "Add manual operations, special requests, and support payments"
git push
```

## First tests

1. Keep the self-hosted runner online.
2. In Telegram: `🛡 مدیریت` → `🏙 مدیریت شهرها` → `🔎 کشف شهرهای منتظر`.
3. Confirm the operation and wait for the completion message.
4. Confirm or reject the Neka source proposal.
5. Run `🔄 Fetch کامل الان` and confirm Neka appears in `/health` after activation.
6. Test `🌐 کشف همه شهرهای Maztozi`; review conflicts and apply only clean rows.
7. Submit one special lookup request using a test bill identifier, confirm masked display, test the sensitive reveal confirmation, then approve/reject it.
8. Test a small Stars invoice. For USDT, use a real transaction only after checking the wallet address and network twice.

## Important boundaries

- A manual action starts quickly only while the self-hosted runner is online and idle.
- Full Maztozi discovery is an on-demand live compatibility test; website UI changes can break selectors.
- No bulk result changes the database without administrator confirmation.
- Special lookup notifications are not activated until a provider adapter is tested and deployed for that region.
