$sizes = 16,32,48,128
Add-Type -AssemblyName System.Drawing
$bg = [System.Drawing.Color]::FromArgb(0x6d,0x5e,0xfc)
$fg = [System.Drawing.Brushes]::White
foreach($s in $sizes){
    $bmp = New-Object System.Drawing.Bitmap $s,$s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear($bg)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'ClearTypeGridFit'
    $fontSize = if($s -le 32){8}else{14}
    $font = New-Object System.Drawing.Font('Segoe UI',[single]$fontSize,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
    $text = 'IS'
    $sz = $g.MeasureString($text,$font)
    $x = ($s - $sz.Width)/2
    $y = ($s - $sz.Height)/2
    $g.DrawString($text,$font,$fg,$x,$y)
    $g.Dispose()
    $outPath = Join-Path 'c:/ISweep_wireframe/isweep-chrome-extension/icons' ("icon-$s.png")
    $bmp.Save($outPath,[System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Wrote $outPath"
}
