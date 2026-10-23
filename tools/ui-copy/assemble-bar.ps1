Add-Type -AssemblyName System.Drawing
$srcPath = 'd:\Custom\TD\assets\resources\ui\hud\bar-track.png'
$src = [System.Drawing.Image]::FromFile($srcPath)
$h = $src.Height
$pieces = @(
  @{ x = 0; w = 114 },
  @{ x = 207; w = 90 },
  @{ x = 207; w = 90 },
  @{ x = 207; w = 90 },
  @{ x = 207; w = 90 },
  @{ x = 207; w = 90 },
  @{ x = 207; w = 90 },
  @{ x = 207; w = 90 },
  @{ x = 834; w = 89 },
  @{ x = 1008; w = 112 }
)
$total = 0
foreach ($p in $pieces) { $total += $p.w }
$dst = New-Object System.Drawing.Bitmap $total, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$dx = 0
foreach ($p in $pieces) {
  $drect = New-Object System.Drawing.Rectangle $dx, 0, $p.w, $h
  $srect = New-Object System.Drawing.Rectangle $p.x, 0, $p.w, $h
  $g.DrawImage($src, $drect, $srect, [System.Drawing.GraphicsUnit]::Pixel)
  $dx += $p.w
}
$g.Dispose()
$src.Dispose()
$out = 'd:\Custom\TD\assets\resources\ui\hud\bar-track.png'
$dst.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose()
Write-Output "assembled ${total}x${h}"
