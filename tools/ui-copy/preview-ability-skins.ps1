Add-Type -AssemblyName System.Drawing

$out = 'd:\Custom\TD\tools\ui-copy\ability-pick-step2.png'
$art = 'd:\Custom\TD\assets\resources\ui\ability'
$glassPath = 'd:\Custom\TD\assets\resources\ui\hud\glass.png'
$bgPath = 'd:\Custom\TD\assets\textures\ground\battlefield.jpg'

function SX($x) { return [int](540 + $x) }
function SY($y) { return [int](960 - $y) }

function Add-Round([System.Drawing.Drawing2D.GraphicsPath]$path, $x, $y, $w, $h, $r) {
  if ($r * 2 -gt $w) { $r = [int]($w / 2) }
  if ($r * 2 -gt $h) { $r = [int]($h / 2) }
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90) | Out-Null
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90) | Out-Null
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90) | Out-Null
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90) | Out-Null
  $path.CloseFigure()
}

function Draw-Slice($g, $image, $dstX, $dstY, $dstW, $dstH, $inset) {
  $sw = $image.Width; $sh = $image.Height
  $srcX = @(0, $inset, ($sw - $inset))
  $srcW = @($inset, ($sw - 2 * $inset), $inset)
  $srcY = @(0, $inset, ($sh - $inset))
  $srcH = @($inset, ($sh - 2 * $inset), $inset)
  $dx = @($dstX, ($dstX + $inset), ($dstX + $dstW - $inset))
  $dw = @($inset, ($dstW - 2 * $inset), $inset)
  $dy = @($dstY, ($dstY + $inset), ($dstY + $dstH - $inset))
  $dh = @($inset, ($dstH - 2 * $inset), $inset)
  for ($row = 0; $row -lt 3; $row++) {
    for ($col = 0; $col -lt 3; $col++) {
      $drect = New-Object System.Drawing.Rectangle ([int]$dx[$col]), ([int]$dy[$row]), ([int]$dw[$col]), ([int]$dh[$row])
      $srect = New-Object System.Drawing.Rectangle ([int]$srcX[$col]), ([int]$srcY[$row]), ([int]$srcW[$col]), ([int]$srcH[$row])
      $g.DrawImage($image, $drect, $srect, [System.Drawing.GraphicsUnit]::Pixel)
    }
  }
}

function Draw-Tint($g, $file, $cx, $cy, $w, $h, $r, $gc, $b) {
  $bmp = [System.Drawing.Image]::FromFile($file)
  $left = SX($cx - $w / 2)
  $top = SY($cy + $h / 2)
  $cm = New-Object System.Drawing.Imaging.ColorMatrix
  $cm.Matrix00 = $r / 255
  $cm.Matrix11 = $gc / 255
  $cm.Matrix22 = $b / 255
  $cm.Matrix33 = 1
  $attr = New-Object System.Drawing.Imaging.ImageAttributes
  $attr.SetColorMatrix($cm)
  $dest = New-Object System.Drawing.Rectangle $left, $top, $w, $h
  $g.DrawImage($bmp, $dest, 0, 0, $bmp.Width, $bmp.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr)
  $attr.Dispose(); $bmp.Dispose()
}

function Draw-At($g, $file, $cx, $cy, $w, $h) {
  Draw-Fade $g $file $cx $cy $w $h 1
}

function Draw-Fade($g, $file, $cx, $cy, $w, $h, $alpha) {
  $bmp = [System.Drawing.Image]::FromFile($file)
  $left = SX($cx - $w / 2)
  $top = SY($cy + $h / 2)
  $cm = New-Object System.Drawing.Imaging.ColorMatrix
  $cm.Matrix33 = $alpha
  $attr = New-Object System.Drawing.Imaging.ImageAttributes
  $attr.SetColorMatrix($cm)
  $dest = New-Object System.Drawing.Rectangle ([int]$left), ([int]$top), ([int]$w), ([int]$h)
  $g.DrawImage($bmp, $dest, 0, 0, $bmp.Width, $bmp.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr)
  $attr.Dispose(); $bmp.Dispose()
}

function Draw-Text($g, $text, $cx, $cy, $w, $h, $size, $color) {
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $brush = New-Object System.Drawing.SolidBrush $color
  $rect = New-Object System.Drawing.RectangleF (SX($cx - $w / 2)), (SY($cy + $h / 2)), $w, $h
  $font = New-Object System.Drawing.Font 'Microsoft YaHei', $size, ([System.Drawing.FontStyle]::Bold)
  $g.DrawString($text, $font, $brush, $rect, $fmt)
  $font.Dispose(); $brush.Dispose(); $fmt.Dispose()
}

$bmp = New-Object System.Drawing.Bitmap 1080, 1920
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
if (Test-Path $bgPath) {
  $bg = [System.Drawing.Image]::FromFile($bgPath)
  $scale = [Math]::Max(1080 / $bg.Width, 1920 / $bg.Height)
  $bw = [int]($bg.Width * $scale); $bh = [int]($bg.Height * $scale)
  $g.DrawImage($bg, [int]((1080 - $bw) / 2), [int]((1920 - $bh) / 2), $bw, $bh)
  $bg.Dispose()
}
$dim = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(56, 6, 16, 12))
$g.FillRectangle($dim, 0, 0, 1080, 1920)
$dim.Dispose()

$panelW = 860; $panelH = 980; $panelY = 30
$glass = [System.Drawing.Image]::FromFile($glassPath)
Draw-Slice $g $glass (SX(-$panelW / 2)) (SY($panelY + $panelH / 2)) $panelW $panelH 76
$glass.Dispose()
Draw-Text $g '选择能力' 0 ($panelY + 424) 520 64 36 ([System.Drawing.Color]::White)

$cardX = @(-260, 0, 260)
$cardY = $panelY + 24
$cardW = 244
$skins = @('card-common','card-rare','card-epic')
$icons = @('icon-attack','icon-swift','icon-gold')
$iconW = @(158, 133, 168)
$iconH = @(200, 188, 131)
$coins = @('coin-gold','coin-silver','coin-silver')
$names = @('攻击强化','迅捷之力','金币加成')
$rarity = @('普通','稀有','史诗')
$cost = @('50','500','500')
$rarityY = @(236, 236, 236)
$ink = [System.Drawing.Color]::FromArgb(255, 92, 58, 32)

for ($i = 0; $i -lt 3; $i++) {
  $cx = $cardX[$i]; $cy = $cardY
  Draw-At $g (Join-Path $art ($skins[$i] + '.png')) $cx $cy $cardW 520
  if ($i -eq 2) {
    Draw-Fade $g (Join-Path $art 'epic-aura.png') $cx ($cy + 40) 360 626 1
  }
  $back = @('icon-back', 'icon-back-rare', 'icon-back-epic')[$i]
  $backS = 214
  Draw-At $g (Join-Path $art ($back + '.png')) $cx ($cy + 28) $backS $backS
  Draw-At $g (Join-Path $art ($icons[$i] + '.png')) $cx ($cy + 28) $iconW[$i] $iconH[$i]
  if ($i -eq 2) {
    Draw-At $g (Join-Path $art 'ribbon-recommend.png') $cx ($cy + 320) 250 68
    Draw-Text $g '推荐' $cx ($cy + 330) 120 36 22 ([System.Drawing.Color]::White)
  }
  Draw-Text $g $rarity[$i] $cx ($cy + $rarityY[$i]) 120 34 18 ([System.Drawing.Color]::White)
  if ($i -eq 2) {
    $spark = @(
      @(-118, 332, 44, 1.0),
      @(122, 318, 36, 0.7),
      @(-128, 130, 34, 0.95),
      @(130, 16, 42, 0.55),
      @(-126, -100, 28, 0.8),
      @(128, -186, 36, 0.45),
      @(-96, -286, 44, 1.0),
      @(104, -276, 30, 0.6),
      @(-90, 372, 22, 0.85),
      @(96, 368, 18, 0.4)
    )
    foreach ($s in $spark) {
      Draw-Fade $g (Join-Path $art 'epic-star.png') ($cx + $s[0]) ($cy + $s[1]) $s[2] $s[2] $s[3]
    }
  }
  Draw-Text $g $names[$i] $cx ($cy - 128) 220 44 26 $ink
  $priceW = $cost[$i].Length * 22 + 16
  $coinW = 36; $gap = 8
  $row = $coinW + $gap + $priceW
  $rowLeft = -$row / 2
  Draw-At $g (Join-Path $art ($coins[$i] + '.png')) ($cx + $rowLeft + $coinW / 2) ($cy - 206) $coinW $coinW
  Draw-Text $g $cost[$i] ($cx + $rowLeft + $coinW + $gap + $priceW / 2) ($cy - 206) $priceW 44 26 $ink
}

Draw-At $g (Join-Path $art 'btn-free.png') 0 ($panelY - 295) 320 86
Draw-Text $g '免费' 18 ($panelY - 295) 200 86 22 ([System.Drawing.Color]::White)
$rollX = @(-172, 172)
$rollFile = @('btn-blue','btn-orange')
for ($i = 0; $i -lt 2; $i++) {
  Draw-At $g (Join-Path $art ($rollFile[$i] + '.png')) $rollX[$i] ($panelY - 395) 320 86
  Draw-Text $g '换一换' ($rollX[$i] + 18) ($panelY - 395) 200 86 22 ([System.Drawing.Color]::White)
}

$g.Dispose()
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output $out
