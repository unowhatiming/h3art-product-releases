# Hanzi Tree EP01 "青" — one-command rebuild
#   pwsh -File make.ps1              # silent cut (music + sfx + burned subtitles)
#   pwsh -File make.ps1 -Voice       # full cut: edge-tts narration, then re-time + mux
param(
    [switch]$Voice,          # run edge-tts narration first (needs internet)
    [int]$Crf = 18,
    [string]$Preset = "medium"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $root "src"
$out = Join-Path $root "out"
New-Item -ItemType Directory -Force -Path $out | Out-Null

Push-Location $src
try {
    if ($Voice) {
        Write-Host "== 1/4 narration (edge-tts) ==" -ForegroundColor Cyan
        python tts.py
    }
    Write-Host "== 2/4 thumbnail + metadata ==" -ForegroundColor Cyan
    Push-Location $root; python tools\thumbnail.py; python tools\publish.py; Pop-Location

    Write-Host "== 3/4 render frames -> video ==" -ForegroundColor Cyan
    python render.py --video (Join-Path $out "ep01_silent.mp4") `
        --srt (Join-Path $out "ep01.srt") --crf $Crf --preset $Preset

    Write-Host "== 4/4 audio bed + mux ==" -ForegroundColor Cyan
    python audio.py --wav (Join-Path $out "ep01_audio.wav") `
        --mux (Join-Path $out "ep01_silent.mp4") `
        --final (Join-Path $out "ep01_qing.mp4")
}
finally {
    Pop-Location
}
Write-Host "done -> $out\ep01_qing.mp4" -ForegroundColor Green
