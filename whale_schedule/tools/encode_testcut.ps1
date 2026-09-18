# 合成：帧序列 + BGM 片段 → MP4
# 片段取原曲 32.0s 起、长 32.0s，正好对应总时间轴上镜头 4+5 的位置
$ErrorActionPreference = "Continue"
$ff = (Resolve-Path "tools\ffmpeg.exe").Path
$frameDir = (Resolve-Path "_tmp_verify\render").Path
# 用通配符解析 BGM 路径：脚本里不写日文字面量，避免 PowerShell 读脚本时把 UTF-8 读成乱码
$bgmLiteral = Get-ChildItem "excelwallpaper\intro" -Filter "*.flac" | Select-Object -First 1
if (-not $bgmLiteral) { Write-Output "NO BGM FILE"; exit 1 }
$bgm = $bgmLiteral.FullName
$out = Join-Path (Get-Location).Path "_tmp_verify\promo_testcut.mp4"

$n = (Get-ChildItem $frameDir -Filter *.jpg).Count
Write-Output "frames : $n"
Write-Output "ffmpeg : $ff"
Write-Output "bgm    : $bgm"

$argsList = @(
  "-y", "-v", "warning",
  "-framerate", "30",
  "-i", (Join-Path $frameDir "%05d.jpg"),
  "-ss", "32.0", "-t", "32.0",
  "-i", $bgm,
  "-filter_complex", "[0:v]scale=1920:1080:flags=lanczos,format=yuv420p[v]",
  "-map", "[v]", "-map", "1:a",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-level", "4.1",
  "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
  "-movflags", "+faststart", "-shortest",
  $out
)
& $ff @argsList
Write-Output "ffmpeg exit=$LASTEXITCODE"
if (Test-Path $out) {
  Get-Item $out | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,2)}} | Format-List | Out-String
} else {
  Write-Output "NO OUTPUT FILE"
}
