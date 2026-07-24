# راه‌اندازی استعلام ویژه برق‌من

این قابلیت برای شناسه قبض‌هایی است که کاربر در تلگرام ثبت می‌کند و مدیر آن‌ها را تأیید می‌کند.
بعد از تأیید:

- درخواست مستقیماً `active` می‌شود.
- GitHub Actions چند بار در روز همه قبض‌های فعال را از برق‌من استعلام می‌کند.
- نتیجه آخر در Cloudflare D1 ذخیره می‌شود.
- کاربر از بخش «استعلام ویژه» نتیجه را دستی می‌بیند.
- یادآوری ۳۰ دقیقه، ۶۰ دقیقه یا خاموش قابل انتخاب است.
- اگر JWT منقضی یا رد شود، به مدیر تلگرام هشدار می‌رسد.

## آیا CMD یا Chrome باید باز بماند؟

خیر. Chrome فقط یک‌بار برای ورود OTP و ساخت Secretها باز می‌شود. Fetchهای بعدی روی runner رایگان GitHub-hosted انجام می‌شوند و به لپ‌تاپ وابسته نیستند.

## ترتیب استقرار

### ۱. Push کردن کد

بسته تحویلی را Extract کنید و اسکریپت زیر را اجرا کنید:

```powershell
powershell `
  -ExecutionPolicy Bypass `
  -File .\install_and_push.ps1 `
  -RepoPath "D:\project\BBS_bargh"
```

اسکریپت:

1. یک branch به نام `agent/bargheman-special-service` می‌سازد.
2. فقط فایل‌های همین قابلیت را روی مخزن کپی می‌کند.
3. Python و TypeScript را تست می‌کند.
4. فقط فایل‌های مشخص را stage می‌کند.
5. commit و push انجام می‌دهد.

فایل‌های ZIP آزمایشی و untracked فعلی حذف یا stage نمی‌شوند.

### ۲. ساخت Pull Request و Merge

بعد از Push:

```powershell
gh pr create `
  --repo sajjadka21/BBS_bargh `
  --base main `
  --head agent/bargheman-special-service `
  --title "Add Bargheman special outage service" `
  --body "Adds approved bill fetching, manual lookup, 30/60-minute reminders, token health alerts, and address block-code outage numbers."
```

پس از بررسی، PR را Merge کنید. Workflow موجود `deploy-worker.yml` migrationهای D1 را قبل از Deploy اجرا می‌کند.

### ۳. بررسی Secretهای موجود

این Secretها باید از قبل در Repository وجود داشته باشند:

- `WORKER_SYNC_URL`
- `WORKER_SYNC_SECRET`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

`WORKER_SYNC_URL` می‌تواند URL کامل `/sync` باشد؛ اسکریپت پایه Worker را خودش تشخیص می‌دهد.

در Cloudflare Worker نیز این Secret باید وجود داشته باشد:

- `BILL_ID_ENCRYPTION_KEY`

> اگر قبلاً شناسه قبض رمزگذاری‌شده دارید، `BILL_ID_ENCRYPTION_KEY` را عوض نکنید؛ با تغییر آن، شناسه‌های قبلی دیگر رمزگشایی نمی‌شوند.

### ۴. یک‌بار ورود OTP و ذخیره Secret برق‌من

بعد از Merge یا حتی قبل از اجرای دستی workflow، در مخزن محلی اجرا کنید:

```powershell
cd "D:\project\BBS_bargh"

powershell `
  -ExecutionPolicy Bypass `
  -File .\run_bargheman_bootstrap.ps1
```

مراحل داخل Chrome:

1. وارد برق‌من شوید.
2. OTP را وارد کنید.
3. یکی از قبض‌های ثبت‌شده را باز کنید.
4. صفحه خاموشی برنامه‌ریزی‌شده همان قبض را باز کنید.
5. وقتی نتیجه نمایش داده شد، در PowerShell کلید Enter را بزنید.

اسکریپت این دو Secret را مستقیماً با `gh` ذخیره می‌کند:

- `BARGHEMAN_AUTHORIZATION`
- `BARGHEMAN_PLANNED_TEMPLATE`

توکن، OTP، شماره موبایل و بدنه قبض روی دیسک نوشته نمی‌شوند.

### ۵. اجرای تست دستی

از GitHub:

`Actions → Fetch Bargheman special outages → Run workflow`

یا با CLI:

```powershell
gh workflow run bargheman-special.yml --repo sajjadka21/BBS_bargh
```

وضعیت اجرا:

```powershell
gh run list `
  --repo sajjadka21/BBS_bargh `
  --workflow bargheman-special.yml `
  --limit 5
```

## برنامه Fetch

Workflow در ساعت‌های زیر به وقت ایران اجرا می‌شود:

- ۰۰:۳۰
- ۰۶:۰۰
- ۱۲:۰۰
- ۱۸:۰۰

Cloudflare Worker نیز هر ۱۵ دقیقه یادآوری‌های ۳۰/۶۰ دقیقه‌ای را بررسی می‌کند.

## ثبت قبض جدید

1. کاربر در ربات وارد «استعلام ویژه» می‌شود.
2. استان، شهرستان، نام اشتراک و شناسه قبض را ثبت می‌کند.
3. مدیر درخواست را باز می‌کند.
4. مدیر «تأیید» را می‌زند.
5. وضعیت مستقیم `active` می‌شود.
6. قبض باید در همان حساب برق‌منی که Bootstrap با آن انجام شده ثبت شده باشد.

اگر قبض در حساب برق‌من وجود نداشته باشد، وضعیت Fetch برای آن درخواست `not_registered` ثبت می‌شود و نتیجه قدیمی حذف نمی‌شود.

## انقضای توکن

JWT هنگام هر اجرا بررسی می‌شود:

- کمتر از ۱۴ روز تا انقضا: هشدار مدیر
- پاسخ 401 یا 403: هشدار ورود مجدد
- انقضای کامل: workflow با خطا متوقف می‌شود

برای تمدید فقط دوباره اجرا کنید:

```powershell
powershell -ExecutionPolicy Bypass -File .\run_bargheman_bootstrap.ps1
```

## شماره خاموشی عادی Maztozi

`outage_number` طولانی ارائه‌دهنده دیگر نمایش داده نمی‌شود. شماره خاموشی از عدد ابتدای آدرس ساخته می‌شود:

- `۱۵۳ - شهرک المپیک` → `153`
- `۴۲ خیابان اصلی` → `42`
- `خیابان ۱۲` → بدون شماره خاموشی

Migration `0011_address_block_codes.sql` شماره‌های قدیمی و cacheهای وابسته را پاک می‌کند تا Fetch بعدی مقدار درست را بسازد.
