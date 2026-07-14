/** Desenho SVG de um tanque com nível de líquido e onda animada na superfície.
 *
 *  - formato 'vertical': cilindro em pé (elipses no topo e na base);
 *    'horizontal': cilindro deitado (vista lateral, pontas arredondadas, pés).
 *  - fracao: nível 0–1 (estoque/capacidade, já limitado pelo chamador);
 *    null = nível desconhecido → preenchimento fantasma de 50% + "?".
 *  - cor: cor do material (vem de insumo_produtos).
 *
 *  A onda é um caminho SVG repetido (período 28px) deslocado em loop por CSS
 *  (@keyframes tanque-onda em index.css, translateX(-28px) = 1 período, sem
 *  emenda visível). prefers-reduced-motion pausa a animação lá no CSS.
 */
import { useId } from 'react'

interface TanqueSvgProps {
  formato: 'vertical' | 'horizontal'
  fracao: number | null
  cor: string
}

const PERIODO = 28
const AMPLITUDE = 3

/** Faixa ondulada: crista senoidal em y≈0 repetida até `largura`, fechada 30px abaixo. */
function ondaPath(largura: number): string {
  let d = 'M0 0'
  for (let x = 0; x < largura; x += PERIODO) {
    d += ` q${PERIODO / 4} ${-AMPLITUDE * 2} ${PERIODO / 2} 0 q${PERIODO / 4} ${AMPLITUDE * 2} ${PERIODO / 2} 0`
  }
  d += ' v30 H0 Z'
  return d
}

/** Líquido clipado no corpo do tanque: duas ondas defasadas + corpo cheio até a base. */
function Liquido({ clipId, esquerda, largura, superficieY, fundoY, cor, fantasma }: {
  clipId: string; esquerda: number; largura: number
  superficieY: number; fundoY: number; cor: string; fantasma: boolean
}) {
  // largura + 4 períodos: a onda de trás começa 2,5 períodos à esquerda e ainda
  // precisa cobrir a borda direita no fim do ciclo (translateX de −1 período)
  const caminho = ondaPath(largura + 4 * PERIODO)
  const alturaCorpo = Math.max(0, fundoY - (superficieY + 20))
  return (
    <g clipPath={`url(#${clipId})`} opacity={fantasma ? 0.35 : 1}>
      {/* onda de trás, mais clara e defasada meio período */}
      <g transform={`translate(${esquerda - 2.5 * PERIODO} ${superficieY})`}>
        <path className="tanque-onda tanque-onda-lenta" d={caminho} fill={cor} fillOpacity={0.45} />
      </g>
      {/* onda da frente */}
      <g transform={`translate(${esquerda - 2 * PERIODO} ${superficieY})`}>
        <path className="tanque-onda" d={caminho} fill={cor} fillOpacity={0.9} />
      </g>
      {/* corpo do líquido abaixo das ondas */}
      {alturaCorpo > 0 && (
        <rect x={esquerda - 4} y={superficieY + 20} width={largura + 8} height={alturaCorpo} fill={cor} fillOpacity={0.9} />
      )}
    </g>
  )
}

export default function TanqueSvg({ formato, fracao, cor }: TanqueSvgProps) {
  const desconhecido = fracao === null
  const f = desconhecido ? 0.5 : Math.max(0, Math.min(1, fracao))
  // id único por instância (vários tanques na mesma página); sem ':' do useId
  const clipId = 'tanque-clip-' + useId().replace(/[^a-zA-Z0-9-]/g, '')

  if (formato === 'horizontal') {
    // cilindro deitado: corpo x 15–205, y 25–105, pontas semicirculares (rx=40)
    const topo = 25, fundo = 105, esq = 15, larg = 190
    const superficieY = fundo - (fundo - topo) * f
    return (
      <svg viewBox="0 0 220 130" className="w-full h-40" role="img" aria-label="Tanque horizontal">
        <clipPath id={clipId}>
          <rect x={esq} y={topo} width={larg} height={fundo - topo} rx={40} ry={40} />
        </clipPath>
        {/* pés de apoio */}
        <rect x={48} y={fundo - 4} width={14} height={22} rx={2} fill="#cbd5e1" />
        <rect x={158} y={fundo - 4} width={14} height={22} rx={2} fill="#cbd5e1" />
        <rect x={esq} y={topo} width={larg} height={fundo - topo} rx={40} ry={40} fill="#f8fafc" />
        {(desconhecido || f > 0) && (
          <Liquido clipId={clipId} esquerda={esq} largura={larg}
                   superficieY={superficieY} fundoY={fundo} cor={cor} fantasma={desconhecido} />
        )}
        <rect x={esq} y={topo} width={larg} height={fundo - topo} rx={40} ry={40}
              fill="none" stroke="#94a3b8" strokeWidth={2.5} />
        {desconhecido && (
          <text x={110} y={73} textAnchor="middle" fontSize={30} fontWeight="bold" fill="#475569">?</text>
        )}
      </svg>
    )
  }

  // cilindro em pé: corpo x 25–115, laterais y 30–160, elipses ry=13
  const esq = 25, larg = 90, ry = 13, topo = 30, base = 160
  const yTopo = topo - ry            // topo da elipse superior (nível 100%)
  const yFundo = base + ry           // fundo da elipse inferior (nível 0%)
  const superficieY = yFundo - (yFundo - yTopo) * f
  return (
    <svg viewBox="0 0 140 190" className="w-full h-40" role="img" aria-label="Tanque vertical">
      <clipPath id={clipId}>
        <ellipse cx={70} cy={topo} rx={larg / 2} ry={ry} />
        <rect x={esq} y={topo} width={larg} height={base - topo} />
        <ellipse cx={70} cy={base} rx={larg / 2} ry={ry} />
      </clipPath>
      {/* corpo de fundo */}
      <ellipse cx={70} cy={base} rx={larg / 2} ry={ry} fill="#f8fafc" />
      <rect x={esq} y={topo} width={larg} height={base - topo} fill="#f8fafc" />
      <ellipse cx={70} cy={topo} rx={larg / 2} ry={ry} fill="#f8fafc" />
      {(desconhecido || f > 0) && (
        <Liquido clipId={clipId} esquerda={esq} largura={larg}
                 superficieY={superficieY} fundoY={yFundo} cor={cor} fantasma={desconhecido} />
      )}
      {/* contorno */}
      <path d={`M${esq} ${topo} v${base - topo}`} stroke="#94a3b8" strokeWidth={2.5} fill="none" />
      <path d={`M${esq + larg} ${topo} v${base - topo}`} stroke="#94a3b8" strokeWidth={2.5} fill="none" />
      <path d={`M${esq} ${base} a ${larg / 2} ${ry} 0 0 0 ${larg} 0`} stroke="#94a3b8" strokeWidth={2.5} fill="none" />
      {/* boca do tanque (elipse do topo) por cima do líquido */}
      <ellipse cx={70} cy={topo} rx={larg / 2} ry={ry} fill="#f1f5f9" fillOpacity={0.55}
               stroke="#94a3b8" strokeWidth={2.5} />
      {desconhecido && (
        <text x={70} y={105} textAnchor="middle" fontSize={30} fontWeight="bold" fill="#475569">?</text>
      )}
    </svg>
  )
}
