[CmdletBinding()]
param(
    [ValidateSet('auto', 'iverilog', 'verilator')]
    [string]$Simulator = 'auto'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSCommandPath
$resultDir = Join-Path $root 'results'
New-Item -ItemType Directory -Force -Path $resultDir | Out-Null

function Require-Tool([string]$name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Required tool '$name' was not found on PATH. See INSTALL.md."
    }
}

Require-Tool yosys
Push-Location $root
try {
    # OSS CAD Suite's Windows path adapter calls GetShortPathName on output
    # arguments, which requires the target to exist on some NTFS setups.
    New-Item -ItemType File -Force -Path (Join-Path $resultDir 'rtlbench_smoke.json') | Out-Null
    $yosysScript = 'read_verilog -sv rtlbench_smoke.sv; hierarchy -top rtlbench_smoke; proc; write_json results/rtlbench_smoke.json'
    & yosys -p $yosysScript
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $resultDir 'rtlbench_smoke.json'))) {
        throw 'Yosys did not produce results/rtlbench_smoke.json.'
    }
    Write-Host 'Yosys JSON output:'
    Get-Content (Join-Path $resultDir 'rtlbench_smoke.json') -Raw

    if ($Simulator -eq 'auto') {
        if (Get-Command iverilog -ErrorAction SilentlyContinue) { $Simulator = 'iverilog' }
        elseif (Get-Command verilator -ErrorAction SilentlyContinue) { $Simulator = 'verilator' }
        else { throw "Neither Icarus Verilog nor Verilator was found on PATH. See INSTALL.md." }
    }

    Remove-Item -Force -ErrorAction SilentlyContinue 'rtlbench_smoke.vcd'
    if ($Simulator -eq 'iverilog') {
        Require-Tool vvp
        $iverilogArgs = @('-g2012')
        if ($env:YOSYSHQ_ROOT) {
            $iverilogArgs += @('-B', (Join-Path $env:YOSYSHQ_ROOT 'lib\ivl'))
        }
        $iverilogArgs += @('-o', (Join-Path $resultDir 'rtlbench_smoke_sim'), 'rtlbench_smoke.sv', 'rtlbench_smoke_tb.sv')
        & iverilog @iverilogArgs
        if ($LASTEXITCODE -ne 0) { throw 'Icarus compilation failed.' }
        & vvp (Join-Path $resultDir 'rtlbench_smoke_sim')
        if ($LASTEXITCODE -ne 0) { throw 'Icarus simulation failed.' }
    } else {
        & verilator --binary --timing --trace --Mdir (Join-Path $resultDir 'obj_dir') -o rtlbench_smoke_sim rtlbench_smoke.sv rtlbench_smoke_tb.sv --top-module rtlbench_smoke_tb
        if ($LASTEXITCODE -ne 0) { throw 'Verilator compilation failed.' }
        & (Join-Path $resultDir 'obj_dir/rtlbench_smoke_sim')
        if ($LASTEXITCODE -ne 0) { throw 'Verilator simulation failed.' }
    }

    if (-not (Test-Path 'rtlbench_smoke.vcd')) { throw 'Simulation completed without producing a VCD.' }
    Copy-Item -Force 'rtlbench_smoke.vcd' (Join-Path $resultDir 'rtlbench_smoke.vcd')
    Write-Host 'VCD output:'
    Get-Content (Join-Path $resultDir 'rtlbench_smoke.vcd') -Raw
    Write-Host "Phase 0 smoke test passed using $Simulator."
}
finally { Pop-Location }
