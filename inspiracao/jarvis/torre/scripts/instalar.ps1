<#
  Instala a Torre de controle nesta máquina (Windows, PowerShell 5.1).

  - Confere Node 20+ e o `claude`.
  - O vault vive no OneDrive: node_modules dentro dele sincronizaria milhares de arquivos.
    Por isso as dependências ficam em %LOCALAPPDATA%\jarvis-torre\node_modules e
    torre\node_modules é uma junction para lá. Se já existir uma pasta de verdade no
    lugar, o script avisa e não mexe nela (nada se apaga).
  - Roda `npm install` em torre\.

  Idempotente: pode rodar de novo quando o package.json mudar.

  Uso:  powershell -ExecutionPolicy Bypass -File torre\scripts\instalar.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$torre = Split-Path -Parent $PSScriptRoot

function Falhar([string]$msg) {
  Write-Host "ERRO: $msg" -ForegroundColor Red
  exit 1
}

# --- 1. Node 20+ -----------------------------------------------------------------
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Falhar 'Node não encontrado no PATH. Instale o Node 20 ou mais novo (LTS) e abra um terminal novo.' }
$versao = (& node -v).Trim()
$maior = 0
if ($versao -match '^v(\d+)\.') { $maior = [int]$Matches[1] }
if ($maior -lt 20) { Falhar "Node $versao é antigo demais: a Torre pede Node 20 ou mais novo." }
Write-Host "Node $versao ok"

# --- 2. claude -------------------------------------------------------------------
$claude = Get-Command claude -ErrorAction SilentlyContinue
if ($claude) {
  Write-Host "claude ok ($($claude.Source))"
} else {
  $padrao = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
  if (Test-Path -LiteralPath $padrao) {
    Write-Host "AVISO: o claude existe em $padrao, mas não está no PATH. A Torre abre as sessões com 'claude': ponha $(Split-Path -Parent $padrao) no PATH do usuário e abra um terminal novo." -ForegroundColor Yellow
  } else {
    Falhar 'Claude Code não encontrado (claude). Instale e faça login antes de subir a Torre.'
  }
}

# --- 3. npm install fora do OneDrive ---------------------------------------------
# O npm trata uma junction em node_modules como "não pasta" e a troca por uma pasta de
# verdade. Por isso a instalação roda numa cópia do package.json em %LOCALAPPDATA%, e
# torre\node_modules só aponta para lá.
$base = Join-Path $env:LOCALAPPDATA 'jarvis-torre'
$destino = Join-Path $base 'node_modules'
$link = Join-Path $torre 'node_modules'
New-Item -ItemType Directory -Path $base -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $torre 'package.json') -Destination $base -Force
$lock = Join-Path $torre 'package-lock.json'
if (Test-Path -LiteralPath $lock) { Copy-Item -LiteralPath $lock -Destination $base -Force }

Write-Host "Rodando npm install em $base ..."
Push-Location -LiteralPath $base
try {
  & npm.cmd install
  $codigo = $LASTEXITCODE
} finally {
  Pop-Location
}
if ($codigo -ne 0) { Falhar "npm install terminou com código $codigo." }
# O lock volta para o repo: a versão instalada fica registrada junto do código.
Copy-Item -LiteralPath (Join-Path $base 'package-lock.json') -Destination $lock -Force

# --- 4. junction torre\node_modules -> %LOCALAPPDATA% ------------------------------
$item = Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue
if ($null -eq $item) {
  New-Item -ItemType Junction -Path $link -Target $destino | Out-Null
  Write-Host "Junction criada: $link -> $destino"
} elseif ($item.LinkType -eq 'Junction' -or $item.LinkType -eq 'SymbolicLink') {
  $alvo = @($item.Target)[0]
  if ($alvo -and ([IO.Path]::GetFullPath($alvo).TrimEnd('\') -ne [IO.Path]::GetFullPath($destino).TrimEnd('\'))) {
    Write-Host "AVISO: $link já é um link, mas aponta para $alvo (esperado: $destino). Deixei como está." -ForegroundColor Yellow
  } else {
    Write-Host "Junction já existe: $link -> $destino"
  }
} else {
  # Pasta de verdade (de um npm install rodado direto em torre\): sai do OneDrive para
  # %LOCALAPPDATA%\jarvis-torre\node_modules.<data>, sem apagar nada, e a junction entra no lugar.
  $guarda = "$destino.antigo-$(Get-Date -Format 'yyyyMMddHHmmss')"
  Move-Item -LiteralPath $link -Destination $guarda
  New-Item -ItemType Junction -Path $link -Target $destino | Out-Null
  Write-Host "A pasta node_modules de dentro do OneDrive foi movida para $guarda; junction criada: $link -> $destino" -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Torre instalada. Para subir: torre\scripts\iniciar.ps1 (ou /torre no Jarvis).' -ForegroundColor Green
exit 0
