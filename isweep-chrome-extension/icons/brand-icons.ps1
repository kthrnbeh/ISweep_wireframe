Add-Type -AssemblyName System.Drawing
$bg = [System.Drawing.Color]::FromArgb(255,255,255,255)
$accent = [System.Drawing.Color]::FromArgb(0xa2,0xcb,0xd7)
$textColor = [System.Drawing.Color]::FromArgb(0x10,0x25,0x2b)
$sizes = 16,32,48,128
foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s,$s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear($bg)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'ClearTypeGridFit'
    $padding = [int]([Math]::Max(1, $s * 0.12))
    $circleRect = New-Object System.Drawing.Rectangle $padding,$padding,($s - $padding*2),($s - $padding*2)
    $brush = New-Object System.Drawing.SolidBrush $accent
    $g.FillEllipse($brush, $circleRect)
    $brush.Dispose()
    $fontSize = if ($s -le 32) { $s / 3.2 } else { $s / 3.0 }
    $fontSizeSingle = [System.Single]::Parse($fontSize.ToString([System.Globalization.CultureInfo]::InvariantCulture))
    $font = New-Object System.Drawing.Font 'Segoe UI Semibold', $fontSizeSingle, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel
    $text = 'IS'
    $textSize = $g.MeasureString($text, $font)
    $x = ($s - $textSize.Width) / 2
    $y = ($s - $textSize.Height) / 2
    $textBrush = New-Object System.Drawing.SolidBrush $textColor
    $g.DrawString($text, $font, $textBrush, $x, $y)
    $textBrush.Dispose()
    $font.Dispose()
    $g.Dispose()
    $outPath = "c:/ISweep_wireframe/isweep-chrome-extension/icons/icon-$s.png"
    $bmp.Save($outPath,[System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Updated $outPath"
}
