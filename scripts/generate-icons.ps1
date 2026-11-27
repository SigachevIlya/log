# Run from the repository root on Windows. Uses only built-in System.Drawing.
Add-Type -AssemblyName System.Drawing
$outputDirectory = Join-Path (Get-Location) 'public'
foreach ($size in @(180, 192, 512)) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.Color]::FromArgb(17, 17, 17))
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $font = New-Object System.Drawing.Font('Arial', ($size * 0.25), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(242, 242, 242))
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rectangle = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $graphics.DrawString('LOG.', $font, $brush, $rectangle, $format)
    $filename = if ($size -eq 180) { 'apple-touch-icon.png' } else { "icon-$size.png" }
    $bitmap.Save((Join-Path $outputDirectory $filename), [System.Drawing.Imaging.ImageFormat]::Png)
    $format.Dispose(); $brush.Dispose(); $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
