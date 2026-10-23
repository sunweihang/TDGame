Add-Type -AssemblyName System.Drawing

function Convert-KeyedPng {
  param([string]$Src, [string]$Dst)
  $srcBmp = [System.Drawing.Image]::FromFile($Src)
  $w = $srcBmp.Width
  $h = $srcBmp.Height
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($srcBmp, 0, 0, $w, $h)
  $g.Dispose()
  $srcBmp.Dispose()

  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $h)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)

  $minX = $w; $minY = $h; $maxX = 0; $maxY = 0
  for ($y = 0; $y -lt $h; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $w; $x++) {
      $i = $row + $x * 4
      $b = $bytes[$i]
      $gc = $bytes[$i + 1]
      $r = $bytes[$i + 2]
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

  # Drop purple fringe sitting on the keyed edge.
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
      $i = $y * $stride + $x * 4
      if ($bytes[$i + 3] -gt 0) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
  $bmp.UnlockBits($data)

  if ($maxX -lt $minX) { throw "empty $Src" }
  $cw = $maxX - $minX + 1
  $ch = $maxY - $minY + 1
  $crop = New-Object System.Drawing.Bitmap $cw, $ch, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $cg = [System.Drawing.Graphics]::FromImage($crop)
  $cg.DrawImage($bmp, (New-Object System.Drawing.Rectangle 0, 0, $cw, $ch), (New-Object System.Drawing.Rectangle $minX, $minY, $cw, $ch), [System.Drawing.GraphicsUnit]::Pixel)
  $cg.Dispose()
  $bmp.Dispose()
  $crop.Save($Dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $crop.Dispose()
  Write-Output "$Dst ${cw}x${ch}"
}

$root = 'C:\Users\elex\.cursor\projects\d-Custom-TD\assets'
$out = 'd:\Custom\TD\assets\resources\ui\hud'
New-Item -ItemType Directory -Force -Path $out | Out-Null

Convert-KeyedPng (Join-Path $root 'hud-faithful.jpg') (Join-Path $out 'bar.png')
