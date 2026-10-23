Add-Type -AssemblyName System.Drawing

function Read-Bmp([string]$Src) {
  $srcBmp = [System.Drawing.Image]::FromFile($Src)
  $w = $srcBmp.Width
  $h = $srcBmp.Height
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($srcBmp, 0, 0, $w, $h)
  $g.Dispose()
  $srcBmp.Dispose()
  return $bmp
}

function Get-Bytes($bmp) {
  $w = $bmp.Width; $h = $bmp.Height
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $h)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $bmp.UnlockBits($data)
  return @{ bytes = $bytes; stride = $stride; w = $w; h = $h }
}

function Save-Crop($bytes, $stride, $x0, $y0, $cw, $ch, $path) {
  $crop = New-Object System.Drawing.Bitmap $cw, $ch, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $rect = New-Object System.Drawing.Rectangle 0, 0, $cw, $ch
  $data = $crop.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
  $cs = $data.Stride
  $out = New-Object byte[] ($cs * $ch)
  for ($y = 0; $y -lt $ch; $y++) {
    [Array]::Copy($bytes, ($y0 + $y) * $stride + $x0 * 4, $out, $y * $cs, $cw * 4)
  }
  [System.Runtime.InteropServices.Marshal]::Copy($out, 0, $data.Scan0, $out.Length)
  $crop.UnlockBits($data)
  $crop.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $crop.Dispose()
}

$src = 'C:\Users\elex\.cursor\projects\d-Custom-TD\assets\wave-bar-faithful.jpg'
$bmp = Read-Bmp $src
$pack = Get-Bytes $bmp
$bmp.Dispose()
$bytes = $pack.bytes
$stride = $pack.stride
$w = $pack.w
$h = $pack.h
Write-Output "src ${w}x${h}"

$minX = $w; $minY = $h; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $h; $y++) {
  $row = $y * $stride
  for ($x = 0; $x -lt $w; $x++) {
    $i = $row + $x * 4
    $b = $bytes[$i]; $gc = $bytes[$i + 1]; $r = $bytes[$i + 2]
    $mag = ($r -gt 145 -and $b -gt 120 -and $gc -lt 155 -and $r -gt ($gc + 28) -and $b -gt ($gc + 18) -and [Math]::Abs($r - $b) -lt 100)
    if ($mag) {
      $bytes[$i] = 0; $bytes[$i + 1] = 0; $bytes[$i + 2] = 0; $bytes[$i + 3] = 0
    } else {
      $bytes[$i + 3] = 255
      if ($x -lt $minX) { $minX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
for ($pass = 0; $pass -lt 2; $pass++) {
  $next = [byte[]]::new($bytes.Length)
  [Array]::Copy($bytes, $next, $bytes.Length)
  for ($y = 1; $y -lt ($h - 1); $y++) {
    for ($x = 1; $x -lt ($w - 1); $x++) {
      $i = $y * $stride + $x * 4
      if ($bytes[$i + 3] -eq 0) { continue }
      $hole = ($bytes[$i - 4 + 3] -eq 0) -or ($bytes[$i + 4 + 3] -eq 0) -or ($bytes[$i - $stride + 3] -eq 0) -or ($bytes[$i + $stride + 3] -eq 0)
      if (-not $hole) { continue }
      $b = $bytes[$i]; $gc = $bytes[$i + 1]; $r = $bytes[$i + 2]
      if ($r -gt 120 -and $b -gt 100 -and $gc -lt 170 -and $r -gt ($gc + 12) -and $b -gt ($gc + 8)) {
        $next[$i] = 0; $next[$i + 1] = 0; $next[$i + 2] = 0; $next[$i + 3] = 0
      }
    }
  }
  $bytes = $next
}

$keyed = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$krect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$kdata = $keyed.LockBits($krect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $kdata.Scan0, $bytes.Length)
$keyed.UnlockBits($kdata)
$keyed.Save('d:\Custom\TD\tools\ui-copy\bar-parts\keyed.png', [System.Drawing.Imaging.ImageFormat]::Png)
$keyed.Dispose()

$col = New-Object int[] $w
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    if ($bytes[$y * $stride + $x * 4 + 3] -gt 0) { $col[$x]++ }
  }
}
$low30 = 0; $low60 = 0; $low100 = 0; $minC = 9999
for ($x = 132; $x -le 744; $x++) {
  if ($col[$x] -lt 30) { $low30++ }
  if ($col[$x] -lt 60) { $low60++ }
  if ($col[$x] -lt 100) { $low100++ }
  if ($col[$x] -lt $minC) { $minC = $col[$x] }
}
Write-Output "fused-span min=$minC under30=$low30 under60=$low60 under100=$low100"
$runs = New-Object System.Collections.Generic.List[object]
$run = -1
for ($x = 0; $x -lt $w; $x++) {
  if ($col[$x] -gt 8) {
    if ($run -lt 0) { $run = $x }
  } elseif ($run -ge 0) {
    $end = $x - 1
    $runs.Add(@($run, $end))
    $run = -1
  }
}
if ($run -ge 0) {
  $end = $w - 1
  $runs.Add(@($run, $end))
}
Write-Output ("runs " + $runs.Count)

$outDir = 'd:\Custom\TD\tools\ui-copy\bar-parts'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$idx = 0
foreach ($run in $runs) {
  $x0 = $run[0]; $x1 = $run[1]
  $y0 = $h; $y1 = 0
  $gold = 0; $opaque = 0; $sumR = 0; $sumG = 0; $sumB = 0
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = $x0; $x -le $x1; $x++) {
      $i = $y * $stride + $x * 4
      if ($bytes[$i + 3] -eq 0) { continue }
      if ($y -lt $y0) { $y0 = $y }
      if ($y -gt $y1) { $y1 = $y }
      $opaque++
      $sumB += $bytes[$i]; $sumG += $bytes[$i + 1]; $sumR += $bytes[$i + 2]
      $r = $bytes[$i + 2]; $gc = $bytes[$i + 1]; $b = $bytes[$i]
      if ($r -gt 170 -and $gc -gt 130 -and $b -lt 150 -and $r -gt ($b + 40)) { $gold++ }
    }
  }
  $cw = $x1 - $x0 + 1
  $ch = $y1 - $y0 + 1
  $mr = [int]($sumR / [Math]::Max(1, $opaque))
  $mg = [int]($sumG / [Math]::Max(1, $opaque))
  $mb = [int]($sumB / [Math]::Max(1, $opaque))
  Write-Output ("block {0} x={1}..{2} y={3}..{4} {5}x{6} mean={7},{8},{9} gold={10}" -f $idx, $x0, $x1, $y0, $y1, $cw, $ch, $mr, $mg, $mb, $gold)
  Save-Crop $bytes $stride $x0 $y0 $cw $ch (Join-Path $outDir ("block{0}.png" -f $idx))
  $idx++
}
