param(
  [ValidateSet("All", "Firefox", "Chrome")]
  [string]$Browser = "All",
  [string]$Version
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sharedDir = Join-Path $root "shared"
$buildDir = Join-Path $root "build"
$distDir = Join-Path $root "dist"
$platforms = if ($Browser -eq "All") {
  @("firefox", "chrome")
} else {
  @($Browser.ToLowerInvariant())
}

if ($Browser -eq "All") {
  $sourceVersions = @(
    $platforms | ForEach-Object {
      $sourceManifestPath = Join-Path (Join-Path $root $_) "manifest.json"
      $sourceManifest = Get-Content -Raw -LiteralPath $sourceManifestPath |
        ConvertFrom-Json
      [string]$sourceManifest.version
    } | Select-Object -Unique
  )

  if ($sourceVersions.Count -ne 1) {
    throw "Firefox and Chrome manifest versions must match before packaging."
  }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Assert-PathInsideRoot {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $fullRoot = [System.IO.Path]::GetFullPath($root).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar
  )
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $requiredPrefix = $fullRoot + [System.IO.Path]::DirectorySeparatorChar

  if (-not $fullPath.StartsWith(
    $requiredPrefix,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
    throw "Refusing to modify a path outside the repository: $fullPath"
  }
}

function Get-RelativeEntryPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BasePath,
    [Parameter(Mandatory = $true)]
    [string]$TargetPath
  )

  $baseUri = New-Object System.Uri(
    ([System.IO.Path]::GetFullPath($BasePath).TrimEnd("\") + "\")
  )
  $targetUri = New-Object System.Uri([System.IO.Path]::GetFullPath($TargetPath))
  return [System.Uri]::UnescapeDataString(
    $baseUri.MakeRelativeUri($targetUri).ToString()
  )
}

function New-PlatformPackage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Platform
  )

  $platformDir = Join-Path $root $Platform
  $manifestPath = Join-Path $platformDir "manifest.json"
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $manifestVersion = [string]$manifest.version

  if ($Version -and $Version -ne $manifestVersion) {
    throw (
      "Requested version $Version does not match " +
      "$Platform/manifest.json version $manifestVersion. " +
      "Update both manifests before packaging."
    )
  }

  $packageVersion = if ($Version) { $Version } else { $manifestVersion }
  $stagingDir = Join-Path $buildDir $Platform
  Assert-PathInsideRoot -Path $stagingDir

  if (Test-Path -LiteralPath $stagingDir) {
    Remove-Item -LiteralPath $stagingDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

  Get-ChildItem -LiteralPath $sharedDir -Force |
    Copy-Item -Destination $stagingDir -Recurse -Force
  Get-ChildItem -LiteralPath $platformDir -Force |
    Copy-Item -Destination $stagingDir -Recurse -Force

  $archiveName = "dark-background-anti-flash-$Platform-v$packageVersion.zip"
  $archivePath = Join-Path $distDir $archiveName
  Assert-PathInsideRoot -Path $archivePath

  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }

  $fileStream = [System.IO.File]::Open(
    $archivePath,
    [System.IO.FileMode]::CreateNew
  )
  try {
    $archive = New-Object System.IO.Compression.ZipArchive(
      $fileStream,
      [System.IO.Compression.ZipArchiveMode]::Create,
      $false
    )
    try {
      $files = Get-ChildItem -LiteralPath $stagingDir -File -Recurse |
        Sort-Object FullName
      foreach ($file in $files) {
        $entryName = Get-RelativeEntryPath `
          -BasePath $stagingDir `
          -TargetPath $file.FullName
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
          $archive,
          $file.FullName,
          $entryName,
          [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
      }
    } finally {
      $archive.Dispose()
    }
  } finally {
    $fileStream.Dispose()
  }

  Write-Output "Built unpacked extension: $stagingDir"
  Write-Output "Created store package: $archivePath"
}

New-Item -ItemType Directory -Force -Path $buildDir, $distDir | Out-Null

foreach ($platform in $platforms) {
  New-PlatformPackage -Platform $platform
}
