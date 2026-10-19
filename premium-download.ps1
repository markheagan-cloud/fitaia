# FITAIA premium-avatar : téléchargement des sources CC0 (MakeHuman / MPFB2). Une seule fois, ~450 Mo.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dst = Join-Path $root 'assets-src'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
$log = Join-Path $root 'premium-download-log.txt'
"=== FITAIA premium : telechargement $(Get-Date) ===" | Out-File $log -Encoding utf8
$items = @(
  @{ name = 'mpfb2';         url = 'https://codeload.github.com/makehumancommunity/mpfb2/zip/refs/heads/master' },
  @{ name = 'system_assets'; url = 'https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip'; alt = 'https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip' },
  @{ name = 'shirts01';      url = 'https://files2.makehumancommunity.org/asset_packs/shirts01/shirts01_cc0.zip'; alt = 'https://files.makehumancommunity.org/asset_packs/shirts01/shirts01_cc0.zip' },
  @{ name = 'pants01';       url = 'https://files2.makehumancommunity.org/asset_packs/pants01/pants01_cc0.zip'; alt = 'https://files.makehumancommunity.org/asset_packs/pants01/pants01_cc0.zip' }
)
foreach ($it in $items) {
  $zip = Join-Path $dst ($it.name + '.zip')
  $out = Join-Path $dst $it.name
  if (Test-Path $out) { "$($it.name) : deja present" | Tee-Object -FilePath $log -Append; continue }
  "Telechargement $($it.name)..." | Tee-Object -FilePath $log -Append
  & curl.exe -L --fail --retry 3 -o $zip $it.url 2>&1 | Out-Null
  if ((-not (Test-Path $zip)) -or ((Get-Item $zip).Length -lt 100000)) {
    if ($it.alt) { & curl.exe -L --fail --retry 3 -o $zip $it.alt 2>&1 | Out-Null }
  }
  if (Test-Path $zip) {
    $mb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
    "  $mb Mo, extraction..." | Tee-Object -FilePath $log -Append
    New-Item -ItemType Directory -Force -Path $out | Out-Null
    & tar.exe -xf $zip -C $out 2>&1 | Out-Null
    Remove-Item $zip -Force
    "  OK" | Tee-Object -FilePath $log -Append
  } else {
    "  ECHEC du telechargement" | Tee-Object -FilePath $log -Append
  }
}
"=== FIN ===" | Tee-Object -FilePath $log -Append
Start-Sleep -Seconds 8
