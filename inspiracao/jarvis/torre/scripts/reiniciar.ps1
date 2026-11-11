<#
  Reinicia a Torre de controle sem perder as conversas.

  Encerra o processo DONO DA PORTA (nunca por nome: "node" pegaria outras instâncias,
  inclusive uma Torre de teste em outra porta) e sobe de novo pelo iniciar.ps1.
  As sessões encerram e voltam com Retomar (claude --resume, a conversa continua).

  Rode de um terminal FORA da Torre: dentro de um card, o terminal morre junto.

  Parâmetros:
    -Porta <n>       porta da Torre (padrão: TORRE_PORT, senão 4477)
    -SemNavegador    não abre o navegador ao subir
    -SoEncerrar      só encerra; quem chama sobe depois (ex.: /torre no Jarvis)

  Uso:  powershell -ExecutionPolicy Bypass -File torre\scripts\reiniciar.ps1 [-Porta 4477] [-SemNavegador] [-SoEncerrar]
#>
[CmdletBinding()]
param(
  [int]$Porta = 0,
  [switch]$SemNavegador,
  [switch]$SoEncerrar
)

$ErrorActionPreference = 'Stop'

if ($env:TORRE_SESSION) {
  Write-Host 'Este terminal é uma sessão da Torre: reiniciar daqui derruba o próprio terminal. Rode de um terminal fora da Torre.' -ForegroundColor Red
  exit 1
}

if ($Porta -le 0) {
  if ($env:TORRE_PORT) { $Porta = [int]$env:TORRE_PORT } else { $Porta = 4477 }
}

function Donos([int]$p) {
  try {
    return @(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop |
      Select-Object -ExpandProperty OwningProcess -Unique |
      Where-Object { $_ -gt 0 })
  } catch {
    return @()
  }
}

$pids = Donos $Porta
if ($pids.Count -eq 0) {
  Write-Host "Nada ouvindo na porta $Porta."
} else {
  foreach ($id in $pids) {
    $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
    $nome = '?'
    if ($proc) { $nome = $proc.ProcessName }
    Write-Host "Encerrando o processo $id ($nome), dono da porta $Porta ..."
    try {
      Stop-Process -Id $id -Force -ErrorAction Stop
    } catch {
      Write-Host "Não consegui encerrar o processo ${id}: $($_.Exception.Message)" -ForegroundColor Red
      exit 1
    }
  }
  # Espera a porta liberar (até ~10 s).
  for ($i = 0; $i -lt 20; $i++) {
    if ((Donos $Porta).Count -eq 0) { break }
    Start-Sleep -Milliseconds 500
  }
  if ((Donos $Porta).Count -gt 0) {
    Write-Host "A porta $Porta continua ocupada. Confira com: Get-NetTCPConnection -LocalPort $Porta -State Listen" -ForegroundColor Red
    exit 1
  }
  Write-Host 'Torre encerrada. As sessões voltam com Retomar.'
}

if ($SoEncerrar) { exit 0 }

$iniciar = Join-Path $PSScriptRoot 'iniciar.ps1'
if ($SemNavegador) {
  & $iniciar -Porta $Porta -SemNavegador
} else {
  & $iniciar -Porta $Porta
}
exit $LASTEXITCODE
