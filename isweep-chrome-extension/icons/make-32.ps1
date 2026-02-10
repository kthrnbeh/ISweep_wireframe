Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile('c:/ISweep_wireframe/isweep-chrome-extension/icons/icon-128.png')
$bmp = New-Object System.Drawing.Bitmap 32,32
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$g.InterpolationMode = 'HighQualityBicubic'
$g.DrawImage($src, 0, 0, 32, 32)
$g.Dispose()
$bmp.Save('c:/ISweep_wireframe/isweep-chrome-extension/icons/icon-32.png',[System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$src.Dispose()
Write-Output 'Built icon-32.png'
