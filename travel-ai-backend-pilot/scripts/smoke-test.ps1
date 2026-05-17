param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,
  [string]$TenantId = "tenant_luxe_demo",
  [string]$SiteId = "luxevoyages.example"
)

$Base = $BaseUrl.TrimEnd('/')
$WidgetAdminKey = $env:WIDGET_ADMIN_KEY

if ([string]::IsNullOrWhiteSpace($WidgetAdminKey)) {
  Write-Error "WIDGET_ADMIN_KEY env var is required"
  exit 1
}

function Assert-Ok {
  param([string]$Url)
  try {
    $resp = Invoke-WebRequest -Uri $Url -Method GET -ErrorAction Stop
    if ($resp.StatusCode -ge 400) {
      throw "Status $($resp.StatusCode)"
    }
    Write-Output "OK $Url -> $($resp.StatusCode)"
  } catch {
    Write-Error "FAILED $Url : $_"
    exit 1
  }
}

function Post-Json {
  param(
    [string]$Url,
    [hashtable]$Body,
    [hashtable]$Headers = @{}
  )

  try {
    $resp = Invoke-WebRequest -Uri $Url -Method POST -ContentType "application/json" -Headers $Headers -Body ($Body | ConvertTo-Json -Depth 10) -ErrorAction Stop
    return $resp
  } catch {
    Write-Error "FAILED POST $Url : $_"
    exit 1
  }
}

Assert-Ok "$Base/health"
Assert-Ok "$Base/widget/v1.js"

$tokenResp = Post-Json -Url "$Base/v1/widget/token" -Headers @{ "x-widget-admin-key" = $WidgetAdminKey } -Body @{
  tenantId = $TenantId
  siteId = $SiteId
  ttlSeconds = 1800
}
Write-Output "OK /v1/widget/token -> $($tokenResp.StatusCode)"
$tokenBody = $tokenResp.Content | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($tokenBody.token)) {
  Write-Error "FAILED /v1/widget/token missing token"
  exit 1
}

$sessionResp = Post-Json -Url "$Base/v1/chat/session" -Body @{
  tenantId = $TenantId
  siteId = $SiteId
  visitorId = "smoke"
  consentGiven = $true
  widgetToken = $tokenBody.token
}
Write-Output "OK /v1/chat/session -> $($sessionResp.StatusCode)"
$sessionBody = $sessionResp.Content | ConvertFrom-Json

$messageResp = Post-Json -Url "$Base/v1/chat/message" -Body @{
  tenantId = $TenantId
  sessionId = $sessionBody.sessionId
  message = "We are planning a luxury honeymoon in Japan next year with a 25k budget and can move quickly."
}
Write-Output "OK /v1/chat/message -> $($messageResp.StatusCode)"

$contactResp = Post-Json -Url "$Base/v1/lead/contact" -Body @{
  tenantId = $TenantId
  sessionId = $sessionBody.sessionId
  contactEmail = "smoke.lead@example.com"
}
Write-Output "OK /v1/lead/contact -> $($contactResp.StatusCode)"
$contactBody = $contactResp.Content | ConvertFrom-Json
if (-not $contactBody.ok) {
  Write-Error "FAILED /v1/lead/contact did not return ok=true"
  exit 1
}

$escalateResp = Post-Json -Url "$Base/v1/handoff/escalate" -Body @{
  tenantId = $TenantId
  sessionId = $sessionBody.sessionId
  reason = "smoke-test escalation path validation"
}
Write-Output "OK /v1/handoff/escalate -> $($escalateResp.StatusCode)"

$escalateBody = $escalateResp.Content | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($escalateBody.crmExternalId)) {
  Write-Error "FAILED /v1/handoff/escalate missing crmExternalId"
  exit 1
}

Write-Output "SUMMARY health=ok widget=ok token=ok session=ok message=ok contact=ok handoff=ok tenant=$TenantId site=$SiteId session=$($sessionBody.sessionId) crmTask=$($escalateBody.crmExternalId)"
