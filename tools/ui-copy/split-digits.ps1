Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 'd:\Custom\TD\tools\ui-copy\digits-keyed.png'
$w = $bmp.Width; $h = $bmp.Height
$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data)
$bmp.Dispose()

$col = New-Object int[] $w
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    if ($bytes[$y * $stride + $x * 4 + 3] -gt 8) { $col[$x]++ }
  }
}
$runs = New-Object System.Collections.Generic.List[object]
$start = -1
for ($x = 0; $x -lt $w; $x++) {
  if ($col[$x] -gt 2) {
    if ($start -lt 0) { $start = $x }
  } elseif ($start -ge 0) {
    $end = $x - 1
    if (($end - $start) -gt 8) { $runs.Add(@($start, $end)) }
    $start = -1
  }
}
if ($start -ge 0) {
  $end = $w - 1
  $runs.Add(@($start, $end))
}
Write-Output ("runs " + $runs.Count)

$outDir = 'd:\Custom\TD\assets\resources\ui\hud'
$sheet = [System.Drawing.Image]::FromFile('d:\Custom\TD\tools\ui-copy\digits-keyed.png')
$i = 0
foreach ($run in $runs) {
  $x0 = $run[0]; $x1 = $run[1]
  $cw = $x1 - $x0 + 1
  $crop = New-Object System.Drawing.Bitmap $cw, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($crop)
  $g.DrawImage(
    $sheet,
    (New-Object System.Drawing.Rectangle 0, 0, $cw, $h),
    (New-Object System.Drawing.Rectangle $x0, 0, $cw, $h),
    [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $path = Join-Path $outDir ("digit-{0}.png" -f $i)
  $crop.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $crop.Dispose()
  Write-Output ("digit {0} {1}x{2}" -f $i, $cw, $h)
  $i++
}
$sheet.Dispose()
