# komado installer for Windows (Windows PowerShell 5.1+).
#
#   irm https://raw.githubusercontent.com/RyuPrad/komado/main/install.ps1 | iex
#
# Ensures Node.js >= 20 is present (installs the LTS via winget if not), then
# installs komado globally with npm, which drops a native `komado` command on your
# PATH (usable from both PowerShell and CMD). Safe to re-run any time to update.
#
# Why npm and not the curl|bash installer? That one writes a *bash* launcher on the
# Unix PATH (Git Bash / WSL) which CMD and PowerShell can't see. npm installs a real
# komado.cmd on the Windows PATH, so `komado` just works.
#
# Works even under PowerShell's default (Restricted) execution policy: it calls npm
# via npm.cmd (a batch file, not policy-gated) instead of bare `npm`, which PS would
# otherwise resolve to npm.ps1 and refuse to load.

function Info($m) { Write-Host "> $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "! $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "x $m" -ForegroundColor Red }

function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# Re-read the machine + user PATH into this session, so a Node we just installed is
# found without the user having to close and reopen the terminal.
function Sync-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ';'
}

function Get-NodeMajor {
  if (-not (Have node)) { return 0 }
  try { return [int](node -p "process.versions.node.split('.')[0]" 2>$null) } catch { return 0 }
}

$nodeMajor = Get-NodeMajor
if ($nodeMajor -lt 20) {
  if ($nodeMajor -gt 0) { Warn "Node $(node -v) found, but komado needs >= 20 - installing the latest LTS..." }
  else                  { Info "Node.js not found - installing the LTS via winget..." }

  if (Have winget) {
    winget install --id OpenJS.NodeJS.LTS -e --source winget --silent --accept-source-agreements --accept-package-agreements
    Sync-Path
    $nodeMajor = Get-NodeMajor
  } else {
    Fail "winget isn't available on this PC. Install Node.js >= 20 from https://nodejs.org , then re-run this command."
    return
  }
}

if ($nodeMajor -lt 20) {
  Fail "Couldn't set up Node.js >= 20 automatically. Install it from https://nodejs.org (or run: winget install OpenJS.NodeJS.LTS), reopen your terminal, then re-run this installer."
  return
}

# Call npm via its .cmd shim. Bare `npm` in PowerShell resolves to npm.ps1, which
# the default Restricted execution policy refuses to load - and the thrown error
# leaves $LASTEXITCODE stale, so a `npm install` that never ran would otherwise
# look like success (https://github.com/RyuPrad/komado). npm.cmd is a batch file
# (not policy-gated) and always sets a reliable exit code.
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) {
  Fail "Node is installed but npm.cmd isn't on PATH yet. Close and reopen your terminal, then re-run this command."
  return
}

Info "Installing komado globally (npm i -g komado) ..."
& $npm install -g komado
if ($LASTEXITCODE -ne 0) {
  Fail "npm install failed - see the npm output above."
  return
}

# Trust presence, not just exit codes: confirm `komado` actually landed on PATH
# before claiming success. Catches the "npm global bin not on PATH yet" case too.
Sync-Path
if (-not (Have komado)) {
  Write-Host ""
  Fail "npm finished, but 'komado' isn't on your PATH."
  Write-Host "  This usually means npm's global bin just needs a PATH refresh:" -ForegroundColor Yellow
  Write-Host "  open a NEW terminal and run 'komado'." -ForegroundColor Yellow
  Write-Host "  (If it's still missing, npm's global prefix is: $(& $npm config get prefix))" -ForegroundColor DarkGray
  return
}

if (-not (Have chafa)) {
  Warn "chafa not found - komado will use character-cell rendering. For the crisp pixel viewer, install chafa (https://hpjansson.org/chafa/) and use a sixel-capable terminal (e.g. recent Windows Terminal)."
}

Write-Host ""
Write-Host "komado installed. Launch it by typing:  komado" -ForegroundColor Green
Write-Host "(If 'komado' isn't found, open a new terminal so PATH refreshes.)" -ForegroundColor DarkGray
