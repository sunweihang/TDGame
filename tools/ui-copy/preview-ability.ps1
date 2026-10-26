Add-Type -AssemblyName System.Drawing

$out = 'd:\Custom\TD\tools\ui-copy\ability-pick-step1.png'
$glassPath = 'd:\Custom\TD\assets\resources\ui\hud\glass.png'
$bgPath = 'd:\Custom\TD\assets\textures\ground\battlefield.jpg'

$W = 1080
$H = 1920
$panelW = 860
$panelH = 980
$panelY = 30
$cardW = 244
$cardH = 520
$cardX = @(-271, -8, 269)
$cardY = 24
$titleY = 400
$freeW = 210
$freeH = 72
$freeY = -300
$rollW = 320
$rollH = 118
$rollX = @(-214, 214)
$rollY = -408

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

function Fill-Round($g, $x, $y, $w, $h, $r, $fill, $edge) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  Add-Round $path $x $y $w $h $r
  $b = New-Object System.Drawing.SolidBrush $fill
  $g.FillPath($b, $path)
  $b.Dispose()
  if ($edge) {
    $pen = New-Object System.Drawing.Pen $edge, 4
    $g.DrawPath($pen, $path)
    $pen.Dispose()
  }
  $path.Dispose()
}

function Draw-Slice($g, $image, $dstX, $dstY, $dstW, $dstH, $inset) {
  $sw = $image.Width
  $sh = $image.Height
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

function Draw-Text($g, $text, $x, $y, $w, $h, $size, $color, $font) {
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $brush = New-Object System.Drawing.SolidBrush $color
  $rect = New-Object System.Drawing.RectangleF $x, $y, $w, $h
  $g.DrawString($text, (New-Object System.Drawing.Font $font, $size, ([System.Drawing.FontStyle]::Bold)), $brush, $rect, $fmt)
  $brush.Dispose()
  $fmt.Dispose()
}

$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

if (Test-Path $bgPath) {
  $bg = [System.Drawing.Image]::FromFile($bgPath)
  $scale = [Math]::Max($W / $bg.Width, $H / $bg.Height)
  $bw = [int]($bg.Width * $scale)
  $bh = [int]($bg.Height * $scale)
  $g.DrawImage($bg, [int](($W - $bw) / 2), [int](($H - $bh) / 2), $bw, $bh)
  $bg.Dispose()
} else {
  $g.Clear([System.Drawing.Color]::FromArgb(255, 70, 120, 60))
}
$dim = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(56, 6, 16, 12))
$g.FillRectangle($dim, 0, 0, $W, $H)
$dim.Dispose()

$px = SX(0 - $panelW / 2)
$py = SY($panelY + $panelH / 2)
$glass = [System.Drawing.Image]::FromFile($glassPath)
Draw-Slice $g $glass $px $py $panelW $panelH 76
$glass.Dispose()

$font = 'Microsoft YaHei'
$white = [System.Drawing.Color]::White
$ink = [System.Drawing.Color]::FromArgb(255, 92, 58, 32)
Draw-Text $g '选择能力' (SX -260) (SY($panelY + $titleY + 32)) 520 64 40 $white $font

$tones = @(
  @{ fill = [System.Drawing.Color]::FromArgb(255, 246, 233, 214); edge = [System.Drawing.Color]::FromArgb(255, 214, 176, 130); tab = [System.Drawing.Color]::FromArgb(255, 214, 168, 96); coin = [System.Drawing.Color]::FromArgb(255, 236, 186, 48) },
  @{ fill = [System.Drawing.Color]::FromArgb(255, 198, 226, 248); edge = [System.Drawing.Color]::FromArgb(255, 120, 176, 214); tab = [System.Drawing.Color]::FromArgb(255, 96, 168, 220); coin = [System.Drawing.Color]::FromArgb(255, 186, 196, 206) },
  @{ fill = [System.Drawing.Color]::FromArgb(255, 255, 170, 78); edge = [System.Drawing.Color]::FromArgb(255, 230, 110, 30); tab = [System.Drawing.Color]::FromArgb(255, 240, 120, 28); coin = [System.Drawing.Color]::FromArgb(255, 186, 196, 206) }
)
$offers = @(
  @{ rarity = '普通'; name = '攻击强化'; cost = '50' },
  @{ rarity = '稀有'; name = '迅捷之力'; cost = '500' },
  @{ rarity = '史诗'; name = '金币加成'; cost = '500' }
)

for ($i = 0; $i -lt 3; $i++) {
  $cx = $cardX[$i]
  $cy = $panelY + $cardY
  $left = SX($cx - $cardW / 2)
  $top = SY($cy + $cardH / 2)
  $tone = $tones[$i]
  if ($i -eq 2) {
    Fill-Round $g ($left - 11) ($top - 11) ($cardW + 22) ($cardH + 22) 36 ([System.Drawing.Color]::FromArgb(150, 255, 150, 48)) $null
  }
  Fill-Round $g $left $top $cardW $cardH 28 $tone.fill $tone.edge
  if ($i -eq 2) {
    $bx = SX($cx - 98)
    $by = SY($cy + $cardH / 2 + 28 + 24)
    Fill-Round $g $bx $by 196 48 16 ([System.Drawing.Color]::FromArgb(255, 255, 196, 48)) ([System.Drawing.Color]::FromArgb(255, 214, 140, 24))
    Draw-Text $g '★ 推荐 ★' $bx $by 196 48 20 $white $font
  }
  $tabDrop = $(if ($i -eq 2) { 28 } else { 8 })
  $tx = SX($cx - 74)
  $ty = SY($cy + $cardH / 2 - $tabDrop + 23)
  Fill-Round $g $tx $ty 148 46 14 $tone.tab $tone.edge
  Draw-Text $g $offers[$i].rarity $tx $ty 148 46 20 $white $font
  $ix = SX($cx - 84)
  $iy = SY($cy + 56 + 84)
  $well = [System.Drawing.Color]::FromArgb(255, [Math]::Min(255, $tone.fill.R + 18), [Math]::Min(255, $tone.fill.G + 16), [Math]::Min(255, $tone.fill.B + 12))
  Fill-Round $g $ix $iy 168 168 24 $well $tone.edge
  Draw-Text $g $offers[$i].name (SX($cx - $cardW / 2)) (SY($cy - 118 + 24)) $cardW 48 28 $ink $font
  $coinX = SX($cx - 36)
  $coinY = SY($cy - 206)
  $coin = New-Object System.Drawing.SolidBrush $tone.coin
  $g.FillEllipse($coin, ($coinX - 16), ($coinY - 16), 32, 32)
  $coin.Dispose()
  Draw-Text $g $offers[$i].cost (SX($cx + 24 - 44)) (SY($cy - 206 + 24)) 88 48 28 $ink $font
}

function Draw-Play($g, $x, $y, $w, $h) {
  $ax = $x + [Math]::Min(36, $w * 0.22)
  $ay = [Math]::Min(14, $h * 0.22)
  $midY = $y + $h / 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddPolygon(@(
    (New-Object System.Drawing.Point ([int]$ax), ([int]($midY - $ay))),
    (New-Object System.Drawing.Point ([int]$ax), ([int]($midY + $ay))),
    (New-Object System.Drawing.Point ([int]($ax + $ay * 1.6)), ([int]$midY))
  )) | Out-Null
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230, 255, 255, 255))
  $g.FillPath($brush, $path)
  $brush.Dispose()
  $path.Dispose()
}

$fx = SX(0 - $freeW / 2)
$fy = SY($panelY + $freeY + $freeH / 2)
Fill-Round $g $fx $fy $freeW $freeH ([int]($freeH * 0.42)) ([System.Drawing.Color]::FromArgb(255, 32, 176, 168)) ([System.Drawing.Color]::FromArgb(255, 12, 110, 104))
Draw-Play $g $fx $fy $freeW $freeH
Draw-Text $g '免费' ($fx + 16) $fy ($freeW - 48) $freeH 20 $white $font

$rollFill = @(
  @{ fill = [System.Drawing.Color]::FromArgb(255, 32, 132, 220); edge = [System.Drawing.Color]::FromArgb(255, 16, 78, 160) },
  @{ fill = [System.Drawing.Color]::FromArgb(255, 242, 138, 36); edge = [System.Drawing.Color]::FromArgb(255, 176, 78, 12) }
)
for ($i = 0; $i -lt 2; $i++) {
  $rx = SX($rollX[$i] - $rollW / 2)
  $ry = SY($panelY + $rollY + $rollH / 2)
  Fill-Round $g $rx $ry $rollW $rollH ([int]($rollH * 0.42)) $rollFill[$i].fill $rollFill[$i].edge
  Draw-Play $g $rx $ry $rollW $rollH
  Draw-Text $g '换一换' ($rx + 16) $ry ($rollW - 48) $rollH 28 $white $font
}

$g.Dispose()
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output $out
