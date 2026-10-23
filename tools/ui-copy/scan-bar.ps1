Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 'd:\Custom\TD\assets\resources\ui\hud\bar-track.png'
$w = $bmp.Width; $h = $bmp.Height
$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data)
$bmp.Dispose()
$mid = [int]($h * 0.55)
$kind = New-Object int[] $w
for ($x = 0; $x -lt $w; $x++) {
  $i = $mid * $stride + $x * 4
  $b = $bytes[$i]; $gc = $bytes[$i + 1]; $r = $bytes[$i + 2]
  if ($b -gt 170 -and $gc -gt 150 -and $r -lt 190) { $kind[$x] = 1 }
  elseif (($r + $gc + $b) -lt 320 -and $b -ge $r -and $gc -lt 120) { $kind[$x] = 2 }
  else { $kind[$x] = 3 }
}
$runK = 0
$start = 0
$lines = New-Object System.Collections.Generic.List[string]
for ($x = 0; $x -le $w; $x++) {
  $k = 0
  if ($x -lt $w) { $k = $kind[$x] }
  if ($k -ne $runK) {
    $len = $x - $start
    if ($runK -ne 0 -and $len -gt 6) {
      $name = 'rim'
      if ($runK -eq 1) { $name = 'cyan' }
      if ($runK -eq 2) { $name = 'dark' }
      $a = $start
      $b2 = $x - 1
      $center = ($a + $b2) / 2.0
      $frac = [Math]::Round($center / $w, 4)
      $lines.Add("$name $a-$b2 frac=$frac")
    }
    $runK = $k
    $start = $x
  }
}
$lines | ForEach-Object { Write-Output $_ }
Write-Output "size ${w}x${h} midY=$mid"
