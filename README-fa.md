# Patch فارسی‌سازی و اعلان دکمه‌ای خاموشی‌ها

این Patch دو تغییر را انجام می‌دهد:

1. آدرس، علت، نوع، تاریخ و ساعت قبل از ذخیره به نویسه‌ها و ارقام فارسی تبدیل می‌شوند. جستجوی کاربر نیز با همان قاعده نرمال می‌شود.
2. خاموشی‌های جدید دیگر مستقیم نمایش داده نمی‌شوند. یک اعلان کوتاه با دکمه شیشه‌ای «نمایش» ارسال می‌شود و جزئیات دقیق همان خاموشی‌های جدید پس از فشردن دکمه نشان داده می‌شود.

## نصب

در ریشه پروژه:

```powershell
cd "D:\project\BBS_bargh"

Expand-Archive `
  .\bbs-bargh-persian-notification-patch.zip `
  -DestinationPath . `
  -Force
```

## بررسی قبل از Commit

```powershell
python -m py_compile .\khamooshi_notify.py

cd .\worker
npm run typecheck
cd ..

git diff --stat
git status --short
```

فایل‌های تغییرکرده/جدید باید این‌ها باشند:

```text
khamooshi_notify.py
worker/src/persian.ts
worker/src/types.ts
worker/src/database.ts
worker/src/sync.ts
worker/src/telegram.ts
worker/migrations/0002_notification_batches.sql
```

## ثبت و Deploy

```powershell
git add khamooshi_notify.py worker

git commit -m "Normalize Persian outage data and add notification buttons"
git push
```

Workflow استقرار Worker، Migration جدید D1 را قبل از Deploy اعمال می‌کند.

## فعال‌کردن callback دکمه تلگرام

پس از موفق‌شدن Deploy، webhook را یک بار دوباره ثبت کن تا `callback_query` نیز فعال شود. از همان متغیرهای محرمانه محلی خودت استفاده کن و مقدارشان را در چت ارسال نکن:

```powershell
$Headers = @{
  Authorization = "Bearer $SyncSecret"
}

Invoke-RestMethod `
  -Method Post `
  -Uri "$WorkerUrl/admin/set-webhook" `
  -Headers $Headers
```

در اجرای بعدی Fetch، داده‌های فعلی D1 با شکل فارسی بازنویسی می‌شوند. کد مقایسه طوری نوشته شده که تغییر «ي/ك/اعداد» به‌تنهایی خاموشی‌های قبلی را به‌اشتباه جدید حساب نکند.
