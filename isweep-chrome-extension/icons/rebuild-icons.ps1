Add-Type -AssemblyName System.Drawing
$srcPath = "c:/ISweep_wireframe/docs/images/ISweep.png"
if (-not (Test-Path $srcPath)) { Write-Error "Missing logo at $srcPath"; exit 1 }
$src = [System.Drawing.Image]::FromFile($srcPath)
$sizes = 16,32,48,128
foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.SmoothingMode = 'HighQuality'
    $g.PixelOffsetMode = 'HighQuality'
    $g.CompositingQuality = 'HighQuality'
    $padding = [int]([Math]::Max(1, $s * 0.1))
    $targetSize = $s - ($padding * 2)
    $ratio = [Math]::Min($targetSize / $src.Width, $targetSize / $src.Height)
    $nw = [int]($src.Width * $ratio)
    $nh = [int]($src.Height * $ratio)
    $x = [int](($s - $nw) / 2)
    $y = [int](($s - $nh) / 2)
    $g.DrawImage($src, $x, $y, $nw, $nh)
    $g.Dispose()
    $outPath = "c:/ISweep_wireframe/isweep-chrome-extension/icons/icon-$s.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Updated $outPath"
}
$src.Dispose()
