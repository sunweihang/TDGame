Add-Type -AssemblyName System.Drawing

function Load-Png([string]$Path) {
  $src = [System.Drawing.Image]::FromFile($Path)
  $bmp = New-Object System.Drawing.Bitmap $src.Width, $src.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($src, 0, 0, $src.Width, $src.Height)
  $g.Dispose()
  $src.Dispose()
  return $bmp
}

$field = [System.Drawing.Image]::FromFile('d:\Custom\TD\assets\textures\ground\battlefield.jpg')
$bg = New-Object System.Drawing.Bitmap 1080, 220
$g = [System.Drawing.Graphics]::FromImage($bg)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$srcRect = New-Object System.Drawing.Rectangle 0, 180, 1728, 420
$dstRect = New-Object System.Drawing.Rectangle 0, 0, 1080, 220
$g.DrawImage($field, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$field.Dispose()

function Blit($img, $x, $y, $w, $h) {
  $d = New-Object System.Drawing.Rectangle ([int][Math]::Round($x)), ([int][Math]::Round($y)), ([int][Math]::Round($w)), ([int][Math]::Round($h))
  $g.DrawImage($img, $d)
}

$dir = 'd:\Custom\TD\assets\resources\ui\hud'
$level = Load-Png "$dir\glass-level.png"
$wave = Load-Png "$dir\glass-wave.png"
$gold = Load-Png "$dir\glass-gold.png"
$bar = Load-Png "$dir\bar-track.png"
$skull = Load-Png "$dir\skull.png"
$coin = Load-Png "$dir\coin.png"

$oy = 16
Blit $level (8) ($oy + 10) 172 150
Blit $wave (192) ($oy + 10) 636 150
Blit $gold (840) ($oy + 46) 232 100

$barX = 192 + (636 - 600) / 2
$barY = $oy + 54
Blit $bar $barX $barY 600 84
$iconY = $barY + 42
foreach ($frac in @(0.2608, 0.737)) {
  $cx = $barX + 600 * $frac
  Blit $skull ($cx - 24) ($iconY - 32 - 16) 48 64
}
Blit $coin (840 + 18) ($iconY - 25) 50 50

$font = New-Object System.Drawing.Font 'Microsoft YaHei', 26, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$fontBig = New-Object System.Drawing.Font 'Microsoft YaHei', 52, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$fontGold = New-Object System.Drawing.Font 'Microsoft YaHei', 32, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$edge = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 16, 28, 40))
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

function Draw-Text($text, $fontUse, $rect) {
  foreach ($dx in @(-2, 0, 2)) {
    foreach ($dy in @(-2, 0, 2)) {
      if ($dx -eq 0 -and $dy -eq 0) { continue }
      $r = New-Object System.Drawing.RectangleF ($rect.X + $dx), ($rect.Y + $dy), $rect.Width, $rect.Height
      $g.DrawString($text, $fontUse, $edge, $r, $fmt)
    }
  }
  $g.DrawString($text, $fontUse, $brush, $rect, $fmt)
}

Draw-Text '关卡' $font (New-Object System.Drawing.RectangleF 8, ($oy + 30), 172, 36)
Draw-Text '15' $fontBig (New-Object System.Drawing.RectangleF 8, ($oy + 76), 172, 64)
Draw-Text '波次 18/20' $font (New-Object System.Drawing.RectangleF 192, ($oy + 12), 636, 32)
Draw-Text '1280' $fontGold (New-Object System.Drawing.RectangleF (840 + 90), ($oy + 73), 130, 46)

$out = 'd:\Custom\TD\tools\ui-copy\hud-sides-preview.png'
$bg.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bg.Dispose()
Write-Output $out
