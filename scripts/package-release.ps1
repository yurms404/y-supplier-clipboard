$ErrorActionPreference = 'Stop'
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseManifest = Get-Content -LiteralPath (Join-Path $releaseRoot 'manifest.json') -Raw | ConvertFrom-Json
$releaseOutput = Join-Path $releaseRoot 'dist'
New-Item -ItemType Directory -Path $releaseOutput -Force | Out-Null
$releaseZip = Join-Path $releaseOutput "y-supplier-clipboard-$($releaseManifest.version).zip"
if (Test-Path -LiteralPath $releaseZip) { throw "Archive already exists: $releaseZip" }
$releaseFiles = @('manifest.json', 'background.js', 'content.js', 'offscreen.html', 'offscreen.js', 'README.md', 'LICENSE', 'core', 'storage', 'ui', '_locales')
$releaseStage = Join-Path $releaseOutput ([Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $releaseStage | Out-Null
foreach ($releaseFile in $releaseFiles) {
    Copy-Item -LiteralPath (Join-Path $releaseRoot $releaseFile) -Destination $releaseStage -Recurse
}
if (Test-Path -LiteralPath (Join-Path $releaseRoot 'docs')) {
    # Markdown only: the folder also keeps a user supplied workbook with real supplier prices.
    $releaseDocs = Join-Path $releaseStage 'docs'
    New-Item -ItemType Directory -Path $releaseDocs | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $releaseRoot 'docs') -Filter '*.md' -File | Copy-Item -Destination $releaseDocs
}
New-Item -ItemType Directory -Path (Join-Path $releaseStage 'icons') | Out-Null
foreach ($releaseSize in @(16, 32, 48, 128)) {
    Copy-Item -LiteralPath (Join-Path $releaseRoot "icons/icon-$releaseSize.png") -Destination (Join-Path $releaseStage 'icons')
}
Compress-Archive -Path (Join-Path $releaseStage '*') -DestinationPath $releaseZip
# Keep staging files for inspection; no recursive deletion or overwrite.
Write-Output "Release: $releaseZip"
Write-Output "Staging: $releaseStage"
