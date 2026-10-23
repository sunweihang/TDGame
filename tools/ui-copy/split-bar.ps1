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

$bmp = Read-Bmp 'd:\Custom\TD\tools\ui-copy\bar-parts\keyed.png'
$w = $bmp.Width; $h = $bmp.Height
$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data)
$bmp.Dispose()

# Drop leftover purple seams so each pip is its own island.
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $i = $y * $stride + $x * 4
    if ($bytes[$i + 3] -eq 0) { continue }
    $b = $bytes[$i]; $gc = $bytes[$i + 1]; $r = $bytes[$i + 2]
    $purple = ($r -gt 90 -and $b -gt 70 -and $gc -lt 150 -and $r -gt ($gc + 18) -and $b -gt ($gc + 8) -and [Math]::Abs($r - $b) -lt 120)
    if ($purple) {
      $bytes[$i] = 0; $bytes[$i + 1] = 0; $bytes[$i + 2] = 0; $bytes[$i + 3] = 0
    }
  }
}

$col = New-Object int[] $w
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    if ($bytes[$y * $stride + $x * 4 + 3] -gt 0) { $col[$x]++ }
  }
}

$runs = New-Object System.Collections.Generic.List[object]
$run = -1
for ($x = 0; $x -lt $w; $x++) {
  if ($col[$x] -gt 12) {
    if ($run -lt 0) { $run = $x }
  } elseif ($run -ge 0) {
    $end = $x - 1
    if (($end - $run) -gt 20) { $runs.Add(@($run, $end)) }
    $run = -1
  }
}
if ($run -ge 0) {
  $end = $w - 1
  if (($end - $run) -gt 20) { $runs.Add(@($run, $end)) }
}
Write-Output ("runs " + $runs.Count)

$outDir = 'd:\Custom\TD\tools\ui-copy\bar-parts'
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
      if ($r -gt 170 -and $gc -gt 130 -and $b -lt 160 -and $r -gt ($b + 30)) { $gold++ }
    }
  }
  $cw = $x1 - $x0 + 1
  $ch = $y1 - $y0 + 1
  $mr = [int]($sumR / [Math]::Max(1, $opaque))
  $mg = [int]($sumG / [Math]::Max(1, $opaque))
  $mb = [int]($sumB / [Math]::Max(1, $opaque))
  Write-Output ("block {0} {1}x{2} mean={3},{4},{5} gold={6}" -f $idx, $cw, $ch, $mr, $mg, $mb, $gold)

  $crop = New-Object System.Drawing.Bitmap $cw, $ch, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $crect = New-Object System.Drawing.Rectangle 0, 0, $cw, $ch
  $cdata = $crop.LockBits($crect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
  $cs = $cdata.Stride
  $out = New-Object byte[] ($cs * $ch)
  for ($y = 0; $y -lt $ch; $y++) {
    [Array]::Copy($bytes, ($y0 + $y) * $stride + ($x0 * 4), $out, $y * $cs, $cw * 4)
  }
  [System.Runtime.InteropServices.Marshal]::Copy($out, 0, $cdata.Scan0, $out.Length)
  $crop.UnlockBits($cdata)
  $crop.Save((Join-Path $outDir ("pip{0}.png" -f $idx)), [System.Drawing.Imaging.ImageFormat]::Png)
  $crop.Dispose()
  $idx++
}
