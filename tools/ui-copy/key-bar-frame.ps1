Add-Type -AssemblyName System.Drawing

$srcPath = 'C:\Users\elex\.cursor\projects\d-Custom-TD\assets\bar-frame.jpg'
$srcBmp = [System.Drawing.Image]::FromFile($srcPath)
$w = $srcBmp.Width; $h = $srcBmp.Height
$bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($srcBmp, 0, 0, $w, $h)
$g.Dispose(); $srcBmp.Dispose()

$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)

for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $i = $y * $stride + $x * 4
    $b = $bytes[$i]; $gc = $bytes[$i + 1]; $r = $bytes[$i + 2]
    $mag = ($r -gt 145 -and $b -gt 120 -and $gc -lt 155 -and $r -gt ($gc + 28) -and $b -gt ($gc + 18) -and [Math]::Abs($r - $b) -lt 100)
    if ($mag) { $bytes[$i] = 0; $bytes[$i + 1] = 0; $bytes[$i + 2] = 0; $bytes[$i + 3] = 0 }
    else { $bytes[$i + 3] = 255 }
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

$minX = $w; $minY = $h; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    if ($bytes[$y * $stride + $x * 4 + 3] -gt 0) {
      if ($x -lt $minX) { $minX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$cw = $maxX - $minX + 1
$ch = $maxY - $minY + 1
Write-Output "crop ${cw}x${ch}"

$crop = New-Object System.Drawing.Bitmap $cw, $ch, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$crect = New-Object System.Drawing.Rectangle 0, 0, $cw, $ch
$cdata = $crop.LockBits($crect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
$cs = $cdata.Stride
$out = New-Object byte[] ($cs * $ch)
for ($y = 0; $y -lt $ch; $y++) {
  [Array]::Copy($bytes, ($minY + $y) * $stride + $minX * 4, $out, $y * $cs, $cw * 4)
}
[System.Runtime.InteropServices.Marshal]::Copy($out, 0, $cdata.Scan0, $out.Length)
$crop.UnlockBits($cdata)
$bmp.UnlockBits($data)
$bmp.Dispose()
$dst = 'd:\Custom\TD\assets\resources\ui\hud\bar-track.png'
$crop.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
$crop.Dispose()

# Classify a mid row into cyan / dark runs.
$mid = [int]($ch * 0.55)
$kind = New-Object int[] $cw
for ($x = 0; $x -lt $cw; $x++) {
  $i = $mid * $cs + $x * 4
  if ($out[$i + 3] -eq 0) { $kind[$x] = 0; continue }
  $b = $out[$i]; $gc = $out[$i + 1]; $r = $out[$i + 2]
  if ($b -gt 170 -and $gc -gt 150 -and $r -lt 180) { $kind[$x] = 1 }
  elseif (($r + $gc + $b) -lt 280 -and $b -gt $r) { $kind[$x] = 2 }
  else { $kind[$x] = 3 }
}
$runs = New-Object System.Collections.Generic.List[string]
$runK = 0; $runS = 0
for ($x = 0; $x -le $cw; $x++) {
  $k = $(if ($x -eq $cw) { 0 } else { $kind[$x] })
  if ($k -ne $runK) {
    if ($runK -ne 0 -and ($x - $runS) -gt 8) {
      $name = $(if ($runK -eq 1) { 'cyan' } elseif ($runK -eq 2) { 'dark' } else { 'rim' })
      $a = $runS; $b2 = $x - 1
      $midX = ($a + $b2) / 2.0
      $frac = [Math]::Round($midX / $cw, 4)
      $runs.Add(("{0} {1}-{2} mid={3} frac={4}" -f $name, $a, $b2, [int]$midX, $frac))
    }
    $runK = $k; $runS = $x
  }
}
$runs | ForEach-Object { Write-Output $_ }
Write-Output "saved $dst"
