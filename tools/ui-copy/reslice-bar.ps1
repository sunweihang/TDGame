Add-Type -AssemblyName System.Drawing

$srcPath = 'd:\Custom\TD\assets\resources\ui\hud\bar-track.png'
$src = [System.Drawing.Image]::FromFile($srcPath)
$scaleH = 112
$scaleW = [int][Math]::Round($src.Width * $scaleH / $src.Height)
$scaled = New-Object System.Drawing.Bitmap $scaleW, $scaleH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gs = [System.Drawing.Graphics]::FromImage($scaled)
$gs.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gs.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gs.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$gs.DrawImage($src, 0, 0, $scaleW, $scaleH)
$gs.Dispose()
$src.Dispose()

# Cap is the curved end. Keep it, stretch only the straight middle.
$cap = [int][Math]::Round(40 * $scaleH / 133)
$dstW = 1200
$dstH = $scaleH
$dst = New-Object System.Drawing.Bitmap $dstW, $dstH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy

$midSrc = $scaleW - 2 * $cap
$midDst = $dstW - 2 * $cap
$leftD = New-Object System.Drawing.Rectangle 0, 0, $cap, $dstH
$leftS = New-Object System.Drawing.Rectangle 0, 0, $cap, $scaleH
$midD = New-Object System.Drawing.Rectangle $cap, 0, $midDst, $dstH
$midS = New-Object System.Drawing.Rectangle $cap, 0, $midSrc, $scaleH
$rightD = New-Object System.Drawing.Rectangle ($dstW - $cap), 0, $cap, $dstH
$rightS = New-Object System.Drawing.Rectangle ($scaleW - $cap), 0, $cap, $scaleH
$g.DrawImage($scaled, $leftD, $leftS, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawImage($scaled, $midD, $midS, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawImage($scaled, $rightD, $rightS, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$scaled.Dispose()

$out = 'd:\Custom\TD\assets\resources\ui\hud\bar-track.png'
$dst.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose()
Write-Output "bar ${dstW}x${dstH} cap=$cap from scaled ${scaleW}x${scaleH}"
