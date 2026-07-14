/** Desenho SVG de uma baia de agregados (vista frontal): paredes em U de
 *  concreto, topo aberto, e monte de material com nível proporcional.
 *
 *  - fracao: nível 0–1 (estoque_atual/capacidade, clampado aqui);
 *    null = capacidade desconhecida → monte fantasma de 50% + "?".
 *  - cor: cor do material (cadastro de baias).
 *
 *  Material sólido: sem onda animada como nos tanques — gradiente estático
 *  com crista sutil (pico no centro, como uma pilha de agregado).
 */
import { useId } from 'react'

interface BaiaSvgProps {
  fracao: number | null
  cor: string
}

export default function BaiaSvg({ fracao, cor }: BaiaSvgProps) {
  const desconhecido = fracao === null
  const f = desconhecido ? 0.5 : Math.max(0, Math.min(1, fracao))
  // id único por instância (várias baias na mesma página); sem ':' do useId
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const clipId = `baia-clip-${uid}`
  const gradId = `baia-grad-${uid}`
  // interior da baia: x 25–195, nível de 105 (piso) até 20 (rente à borda)
  const esq = 25, dir = 195, topo = 20, fundo = 105
  const meio = (esq + dir) / 2
  const superficieY = fundo - (fundo - topo) * f
  // superfície do monte: ombros nas paredes e pico suave no centro
  const crista = `M${esq} ${superficieY + 5} Q${meio} ${superficieY - 9} ${dir} ${superficieY + 5}`
  return (
    <svg viewBox="0 0 220 130" className="w-full h-40" role="img" aria-label="Baia de agregados">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity={0.95} />
          <stop offset="100%" stopColor={cor} stopOpacity={0.55} />
        </linearGradient>
      </defs>
      <clipPath id={clipId}>
        <rect x={esq} y={14} width={dir - esq} height={fundo - 14} />
      </clipPath>
      {/* piso interno */}
      <rect x={esq} y={topo} width={dir - esq} height={fundo - topo} fill="#f8fafc" />
      {/* monte de material */}
      {(desconhecido || f > 0) && (
        <g clipPath={`url(#${clipId})`} opacity={desconhecido ? 0.35 : 1}>
          <path d={`${crista} V${fundo} H${esq} Z`} fill={`url(#${gradId})`} />
          {/* crista: borda sutil da superfície */}
          <path d={crista} fill="none" stroke={cor} strokeWidth={2.5} strokeOpacity={0.9} />
        </g>
      )}
      {/* paredes em U (esquerda, direita, piso) com borda superior discreta */}
      <rect x={13} y={12} width={12} height={fundo - 12} rx={2} fill="#cbd5e1" stroke="#94a3b8" strokeWidth={1.5} />
      <rect x={dir} y={12} width={12} height={fundo - 12} rx={2} fill="#cbd5e1" stroke="#94a3b8" strokeWidth={1.5} />
      <rect x={13} y={fundo} width={dir - 13 + 12} height={12} rx={2} fill="#cbd5e1" stroke="#94a3b8" strokeWidth={1.5} />
      {desconhecido && (
        <text x={meio} y={75} textAnchor="middle" fontSize={30} fontWeight="bold" fill="#475569">?</text>
      )}
    </svg>
  )
}
