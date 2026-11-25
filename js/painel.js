// Peças visuais no estilo painel de instrumentos: mostrador redondo e barra vertical de segmentos.
let seq = 0;

// arco de 240°, marcas, números, zona vermelha opcional e ponteiro vermelho com brilho
export function mostrador({ min = 0, max = 100, valor = 0, passo = 10, numeros = 20, vermelho = null, centro = '', unidade = '', apagado = false }) {
  const id = 'm' + (++seq);
  const R = 92, A0 = -210, A1 = 30;
  const ang = (v) => A0 + (A1 - A0) * (Math.min(max, Math.max(min, v)) - min) / (max - min);
  const p = (a, r) => [100 + r * Math.cos(a * Math.PI / 180), 100 + r * Math.sin(a * Math.PI / 180)].map((n) => n.toFixed(2));
  let s = `<svg viewBox="0 0 200 200" class="mostrador" role="img" aria-label="${centro} ${unidade}">`;
  s += `<defs><radialGradient id="${id}f" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#14181c"/><stop offset="1" stop-color="#050607"/></radialGradient><filter id="${id}b"><feGaussianBlur stdDeviation="2.2"/></filter></defs>`;
  s += `<circle cx="100" cy="100" r="98" fill="url(#${id}f)" stroke="#2b3036" stroke-width="1.5"/>`;
  if (vermelho != null && vermelho < max) {
    const a = ang(vermelho), [x0, y0] = p(a, R - 4), [x1, y1] = p(A1, R - 4);
    s += `<path d="M${x0},${y0} A${R - 4},${R - 4} 0 ${A1 - a > 180 ? 1 : 0} 1 ${x1},${y1}" stroke="#E1262D" stroke-width="5" fill="none"/>`;
  }
  for (let v = min; v <= max + 1e-9; v += passo) {
    const a = ang(v), grande = Math.abs((v - min) % numeros) < 1e-9 || Math.abs(numeros - ((v - min) % numeros)) < 1e-9;
    const [x0, y0] = p(a, R - (grande ? 14 : 8)), [x1, y1] = p(a, R - 1);
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${vermelho != null && v >= vermelho ? '#E1262D' : '#e9edf0'}" stroke-width="${grande ? 2.4 : 1.2}"/>`;
    if (grande) { const [tx, ty] = p(a, R - 27); s += `<text x="${tx}" y="${(+ty + 4.5).toFixed(2)}" text-anchor="middle" class="mn">${Math.round(v)}</text>`; }
  }
  if (!apagado) {
    const av = ang(valor), [ax, ay] = p(A0, R + 4), [bx, by] = p(av, R + 4);
    if (av > A0 + 0.5) s += `<path d="M${ax},${ay} A${R + 4},${R + 4} 0 ${av - A0 > 180 ? 1 : 0} 1 ${bx},${by}" stroke="#E1262D" stroke-width="2" fill="none" opacity=".9" filter="url(#${id}b)"/>`;
    const [nx, ny] = p(av, R - 6), [cx, cy] = p(av + 180, 14);
    s += `<g class="ponteiro" style="--a:${(av - A0).toFixed(1)}deg"><line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#E1262D" stroke-width="7" stroke-linecap="round" opacity=".35" filter="url(#${id}b)"/>`;
    s += `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#ff3b42" stroke-width="3.2" stroke-linecap="round"/></g>`;
  }
  s += `<circle cx="100" cy="100" r="9" fill="#0b0d0f" stroke="#2f353b"/>`;
  s += `<text x="100" y="158" text-anchor="middle" class="mc">${centro}</text><text x="100" y="174" text-anchor="middle" class="mu">${unidade}</text>`;
  return s + '</svg>';
}

// barra vertical de segmentos (combustível / consumo); acende de baixo pra cima
export function barra({ partes = 8, fracao = 0, topo = '', base = '', rotulo = '', alerta = -1 }) {
  const cheias = Math.round(Math.max(0, Math.min(1, fracao)) * partes);
  let s = `<div class="barra" role="img" aria-label="${rotulo}"><small>${topo}</small><div class="segs">`;
  for (let i = partes - 1; i >= 0; i--) s += `<i class="${i < cheias ? (cheias <= alerta ? 'on red' : 'on') : ''}"></i>`;
  return s + `</div><small>${base}</small><b>${rotulo}</b></div>`;
}

// escala "redonda" pra um mostrador: máximo, passo das marcas e dos números
export function escala(valor, minimoMax) {
  const max = Math.max(minimoMax, Math.ceil((valor * 1.15) / 50) * 50);
  const numeros = max <= 120 ? 20 : max <= 300 ? 50 : 100;
  return { max, numeros, passo: numeros / (numeros === 20 ? 4 : numeros === 50 ? 5 : 4) };
}
