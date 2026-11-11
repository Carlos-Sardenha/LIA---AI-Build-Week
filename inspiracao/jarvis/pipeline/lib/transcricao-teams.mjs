// Transcrição do Teams → turnos numerados. Funções puras (sem I/O), usadas por pipeline/teams-transcricao.mjs e
// testadas em .harness/testes/transcricao-teams.test.mjs. Zero dependências.
//
// Entrada: a resposta de read_resource(meeting-transcript:///events/<token>) gravada verbatim (JSON), ou o texto da
// transcrição. O Graph entrega WebVTT:
//   00:00:03.120 --> 00:00:05.480
//   <v Ana Lima>Bom dia, pessoal.</v>
// Fallbacks aceitos: cue sem <v> no formato "Nome: fala", e o texto exportado do Teams ("Ana Lima   0:03" + fala na
// linha seguinte). Saída: [{ idx, t (segundos), falante, texto }], falas consecutivas do mesmo falante fundidas —
// mesmo contrato do turnos.txt do Meetrox (`tNNNN MM:SS Falante: fala`).

const pad = (n, w) => String(n).padStart(w, '0')
export const mmss = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h ? `${h}:${pad(m, 2)}:${pad(r, 2)}` : `${pad(m, 2)}:${pad(r, 2)}` }
const segundos = (h, m, s) => (+h || 0) * 3600 + +m * 60 + +s
const decodeEnt = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')

// Texto(s) de transcrição dentro da resposta do read_resource. Cada item de `transcripts` pode trazer o VTT em
// content/text/vtt/transcriptContent; sem campo conhecido, qualquer string do item que contenha um cue ("-->").
export function textosDaResposta(resp) {
  if (resp == null) return []
  if (typeof resp === 'string') {
    const s = resp.replace(/^﻿/, '')
    try { return textosDaResposta(JSON.parse(s)) } catch { return s.trim() ? [s] : [] }
  }
  const lista = Array.isArray(resp) ? resp : Array.isArray(resp.transcripts) ? resp.transcripts : [resp]
  const out = []
  const achaCue = (v) => {
    if (typeof v === 'string') return v.includes('-->') ? v : null
    if (v && typeof v === 'object') for (const x of Object.values(v)) { const r = achaCue(x); if (r) return r }
    return null
  }
  for (const t of lista) {
    if (typeof t === 'string') { if (t.trim()) out.push(t); continue }
    if (!t || typeof t !== 'object') continue
    const direto = ['content', 'text', 'vtt', 'transcriptContent'].map((k) => t[k]).find((v) => typeof v === 'string' && v.trim())
    const txt = direto ?? achaCue(t)
    if (txt) out.push(txt)
  }
  return out
}

const CUE = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,]\d+)?\s*-->\s*(?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d+)?/
const VOZ = /<v(?:\.[^\s>]+)?\s+([^>]+)>/
const NOME_FALA = /^([^:<>]{2,60}?):\s+(.+)$/
const EXPORT = /^(.{2,80}?)\s{2,}(?:(\d+):)?(\d{1,2}):(\d{2})\s*$/

// Segmentos crus (antes de fundir) de UM texto de transcrição.
export function segmentos(raw) {
  const linhas = String(raw).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  const segs = []
  if (linhas.some((l) => CUE.test(l.trim()))) {
    let cur = null
    const fecha = () => { if (cur && cur.texto) segs.push(cur); cur = null }
    for (const linha of linhas) {
      const l = linha.trim()
      const m = l.match(CUE)
      if (m) { fecha(); cur = { t: segundos(m[1], m[2], m[3]), falante: null, texto: '' }; continue }
      if (!l) { fecha(); continue }
      if (!cur) continue // WEBVTT, NOTE, id de cue antes do timestamp
      let txt = l
      const v = txt.match(VOZ)
      if (v) { cur.falante ??= decodeEnt(v[1].trim()); txt = txt.replace(/<\/?v[^>]*>/g, '') }
      txt = decodeEnt(txt.replace(/<[^>]+>/g, '')).trim()
      if (!cur.falante && !cur.texto) { const nf = txt.match(NOME_FALA); if (nf) { cur.falante = nf[1].trim(); txt = nf[2].trim() } }
      if (txt) cur.texto = `${cur.texto} ${txt}`.trim()
    }
    fecha()
  } else {
    for (const linha of linhas) {
      const l = linha.trim()
      if (!l) continue
      const m = l.match(EXPORT)
      if (m) { segs.push({ t: segundos(m[2], m[3], m[4]), falante: m[1].trim(), texto: '' }); continue }
      if (segs.length) segs[segs.length - 1].texto = `${segs[segs.length - 1].texto} ${l}`.trim()
    }
  }
  return segs.filter((s) => s.texto).map((s) => ({ ...s, falante: s.falante || 'Desconhecido' }))
}

// Turnos numerados a partir da resposta (ou do texto). Várias transcrições da mesma reunião (parou e religou o
// "Transcrever") entram em sequência, na ordem recebida.
export function turnos(entrada) {
  const segs = textosDaResposta(entrada).flatMap(segmentos)
  const out = []
  for (const s of segs) {
    const last = out[out.length - 1]
    if (last && last.falante === s.falante) last.texto = `${last.texto} ${s.texto}`.trim()
    else out.push({ idx: out.length + 1, t: s.t, falante: s.falante, texto: s.texto })
  }
  return out
}

export const linhaTurno = (t) => `t${pad(t.idx, 4)} ${mmss(t.t)} ${t.falante}: ${t.texto}`
export const formatarTurnos = (ts) => ts.map(linhaTurno).join('\n') + (ts.length ? '\n' : '')

const stripAccents = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
export const slugify = (s) => stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '') || 'reuniao'
