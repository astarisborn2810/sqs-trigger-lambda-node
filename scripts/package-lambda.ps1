param(
    [string]$OutputPath = "dist/pearl-sqs-trigger-lambda-node.zip"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$DistDir = Join-Path $ProjectRoot "dist"
$StageDir = Join-Path $DistDir "package"
$ResolvedOutputPath = Join-Path $ProjectRoot $OutputPath

Push-Location $ProjectRoot
try {
    npm ci
    npm test
    npm run lint

    if (Test-Path $StageDir) {
        Remove-Item -LiteralPath $StageDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $StageDir | Out-Null

    Copy-Item -Path (Join-Path $ProjectRoot "src") -Destination $StageDir -Recurse
    Copy-Item -Path (Join-Path $ProjectRoot "package.json") -Destination $StageDir
    Copy-Item -Path (Join-Path $ProjectRoot "package-lock.json") -Destination $StageDir

    Push-Location $StageDir
    try {
        npm ci --omit=dev --ignore-scripts
    }
    finally {
        Pop-Location
    }

    if (Test-Path $ResolvedOutputPath) {
        Remove-Item -LiteralPath $ResolvedOutputPath -Force
    }

    Compress-Archive -Path (Join-Path $StageDir "*") -DestinationPath $ResolvedOutputPath -Force
    Write-Host "Created Lambda package: $ResolvedOutputPath"
}
finally {
    Pop-Location
}
