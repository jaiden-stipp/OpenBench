[CmdletBinding()]
param(
    [ValidateSet('auto', 'iverilog', 'verilator')]
    [string]$Simulator = 'auto'
)

$ErrorActionPreference = 'Stop'
$phaseRoot = Split-Path -Parent $PSCommandPath
$suiteRoot = Resolve-Path (Join-Path $phaseRoot '..\toolchain\oss-cad-suite')
$environmentScript = Join-Path $suiteRoot 'environment.ps1'
$drive = 'R:'

if (-not (Test-Path $environmentScript)) {
    throw "OSS CAD Suite was not found at '$suiteRoot'."
}

if (Get-PSDrive -Name $drive.TrimEnd(':') -ErrorAction SilentlyContinue) {
    throw "Temporary drive $drive is already in use."
}

try {
    & subst.exe $drive $suiteRoot
    if ($LASTEXITCODE -ne 0) { throw "Unable to mount OSS CAD Suite at $drive." }

    . $environmentScript
    $env:YOSYSHQ_ROOT = "$drive\"
    $env:PATH = "$drive\bin;$drive\lib;$env:PATH"
    $env:SSL_CERT_FILE = "$drive\etc\cacert.pem"

    Write-Host "OSS CAD Suite mounted at $env:YOSYSHQ_ROOT"
    & yosys -V
    if ($LASTEXITCODE -ne 0) { throw 'Yosys version probe failed.' }
    & iverilog -B "$drive\lib\ivl" -V
    if ($LASTEXITCODE -ne 0) { throw 'Icarus version probe failed.' }
    & (Join-Path $phaseRoot 'run-smoke.ps1') -Simulator $Simulator
}
finally {
    & subst.exe $drive /D 2>$null
}
