Param(
  [string]$Prefix = "feature/mvp-",
  [string]$From = "main",
  [switch]$AllowStash,
  [switch]$OpenPR
)

$ErrorActionPreference = "Stop"

function Exec($args) {
  $pinfo = New-Object System.Diagnostics.ProcessStartInfo
  $pinfo.FileName = "git"
  $pinfo.Arguments = $args
  $pinfo.RedirectStandardOutput = $true
  $pinfo.RedirectStandardError = $true
  $pinfo.UseShellExecute = $false
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $pinfo
  $p.Start() | Out-Null
  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) {
    throw "git $args`n$stderr"
  }
  return $stdout.Trim()
}

# 0) Sanity checks
try {
  if (Exec "rev-parse --is-inside-work-tree" -ne "true") {
    throw "Not inside a Git repository."
  }
} catch {
  throw "Not inside a Git repository."
}

# 1) Clean or stash
$porcelain = Exec "status --porcelain"
if ($porcelain) {
  if ($AllowStash) {
    $stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
    Exec "stash push -u -m `"new-day auto-stash $stamp`""
    Write-Host "⚠️  Dirty tree detected → stashed (new-day auto-stash $stamp)."
  } else {
    throw "Working tree has uncommitted changes. Re-run with -AllowStash to stash automatically."
  }
}

# 2) Fast-forward the base branch (default: main)
Exec "fetch --prune origin" | Out-Null
Exec "switch $From" | Out-Null

# Check behind/ahead
$counts = Exec "rev-list --left-right --count $From...origin/$From"
$parts = $counts -split '\s+'
$ahead = [int]$parts[0]
$behind = [int]$parts[1]

if ($behind -gt 0) {
  # Pull fast-forward only
  Exec "pull --ff-only"
} else {
  Write-Host "✅ $From already up to date with origin/$From."
}

# 3) Create today's branch
$today = Get-Date -Format 'yyyy-MM-dd'
$newBranch = "$Prefix$today"

# If branch exists locally, just switch; else create
$existsLocal = (Exec "show-ref --verify --quiet refs/heads/$newBranch"; if ($LASTEXITCODE -eq 0) { $true } else { $false }) 2>$null
if ($existsLocal) {
  Exec "switch $newBranch" | Out-Null
  Write-Host "ℹ️  Branch $newBranch already exists locally – switched to it."
} else {
  Exec "switch -c $newBranch" | Out-Null
  Write-Host "✅ Created and switched to $newBranch."
}

# 4) Push & set upstream (idempotent)
try {
  Exec "push -u origin $newBranch" | Out-Null
  Write-Host "🚀 Pushed $newBranch and set upstream to origin/$newBranch."
} catch {
  # If remote exists already, set upstream explicitly
  Exec "branch --set-upstream-to=origin/$newBranch $newBranch" | Out-Null
  Write-Host "🔗 Set upstream to origin/$newBranch."
}

# 5) Show PR link (GitHub only)
$remoteUrl = Exec "remote get-url origin"
$prUrl = $null
if ($remoteUrl -match "github\.com[:/](.+?)/(.+?)(\.git)?$") {
  $owner = $Matches[1]
  $repo = $Matches[2]
  $prUrl = "https://github.com/$owner/$repo/compare/$newBranch?expand=1"
  Write-Host "🔗 PR URL: $prUrl"
  if ($OpenPR) {
    Start-Process $prUrl | Out-Null
    Write-Host "🌐 Opened PR page in your browser."
  }
} else {
  Write-Host "ℹ️  Origin is not GitHub; skipping PR URL."
}

# 6) Friendly footer
Write-Host ""
Write-Host "Done. You're on $newBranch. Happy shipping."
Write-Host "Tip: apply your stash later with 'git stash list' and 'git stash pop' if you used -AllowStash."
