param(
  [string]$Version
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $Version) {
  $manifestPath = Join-Path $root "manifest.json"
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $Version = [string]$manifest.version
}

$distDir = Join-Path $root "dist"
$itemsToPackage = @(
  "manifest.json",
  "background.js",
  "content",
  "options",
  "icons"
)
$archiveNames = @(
  "dark-background-anti-flash-v$Version.zip",
  "dark-background-anti-flash-v$Version-amo.zip"
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Add-FileToArchive {
  param(
    [Parameter(Mandatory = $true)]
    [System.IO.Compression.ZipArchive]$Archive,
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,
    [Parameter(Mandatory = $true)]
    [string]$EntryName
  )

  $normalizedEntryName = $EntryName -replace "\\", "/"
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
    $Archive,
    $SourcePath,
    $normalizedEntryName,
    [System.IO.Compression.CompressionLevel]::Optimal
  ) | Out-Null
}

function Get-RelativeEntryPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BasePath,
    [Parameter(Mandatory = $true)]
    [string]$TargetPath
  )

  $baseUri = New-Object System.Uri(((Resolve-Path -LiteralPath $BasePath).Path.TrimEnd("\") + "\"))
  $targetUri = New-Object System.Uri((Resolve-Path -LiteralPath $TargetPath).Path)
  return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString())
}

function Add-PathToArchive {
  param(
    [Parameter(Mandatory = $true)]
    [System.IO.Compression.ZipArchive]$Archive,
    [Parameter(Mandatory = $true)]
    [string]$RelativePath
  )

  $absolutePath = Join-Path $root $RelativePath
  $resolvedPath = (Resolve-Path -LiteralPath $absolutePath).Path
  $item = Get-Item -LiteralPath $resolvedPath

  if ($item.PSIsContainer) {
    $files = Get-ChildItem -LiteralPath $resolvedPath -File -Recurse | Sort-Object FullName
    foreach ($file in $files) {
      $entryName = Get-RelativeEntryPath -BasePath $root -TargetPath $file.FullName
      Add-FileToArchive -Archive $Archive -SourcePath $file.FullName -EntryName $entryName
    }
    return
  }

  Add-FileToArchive -Archive $Archive -SourcePath $resolvedPath -EntryName $RelativePath
}

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

foreach ($archiveName in $archiveNames) {
  $archivePath = Join-Path $distDir $archiveName
  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }

  $fileStream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::CreateNew)
  try {
    $archive = New-Object System.IO.Compression.ZipArchive(
      $fileStream,
      [System.IO.Compression.ZipArchiveMode]::Create,
      $false
    )
    try {
      foreach ($itemToPackage in $itemsToPackage) {
        Add-PathToArchive -Archive $archive -RelativePath $itemToPackage
      }
    } finally {
      $archive.Dispose()
    }
  } finally {
    $fileStream.Dispose()
  }

  Write-Output "Created $archivePath"
}
