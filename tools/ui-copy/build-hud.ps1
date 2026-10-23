Add-Type -AssemblyName System.Drawing

function Read-Bmp([string]$Src) {
  $srcBmp = [System.Drawing.Image]::FromFile($Src)
  $bmp = New-Object System.Drawing.Bitmap $srcBmp.Width, $srcBmp.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($srcBmp, 0, 0, $srcBmp.Width, $srcBmp.Height)
  $g.Dispose()
  $srcBmp.Dispose()
  return $bmp
}

function Get-Pack($bmp) {
  $w = $bmp.Width; $h = $bmp.Height
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $h)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $bmp.UnlockBits($data)
  return @{ bytes = $bytes; stride = $stride; w = $w; h = $h }
}

function Save-Bytes($bytes, $stride, $w, $h, $path) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
  [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
  $bmp.UnlockBits($data)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

function Strip-Fringe($pack) {
  $bytes = $pack.bytes; $stride = $pack.stride; $w = $pack.w; $h = $pack.h
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $i = $y * $stride + $x * 4
      if ($bytes[$i + 3] -eq 0) { continue }
      $b = $bytes[$i]; $gc = $bytes[$i + 1]; $r = $bytes[$i + 2]
      if ($r -gt ($gc + 14) -and $b -gt ($gc + 8) -and $gc -lt 170) {
        $bytes[$i] = 0; $bytes[$i + 1] = 0; $bytes[$i + 2] = 0; $bytes[$i + 3] = 0
      }
    }
  }
}

function Crop-Alpha($bmp, $threshold) {
  $pack = Get-Pack $bmp
  $bytes = $pack.bytes; $stride = $pack.stride; $w = $pack.w; $h = $pack.h
  $x0 = $w; $y0 = $h; $x1 = 0; $y1 = 0
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      if ($bytes[$y * $stride + $x * 4 + 3] -gt $threshold) {
        if ($x -lt $x0) { $x0 = $x }
        if ($y -lt $y0) { $y0 = $y }
        if ($x -gt $x1) { $x1 = $x }
        if ($y -gt $y1) { $y1 = $y }
      }
    }
  }
  $cw = $x1 - $x0 + 1; $ch = $y1 - $y0 + 1
  $crop = New-Object System.Drawing.Bitmap $cw, $ch, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($crop)
  $srcRect = New-Object System.Drawing.Rectangle $x0, $y0, $cw, $ch
  $dstRect = New-Object System.Drawing.Rectangle 0, 0, $cw, $ch
  $g.DrawImage($bmp, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  Write-Host ("glass content {0}x{1}" -f $cw, $ch)
  return $crop
}

function Draw-Slice($image, $dstW, $dstH, $srcInset, $dstInset, $path) {
  $sw = $image.Width; $sh = $image.Height
  $dst = New-Object System.Drawing.Bitmap ([int]$dstW), ([int]$dstH), ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $srcX = @(0, $srcInset, ($sw - $srcInset))
  $srcW = @($srcInset, ($sw - 2 * $srcInset), $srcInset)
  $srcY = @(0, $srcInset, ($sh - $srcInset))
  $srcH = @($srcInset, ($sh - 2 * $srcInset), $srcInset)
  $dstX = @(0, $dstInset, ($dstW - $dstInset))
  $dstWds = @($dstInset, ($dstW - 2 * $dstInset), $dstInset)
  $dstY = @(0, $dstInset, ($dstH - $dstInset))
  $dstHds = @($dstInset, ($dstH - 2 * $dstInset), $dstInset)
  for ($row = 0; $row -lt 3; $row++) {
    for ($col = 0; $col -lt 3; $col++) {
      $drect = New-Object System.Drawing.Rectangle ([int]$dstX[$col]), ([int]$dstY[$row]), ([int]$dstWds[$col]), ([int]$dstHds[$row])
      $srect = New-Object System.Drawing.Rectangle ([int]$srcX[$col]), ([int]$srcY[$row]), ([int]$srcW[$col]), ([int]$srcH[$row])
      $g.DrawImage($image, $drect, $srect, [System.Drawing.GraphicsUnit]::Pixel)
    }
  }
  $g.Dispose()
  $dst.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose()
  Write-Output ("sliced {0} {1}x{2}" -f $path, $dstW, $dstH)
}

$hud = 'd:\Custom\TD\assets\resources\ui\hud'
$parts = 'd:\Custom\TD\tools\ui-copy\bar-parts'

$on = Read-Bmp (Join-Path $parts 'pip0.png')
$onPack = Get-Pack $on
$on.Dispose()
Strip-Fringe $onPack
Save-Bytes $onPack.bytes $onPack.stride $onPack.w $onPack.h (Join-Path $hud 'seg-on.png')
Write-Output ("seg-on {0}x{1}" -f $onPack.w, $onPack.h)

$off = Read-Bmp (Join-Path $parts 'pip8.png')
$offPack = Get-Pack $off
$off.Dispose()
Strip-Fringe $offPack
Save-Bytes $offPack.bytes $offPack.stride $offPack.w $offPack.h (Join-Path $hud 'seg-off.png')
Write-Output ("seg-off {0}x{1}" -f $offPack.w, $offPack.h)

$sk = Read-Bmp (Join-Path $parts 'pip7.png')
$sp = Get-Pack $sk
$sk.Dispose()
$sb = $sp.bytes; $ss = $sp.stride; $sw = $sp.w; $sh = $sp.h
$mask = New-Object byte[] ($sw * $sh)
for ($y = 0; $y -lt $sh; $y++) {
  for ($x = 0; $x -lt $sw; $x++) {
    $i = $y * $ss + $x * 4
    if ($sb[$i + 3] -eq 0) { continue }
    $b = $sb[$i]; $gc = $sb[$i + 1]; $r = $sb[$i + 2]
    if ($r -gt 165 -and $gc -gt 120 -and $b -lt 150 -and $r -gt ($b + 35)) { $mask[$y * $sw + $x] = 1 }
  }
}
for ($pass = 0; $pass -lt 3; $pass++) {
  $next = [byte[]]::new($mask.Length)
  [Array]::Copy($mask, $next, $mask.Length)
  for ($y = 1; $y -lt ($sh - 1); $y++) {
    for ($x = 1; $x -lt ($sw - 1); $x++) {
      $p = $y * $sw + $x
      if ($mask[$p] -eq 1 -or $mask[$p - 1] -eq 1 -or $mask[$p + 1] -eq 1 -or $mask[$p - $sw] -eq 1 -or $mask[$p + $sw] -eq 1) {
        $i = $y * $ss + $x * 4
        if ($sb[$i + 3] -eq 0) { continue }
        $b = $sb[$i]; $gc = $sb[$i + 1]; $r = $sb[$i + 2]
        $cyan = ($b -gt 170 -and $gc -gt 150 -and $r -lt 150)
        if (-not $cyan) { $next[$p] = 1 }
      }
    }
  }
  $mask = $next
}
$sx0 = $sw; $sy0 = $sh; $sx1 = 0; $sy1 = 0
for ($y = 0; $y -lt $sh; $y++) {
  for ($x = 0; $x -lt $sw; $x++) {
    if ($mask[$y * $sw + $x] -eq 0) { continue }
    if ($x -lt $sx0) { $sx0 = $x }
    if ($y -lt $sy0) { $sy0 = $y }
    if ($x -gt $sx1) { $sx1 = $x }
    if ($y -gt $sy1) { $sy1 = $y }
  }
}
$cw = $sx1 - $sx0 + 1
$chh = $sy1 - $sy0 + 1
$skull = New-Object System.Drawing.Bitmap $cw, $chh, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$srect = New-Object System.Drawing.Rectangle 0, 0, $cw, $chh
$sdata = $skull.LockBits($srect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
$dstStride = $sdata.Stride
$out = New-Object byte[] ($dstStride * $chh)
for ($y = 0; $y -lt $chh; $y++) {
  for ($x = 0; $x -lt $cw; $x++) {
    if ($mask[($sy0 + $y) * $sw + ($sx0 + $x)] -eq 0) { continue }
    $si = ($sy0 + $y) * $ss + ($sx0 + $x) * 4
    $di = $y * $dstStride + $x * 4
    $out[$di] = $sb[$si]; $out[$di + 1] = $sb[$si + 1]; $out[$di + 2] = $sb[$si + 2]; $out[$di + 3] = 255
  }
}
[System.Runtime.InteropServices.Marshal]::Copy($out, 0, $sdata.Scan0, $out.Length)
$skull.UnlockBits($sdata)
$skull.Save((Join-Path $hud 'skull.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$skull.Dispose()
Write-Output ("skull {0}x{1}" -f $cw, $chh)

$glassRaw = Read-Bmp (Join-Path $hud 'glass.png')
$glass = Crop-Alpha $glassRaw 8
$glassRaw.Dispose()

Draw-Slice $glass 172 150 90 32 (Join-Path $hud 'glass-level.png')
Draw-Slice $glass 636 150 90 32 (Join-Path $hud 'glass-wave.png')
Draw-Slice $glass 232 100 90 26 (Join-Path $hud 'glass-gold.png')
$glass.Dispose()

$pipOn = Read-Bmp (Join-Path $hud 'seg-on.png')
Draw-Slice $pipOn 112 80 34 28 (Join-Path $hud 'seg-on.png')
$pipOn.Dispose()
$pipOff = Read-Bmp (Join-Path $hud 'seg-off.png')
Draw-Slice $pipOff 112 80 34 28 (Join-Path $hud 'seg-off.png')
$pipOff.Dispose()
Write-Output 'done'
