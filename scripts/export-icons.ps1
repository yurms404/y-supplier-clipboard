Add-Type -AssemblyName System.Drawing
$iconRoot = Join-Path $PSScriptRoot '..\icons'
$iconInput = [System.Drawing.Image]::FromFile((Join-Path $iconRoot 'y-supplier-source.png'))
try {
    foreach ($iconSize in @(16, 32, 48, 128, 1024)) {
        $iconBitmap = [System.Drawing.Bitmap]::new($iconSize, $iconSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
        try {
            $iconGraphics.Clear([System.Drawing.Color]::Transparent)
            $iconGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $iconGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $iconGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $iconGraphics.DrawImage($iconInput, 0, 0, $iconSize, $iconSize)
            $iconBitmap.Save((Join-Path $iconRoot "icon-$iconSize.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $iconGraphics.Dispose()
            $iconBitmap.Dispose()
        }
    }
} finally { $iconInput.Dispose() }
