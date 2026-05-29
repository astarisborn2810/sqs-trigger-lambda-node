param(
    [string]$RepoName = "pearl-sqs-trigger-lambda-node",
    [ValidateSet("private", "public")]
    [string]$Visibility = "private"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

Push-Location $ProjectRoot
try {
    if (-not (Test-Path ".git")) {
        git init
    }
    git branch -M main
    git add .

    $status = git status --porcelain
    if ($status) {
        git commit -m "Initial PEARL SQS trigger Lambda Node.js implementation"
    }

    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if ($gh) {
        $remotes = git remote
        if ($remotes -notcontains "origin") {
            gh repo create $RepoName --$Visibility --source . --remote origin
        }
        git push -u origin main
        exit 0
    }

    Write-Host "GitHub CLI is not installed."
    Write-Host "Manual repo creation steps:"
    Write-Host "1. Create a GitHub repo named '$RepoName' in your GitHub account."
    Write-Host "2. Run: git remote add origin https://github.com/<your-user>/$RepoName.git"
    Write-Host "3. Run: git push -u origin main"
    exit 1
}
finally {
    Pop-Location
}
