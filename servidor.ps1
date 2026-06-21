# Polvo V5 — Servidor local simples
# Execute: clique com o botão direito → "Executar com o PowerShell"

$porta = 3000
$pasta = $PSScriptRoot

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$porta/")
$listener.Start()

Write-Host ""
Write-Host "  Polvo V5 rodando em: http://localhost:$porta" -ForegroundColor Green
Write-Host "  Abrindo no Chrome..." -ForegroundColor Cyan
Write-Host "  (Feche esta janela para parar o servidor)" -ForegroundColor Gray
Write-Host ""

Start-Process "chrome.exe" "http://localhost:$porta"

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.ico'  = 'image/x-icon'
    '.svg'  = 'image/svg+xml'
}

while ($listener.IsListening) {
    try {
        $ctx  = $listener.GetContext()
        $req  = $ctx.Request
        $resp = $ctx.Response

        $localPath = $req.Url.LocalPath
        if ($localPath -eq '/') { $localPath = '/index.html' }

        $filePath = Join-Path $pasta $localPath.TrimStart('/')

        if (Test-Path $filePath -PathType Leaf) {
            $ext  = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = if ($mimeTypes[$ext]) { $mimeTypes[$ext] } else { 'application/octet-stream' }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)

            $resp.ContentType     = $mime
            $resp.ContentLength64 = $bytes.Length
            $resp.StatusCode      = 200
            $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $resp.StatusCode = 404
        }

        $resp.Close()
    } catch {
        # ignora erros de conexão fechada pelo cliente
    }
}
