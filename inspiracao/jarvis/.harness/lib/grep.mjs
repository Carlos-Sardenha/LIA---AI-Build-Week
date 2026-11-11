// Busca literal linha a linha, em memória, sem processo externo: sem caixa e sem acento ("reuniao" acha "reunião").
// Este módulo só casa padrões; consultas.mjs aplica filtros e formata.
import { stripAccents } from './vault.mjs'

// Dobra caixa e acento SEM mudar o comprimento: a posição da ocorrência no texto dobrado vale no original.
const MAPA = new Map()
for (let c = 0xc0; c <= 0x17f; c++) {
  const ch = String.fromCharCode(c).toLowerCase()
  const b = stripAccents(ch)
  if (b.length === 1 && b !== ch) MAPA.set(ch, b)
}
export function dobrar(s) {
  s = String(s ?? '')
  const l = s.toLowerCase()
  return (l.length === s.length ? l : s).replace(/[à-ſ]/g, (ch) => MAPA.get(ch) ?? ch)
}

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// termo literal com alternativas separadas por "|" (OU), ou regex JS quando regex = true
export function padrao(termo, { regex = false } = {}) {
  const t = String(termo ?? '').trim()
  if (t.length < 2 || t.length > 200) throw new Error('o termo precisa ter de 2 a 200 caracteres')
  if (regex) {
    try { return new RegExp(stripAccents(t), 'gi') } catch (e) { throw new Error(`regex inválida: ${e.message}`, { cause: e }) }
  }
  const alts = t.split('|').map((x) => dobrar(x.trim())).filter((x) => x.length >= 2)
  if (!alts.length) throw new Error('nenhuma alternativa com 2+ caracteres no termo')
  return new RegExp(alts.map(escapar).join('|'), 'g')
}

// termos que precisam aparecer TODOS na mesma nota (lista, ou string separada por ";")
export function exigencias(exigir) {
  const lista = Array.isArray(exigir) ? exigir : String(exigir ?? '').split(';')
  return lista.map((x) => String(x).trim()).filter(Boolean).map((x) => padrao(x))
}

// ocorrências numa lista de linhas já dobradas: [{ i, ini, fim }] (só a primeira de cada linha)
export function casarLinhas(dobradas, re) {
  const out = []
  dobradas.forEach((d, i) => {
    re.lastIndex = 0
    const m = re.exec(d)
    if (m && m[0].length) out.push({ i, ini: m.index, fim: m.index + m[0].length })
  })
  return out
}

export function contar(dobrado, re) {
  re.lastIndex = 0
  let n = 0, m
  while ((m = re.exec(dobrado))) {
    if (!m[0].length) { re.lastIndex++; continue }
    n++
  }
  return n
}

// recorte da linha em volta da ocorrência, com a ocorrência marcada «assim»
export function recorte(linha, ini, fim, largura = 220) {
  const sobra = Math.max(0, largura - (fim - ini))
  const a = Math.max(0, ini - Math.floor(sobra / 2))
  const b = Math.min(linha.length, fim + Math.ceil(sobra / 2))
  const limpa = (s) => s.replace(/\s+/g, ' ')
  return `${a > 0 ? '…' : ''}${limpa(linha.slice(a, ini))}«${limpa(linha.slice(ini, fim))}»${limpa(linha.slice(fim, b))}${b < linha.length ? '…' : ''}`
}
