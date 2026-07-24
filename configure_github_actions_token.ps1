param(
  [string]$Repository = "sajjadka21/BBS_bargh",
  [string]$Workflow = "manual-operations.yml"
)

$ErrorActionPreference = "Stop"

function Get-HttpStatusCode {
  param([System.Management.Automation.ErrorRecord]$ErrorRecord)

  try {
    if ($null -ne $ErrorRecord.Exception.Response.StatusCode) {
      return [int]$ErrorRecord.Exception.Response.StatusCode
    }
  }
  catch {
  }

  return 0
}

$workerDirectory = Join-Path $PSScriptRoot "worker"

if (-not (Test-Path -LiteralPath $workerDirectory)) {
  throw "The worker directory was not found next to this script. Run it from the project root."
}

Write-Host "Enter the real GitHub fine-grained personal access token." -ForegroundColor Cyan
Write-Host "The token value usually starts with github_pat_. Do not enter the token display name." -ForegroundColor Yellow

$secureToken = Read-Host "GitHub token" -AsSecureString
$bstr = [IntPtr]::Zero
$token = $null

try {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)

  if ($null -eq $token) {
    throw "The token value is empty."
  }

  $token = $token.Trim()

  if ([string]::IsNullOrWhiteSpace($token)) {
    throw "The token value is empty."
  }

  if ($token -notmatch "^(github_pat_|ghp_)") {
    Write-Host "Warning: the value does not start with github_pat_ or ghp_." -ForegroundColor Yellow
  }

  $headers = @{
    Accept = "application/vnd.github+json"
    Authorization = "Bearer $token"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent" = "bbs-bargh-token-check"
  }

  try {
    $user = Invoke-RestMethod `
      -Method Get `
      -Uri "https://api.github.com/user" `
      -Headers $headers
  }
  catch {
    $status = Get-HttpStatusCode -ErrorRecord $_

    if ($status -eq 401) {
      throw "GitHub rejected the token with 401 Bad credentials. Create a new token and copy the generated token value, not its display name."
    }

    throw
  }

  Write-Host "GitHub authentication succeeded for user: $($user.login)" -ForegroundColor Green

  $repositoryUrl = "https://api.github.com/repos/$Repository"

  try {
    $repositoryInfo = Invoke-RestMethod `
      -Method Get `
      -Uri $repositoryUrl `
      -Headers $headers
  }
  catch {
    $status = Get-HttpStatusCode -ErrorRecord $_

    if ($status -eq 403) {
      throw "The token is valid but does not have sufficient repository access."
    }

    if ($status -eq 404) {
      throw "The repository was not found through this token. Select BBS_bargh in Repository access."
    }

    throw
  }

  Write-Host "Repository access succeeded: $($repositoryInfo.full_name)" -ForegroundColor Green

  $encodedWorkflow = [Uri]::EscapeDataString($Workflow)
  $workflowUrl = "https://api.github.com/repos/$Repository/actions/workflows/$encodedWorkflow"

  try {
    $workflowInfo = Invoke-RestMethod `
      -Method Get `
      -Uri $workflowUrl `
      -Headers $headers
  }
  catch {
    $status = Get-HttpStatusCode -ErrorRecord $_

    if ($status -eq 403) {
      throw "The token is valid but cannot read GitHub Actions. Set Actions permission to Read and write."
    }

    if ($status -eq 404) {
      throw "The workflow was not found. Confirm that .github/workflows/manual-operations.yml exists on the main branch."
    }

    throw
  }

  Write-Host "Workflow found: $($workflowInfo.name)" -ForegroundColor Green
  Write-Host "Workflow state: $($workflowInfo.state)" -ForegroundColor Green

  if ($workflowInfo.state -ne "active") {
    throw "The workflow is not active in GitHub Actions."
  }

  Push-Location $workerDirectory

  try {
    $token | & npx wrangler secret put GITHUB_ACTIONS_TOKEN

    if ($LASTEXITCODE -ne 0) {
      throw "Wrangler could not save GITHUB_ACTIONS_TOKEN."
    }
  }
  finally {
    Pop-Location
  }

  Write-Host "GITHUB_ACTIONS_TOKEN was validated and saved in Cloudflare." -ForegroundColor Green
  Write-Host "Run a manual Fetch from the Telegram admin panel to verify Actions write access." -ForegroundColor Cyan
}
finally {
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }

  $token = $null
  $secureToken = $null

  Remove-Variable token -ErrorAction SilentlyContinue
  Remove-Variable secureToken -ErrorAction SilentlyContinue
}