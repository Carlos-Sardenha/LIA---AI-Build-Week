<#
.SYNOPSIS
  Verifica o que seria publicado no GitHub (origin, PRIVADO) e FALHA se houver segredo.

.DESCRIPTION
  Politica do Jarvis (desde 2026-11-05): o repositorio privado guarda ESTRUTURA e
  CONTEUDO. Este script lista o conjunto publicavel = arquivos rastreados
  (git ls-files) + arquivos novos nao ignorados (git ls-files --others
  --exclude-standard) e falha (exit 1) quando:
    1. algum arquivo rastreado no indice hoje casa com o .gitignore (precisa de
       "git rm --cached", que o script so SUGERE);
    2. algum caminho tem padrao suspeito (.env, chave, node_modules, nome de segredo);
    3. algum arquivo publicavel contem segredo com valor (MEETROX_API_KEY=..., api_key=...,
       token, chave privada).
  Avisos: arquivos > 2 MB (nao varridos).

  Nao altera nada: nao roda git add, rm, commit nem push.

.PARAMETER Silencioso
  Nao lista os arquivos publicaveis; mostra so contagem e problemas.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File System/scripts/verificar-publicavel.ps1 -Silencioso
#>
[CmdletBinding()]
param(
  [switch]$Silencioso
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $raiz
try {

function Git-Linhas {
  param([string[]]$GitArgs)
  $saida = & git -c core.quotepath=false @GitArgs
  if ($LASTEXITCODE -ne 0) { throw "git $($GitArgs -join ' ') falhou (exit $LASTEXITCODE)" }
  @($saida | Where-Object { $_ -and $_.Trim() -ne '' })
}

$rastreados      = Git-Linhas @('ls-files')
$novos           = Git-Linhas @('ls-files', '--others', '--exclude-standard')
$rastreadosIgnor = Git-Linhas @('ls-files', '--cached', '--ignored', '--exclude-standard')

$publicaveis = @($rastreados + $novos | Sort-Object -Unique)

# O proprio script contem os regex de segredo; nao se auto-varre.
$autoCaminho = 'System/scripts/verificar-publicavel.ps1'

$padroesCaminho = @(
  @{ re = '(^|/)\.env($|\.)';           msg = 'arquivo .env' },
  @{ re = '\.(pem|key|pfx|p12)$';       msg = 'chave/certificado' },
  @{ re = '(^|/)node_modules/';         msg = 'node_modules' },
  @{ re = '(?i)(secret|credential|password)'; msg = 'nome sugere segredo' }
)
$padroesConteudo = @(
  @{ re = 'MEETROX_API_KEY\s*[=:]\s*["'']?[A-Za-z0-9_\-\.]{6,}';                     msg = 'MEETROX_API_KEY com valor' },
  @{ re = '(?i)\bapi[_-]?key\b\s*[=:]\s*["'']?[A-Za-z0-9_\-]{16,}';                  msg = 'api_key com valor' },
  @{ re = '(?i)\b(secret|token|password|senha)\b\s*[=:]\s*["''][^"''\s]{8,}["'']';   msg = 'segredo literal' },
  @{ re = '-----BEGIN [A-Z ]*PRIVATE KEY-----';                                      msg = 'chave privada' },
  @{ re = '\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{30,}';                             msg = 'token GitHub' },
  @{ re = '\bsk-(ant-)?[A-Za-z0-9_\-]{20,}';                                          msg = 'chave de API (sk-)' },
  @{ re = '\bxox[abpr]-[A-Za-z0-9\-]{10,}';                                           msg = 'token Slack' },
  @{ re = '\bAKIA[0-9A-Z]{16}\b';                                                     msg = 'chave AWS' },
  @{ re = '\beyJ[A-Za-z0-9_\-]{20,}\.eyJ[A-Za-z0-9_\-]{20,}\.';                       msg = 'JWT' }
)
$extBinarias = @('.png','.jpg','.jpeg','.gif','.webp','.ico','.pdf','.zip','.gz','.7z',
                 '.woff','.woff2','.ttf','.otf','.mp3','.mp4','.wav','.xlsx','.docx','.pptx')

$falhas = New-Object System.Collections.Generic.List[string]
$avisos = New-Object System.Collections.Generic.List[string]

# 2: caminhos suspeitos
foreach ($p in $publicaveis) {
  foreach ($r in $padroesCaminho) {
    if ($p -match $r.re -and $p -ne '.env.example') { $falhas.Add("[suspeito]  $p  ($($r.msg))") }
  }
}

# 1: rastreados que o .gitignore ja ignora
foreach ($p in $rastreadosIgnor) {
  $falhas.Add("[indice]    $p  (rastreado mas ignorado: tirar do indice com git rm --cached)")
}

# 3: segredos no conteudo dos arquivos publicaveis
foreach ($p in $publicaveis) {
  if ($p -eq $autoCaminho) { continue }
  if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { continue }   # rastreado mas apagado do disco
  $ext = [System.IO.Path]::GetExtension($p).ToLowerInvariant()
  if ($extBinarias -contains $ext) { continue }
  $info = Get-Item -LiteralPath $p
  if ($info.Length -gt 2MB) { $avisos.Add("[grande]    $p  ($([math]::Round($info.Length/1MB,1)) MB, nao varrido)"); continue }

  $linhas = [System.IO.File]::ReadAllLines($info.FullName, [System.Text.Encoding]::UTF8)
  for ($i = 0; $i -lt $linhas.Length; $i++) {
    foreach ($r in $padroesConteudo) {
      if ($linhas[$i] -match $r.re) { $falhas.Add("[segredo]   ${p}:$($i+1)  ($($r.msg); valor omitido)") }
    }
  }
}

# --- Relatorio --------------------------------------------------------------
Write-Host ''
Write-Host "Verificacao de publicacao - $raiz"
Write-Host ("Publicavel: {0} arquivos ({1} rastreados, {2} novos nao ignorados)" -f $publicaveis.Count, $rastreados.Count, $novos.Count)
if (-not $Silencioso) {
  Write-Host ''
  Write-Host '--- Seria publicado ---'
  $novosSet = @{}; foreach ($n in $novos) { $novosSet[$n] = $true }
  foreach ($p in $publicaveis) {
    $marca = if ($novosSet.ContainsKey($p)) { '+' } else { ' ' }
    Write-Host "  $marca $p"
  }
  Write-Host '  (+ = novo, ainda nao rastreado)'
}

if ($avisos.Count -gt 0) {
  Write-Host ''
  Write-Host ("--- Avisos ({0}) ---" -f $avisos.Count) -ForegroundColor Yellow
  $avisos | Sort-Object -Unique | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

if ($falhas.Count -gt 0) {
  Write-Host ''
  Write-Host ("--- FALHAS ({0}) ---" -f $falhas.Count) -ForegroundColor Red
  $falhas | Sort-Object -Unique | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  if ($rastreadosIgnor.Count -gt 0) {
    Write-Host ''
    Write-Host 'Para tirar do indice SEM apagar do disco (rodar manualmente, revisado):' -ForegroundColor Red
    Write-Host '  git rm -r --cached --quiet -- <caminhos acima marcados [indice]>' -ForegroundColor Red
  }
  Write-Host ''
  Write-Host 'RESULTADO: REPROVADO - nao faca push.' -ForegroundColor Red
  exit 1
}
Write-Host ''
Write-Host 'RESULTADO: OK - nenhum segredo no que seria publicado (repo privado).' -ForegroundColor Green
exit 0

} finally {
  Pop-Location
}
