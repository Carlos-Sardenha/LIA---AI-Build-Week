// Busca lexical BM25 sobre os nós do grafo (título, aliases, propriedades textuais e corpo). Sem embedding.
import { norm, toList } from './vault.mjs'

const STOP = new Set(('a o e de da do das dos em no na nos nas um uma uns umas que se por para pra pro com sem ao aos as os ser foi era sao ' +
  'ta to eu voce ele ela gente eles elas isso isto esse essa este esta aqui ali la entao ne mas ou como mais muito ja tambem nao sim so vai vou ' +
  'tem ter tinha fazer faz porque pq qual quais quando onde ate sobre me te lhe meu minha seu sua nosso nossa dele dela tipo assim coisa ' +
  'ok tudo bem bom dia created updated type source tags').split(' '))

function raiz(t) {
  if (t.length > 4) {
    if (/(oes|aes)$/.test(t)) return t.slice(0, -3) + 'ao'
    if (t.endsWith('s')) return t.slice(0, -1)
  }
  return t
}
export function tokenizar(s) { return norm(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t)).map(raiz) }

// texto que representa o nó: título e aliases pesam em dobro (repetidos)
export function textoDoNo(n) {
  const f = n.fm
  const props = Object.entries(f)
    .filter(([k]) => !['created', 'updated', 'type', 'tipo', 'source', 'tags'].includes(k))
    .flatMap(([, v]) => toList(v).map(String))
  const cab = [n.titulo, n.id.replace(/-/g, ' '), ...n.aliases].join(' · ')
  return `${cab} · ${cab} · ${props.join(' · ')} · ${toList(f.tags).join(' ')}\n${n.corpo ?? ''}`
}

export class BM25 {
  constructor(k1 = 1.2, b = 0.75) { this.k1 = k1; this.b = b; this.ids = []; this.len = []; this.post = new Map() }
  add(id, texto) {
    const d = this.ids.length
    this.ids.push(id)
    const toks = tokenizar(texto)
    this.len.push(toks.length)
    const tf = new Map()
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1)
    for (const [t, n] of tf) { let p = this.post.get(t); if (!p) this.post.set(t, p = []); p.push(d, n) }
  }
  buscar(q, k = 20, filtro = null) {
    const N = this.ids.length
    if (!N) return []
    const avg = this.len.reduce((s, x) => s + x, 0) / N || 1
    const sc = new Float64Array(N)
    for (const t of new Set(tokenizar(q))) {
      const p = this.post.get(t)
      if (!p) continue
      const df = p.length / 2
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
      for (let i = 0; i < p.length; i += 2) {
        const d = p[i], f = p[i + 1]
        sc[d] += idf * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * this.len[d] / avg))
      }
    }
    const out = []
    for (let d = 0; d < N; d++) if (sc[d] > 0 && (!filtro || filtro(this.ids[d]))) out.push({ id: this.ids[d], score: sc[d] })
    out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    return out.slice(0, k)
  }
}

export function indexar(g) {
  const bm = new BM25()
  for (const n of g.nos.values()) if (!g.redir.has(n.id)) bm.add(n.id, textoDoNo(n))
  return bm
}
