@echo off
setlocal
cd /d "%~dp0"
echo ==========================================
echo Starting Aslin Fashion Portal Local Server
echo ==========================================
echo.
echo Please DO NOT close this window while using the application.
echo Your browser will open automatically.
echo.
powershell -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $listener = New-Object Net.HttpListener; $listener.Prefixes.Add('http://localhost:8080/'); try { $listener.Start() } catch { Write-Host 'Port 8080 is already in use. Please close any other servers and try again.'; Start-Sleep -Seconds 5; exit }; Start-Process 'http://localhost:8080/index.html'; while ($listener.IsListening) { $context = $listener.GetContext(); $response = $context.Response; $request = $context.Request; $path = $request.Url.LocalPath.Replace('/', '\'); if ($path -eq '\') { $path = '\index.html' }; $fullPath = Join-Path (Get-Location) $path; if (Test-Path $fullPath -PathType Leaf) { try { $bytes = [IO.File]::ReadAllBytes($fullPath); $ext = [IO.Path]::GetExtension($fullPath).ToLower(); if ($ext -eq '.css') { $response.ContentType = 'text/css' } elseif ($ext -eq '.js') { $response.ContentType = 'application/javascript' } elseif ($ext -eq '.jpg' -or $ext -eq '.jpeg') { $response.ContentType = 'image/jpeg' } elseif ($ext -eq '.png') { $response.ContentType = 'image/png' } elseif ($ext -eq '.svg') { $response.ContentType = 'image/svg+xml' } else { $response.ContentType = 'text/html' }; $response.ContentLength64 = $bytes.Length; $response.OutputStream.Write($bytes, 0, $bytes.Length) } catch {} } else { $response.StatusCode = 404 }; $response.Close() }"
