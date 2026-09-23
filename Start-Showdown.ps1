[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 4173,

    [switch]$Open
)

$siteRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'public'))
$siteRootPrefix = $siteRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not (Test-Path -LiteralPath $siteRoot -PathType Container)) {
    throw "Site directory was not found: $siteRoot"
}

$mimeTypes = @{
    '.css'  = 'text/css; charset=utf-8'
    '.html' = 'text/html; charset=utf-8'
    '.ico'  = 'image/x-icon'
    '.js'   = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.map'  = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.svg'  = 'image/svg+xml'
    '.webp' = 'image/webp'
}

$url = "http://localhost:$Port/"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)

try {
    $listener.Start()
    Write-Host ''
    Write-Host '  SMT Showdown is ready.' -ForegroundColor Cyan
    Write-Host "  $url" -ForegroundColor White
    Write-Host '  Press Ctrl+C to stop the server.' -ForegroundColor DarkGray
    Write-Host ''

    if ($Open) {
        Start-Process $url
    }

    while ($true) {
        $client = $listener.AcceptTcpClient()
        $stream = $null
        $reader = $null
        try {
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) {
                continue
            }
            while ($true) {
                $headerLine = $reader.ReadLine()
                if ([string]::IsNullOrEmpty($headerLine)) { break }
            }

            $requestParts = $requestLine.Split(' ')
            $method = $requestParts[0]
            $rawTarget = $requestParts[1].Split('?')[0]
            $requestPath = [System.Uri]::UnescapeDataString($rawTarget.TrimStart('/'))
            if ([string]::IsNullOrWhiteSpace($requestPath)) {
                $requestPath = 'index.html'
            }

            $requestPath = $requestPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $candidate = [System.IO.Path]::GetFullPath((Join-Path $siteRoot $requestPath))
            $insideRoot = $candidate.StartsWith($siteRootPrefix, [System.StringComparison]::OrdinalIgnoreCase)

            if (-not $insideRoot -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
                $status = '404 Not Found'
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
                $contentType = 'text/plain; charset=utf-8'
            }
            else {
                $extension = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
                $contentType = $mimeTypes[$extension]
                if (-not $contentType) {
                    $contentType = 'application/octet-stream'
                }
                $bytes = [System.IO.File]::ReadAllBytes($candidate)
                $status = '200 OK'
            }

            $headers = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            if ($method -ne 'HEAD') {
                $stream.Write($bytes, 0, $bytes.Length)
            }
            $stream.Flush()
        }
        catch {
            Write-Warning $_.Exception.Message
        }
        finally {
            if ($reader) { $reader.Dispose() }
            if ($stream) { $stream.Dispose() }
            $client.Close()
        }
    }
}
finally {
    $listener.Stop()
}
