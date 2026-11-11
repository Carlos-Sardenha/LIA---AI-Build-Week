@echo off
rem `op` das sessoes da Torre no PowerShell/cmd: repassa para op-intermediario.mjs
rem (leitura no cofre wehandle pela Torre; o resto vai para o op de verdade, TORRE_OP_REAL).
node "%~dp0op-intermediario.mjs" %*
