<#
  Sobe a Torre de controle (ou só abre a página, se ela já estiver no ar).

  - Já há algo ouvindo na porta: abre http://127.0.0.1:<porta> no navegador e sai.
  - Senão: roda `npm start` em torre\ neste terminal (Ctrl+C encerra) e abre o
    navegador assim que a porta responder.

  Parâmetros:
    -Porta <n>       porta da Torre (padrão: TORRE_PORT, senão 4477)
    -SemNavegador    não abre o navegador

  Uso:  powershell -ExecutionPolicy Bypass -File torre\scripts\iniciar.ps1 [-Porta 4477] [-SemNavegador]
#>
[CmdletBinding()]
param(
  [int]$Porta = 0,
  [switch]$SemNavegador
)

$ErrorActionPreference = 'Stop'
$torre = Split-Path -Parent $PSScriptRoot

if ($Porta -le 0) {
  if ($env:TORRE_PORT) { $Porta = [int]$env:TORRE_PORT } else { $Porta = 4477 }
}
$url = "http://127.0.0.1:$Porta"

function Ouvindo([int]$p) {
  try {
    $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop
    return [bool]$c
  } catch {
    return $false
  }
}

if (Ouvindo $Porta) {
  Write-Host "A Torre já está no ar em $url"
  if (-not $SemNavegador) { Start-Process $url }
  exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $torre 'node_modules\tsx'))) {
  Write-Host 'Dependências não instaladas. Rode antes: torre\scripts\instalar.ps1' -ForegroundColor Red
  exit 1
}

# Abre o navegador quando a porta responder, sem travar o npm start que roda aqui.
$job = $null
if (-not $SemNavegador) {
  $job = Start-Job -ArgumentList $Porta, $url -ScriptBlock {
    param($p, $u)
    for ($i = 0; $i -lt 120; $i++) {
      Start-Sleep -Milliseconds 500
      $tcp = New-Object System.Net.Sockets.TcpClient
      try {
        $tcp.Connect('127.0.0.1', $p)
        Start-Process $u
        return
      } catch {
        # ainda subindo
      } finally {
        $tcp.Close()
      }
    }
  }
}

$env:TORRE_PORT = "$Porta"
Write-Host "Subindo a Torre em $url (Ctrl+C encerra) ..."
Push-Location -LiteralPath $torre
try {
  & npm.cmd start
  $codigo = $LASTEXITCODE
} finally {
  Pop-Location
  if ($job) { Remove-Job -Job $job -Force -ErrorAction SilentlyContinue }
}
exit $codigo
