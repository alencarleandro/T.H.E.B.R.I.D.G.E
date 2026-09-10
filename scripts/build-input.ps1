$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path $PSScriptRoot -Parent
$compilerPath = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compilerPath)) { throw 'Compilador .NET Framework não encontrado.' }
$outputDirectory = Join-Path $projectDirectory 'native\bin'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
& $compilerPath /nologo /target:exe /platform:x64 "/out:$outputDirectory\BridgeInput.exe" (Join-Path $projectDirectory 'native\BridgeInput.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar controles nativos.' }
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap 256,256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#090D13'))
$pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#B5FF69')),10
$graphics.DrawLine($pen,55,190,55,85)
$graphics.DrawLine($pen,55,85,128,48)
$graphics.DrawLine($pen,128,48,201,85)
$graphics.DrawLine($pen,201,85,201,190)
$graphics.DrawLine($pen,55,124,201,124)
$graphics.DrawLine($pen,91,109,91,190)
$graphics.DrawLine($pen,128,92,128,190)
$graphics.DrawLine($pen,165,109,165,190)
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$iconStream = [System.IO.File]::Create((Join-Path $outputDirectory 'bridge.ico'))
try { $icon.Save($iconStream) } finally { $iconStream.Dispose(); $icon.Dispose(); $pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
