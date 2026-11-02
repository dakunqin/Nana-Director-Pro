Add-Type -AssemblyName System.Drawing
$taskRoot=Split-Path -Parent $PSScriptRoot
$version=(Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json).version
$bitmap=New-Object System.Drawing.Bitmap 600,400,([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics=[System.Drawing.Graphics]::FromImage($bitmap)
$titleFont=New-Object System.Drawing.Font 'Segoe UI',26,([System.Drawing.FontStyle]::Bold)
$bodyFont=New-Object System.Drawing.Font 'Microsoft YaHei UI',15
try {
 $graphics.Clear([System.Drawing.Color]::FromArgb(14,22,27))
 $graphics.DrawString('Nana Director PRO',$titleFont,[System.Drawing.Brushes]::White,45,90)
 $graphics.DrawString(('v'+$version),$bodyFont,[System.Drawing.Brushes]::White,48,155)
 $graphics.DrawString('正在启动 · Starting…',$bodyFont,[System.Drawing.Brushes]::White,48,220)
 $graphics.DrawString('开源版 · Open Source',$bodyFont,[System.Drawing.Brushes]::White,48,295)
 $bitmap.Save((Join-Path $taskRoot 'desktop/splash.bmp'),[System.Drawing.Imaging.ImageFormat]::Bmp)
} finally { $graphics.Dispose();$bitmap.Dispose();$titleFont.Dispose();$bodyFont.Dispose() }
