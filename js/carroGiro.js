// Giro do carro com 72 quadros renderizados do modelo 3D (gerado das fotos do Gabriel).
// Arrastar rola quadro a quadro; ao soltar, encaixa no ângulo-chave mais próximo (a cada 9 quadros),
// onde ficam as partes tocáveis. montarGiro(el, {aoTocar}) → {acender, pausar, irPara}

export const PARTES = {
  tanque: { nome: 'Tampa do tanque', acao: 'Abastecer' },
  rodas: { nome: 'Rodas e pneus', acao: 'Troca de pneu ou roda' },
  capo: { nome: 'Capô', acao: 'Revisão' },
  parabrisa: { nome: 'Para-brisa', acao: 'Anotar o km' },
  teto: { nome: 'Teto e vidros', acao: 'Lavagem' },
  portamalas: { nome: 'Porta-malas', acao: 'Resumo' },
};

const N = 72, PASSO = 9;
const P = (parte, pontos) => ({ parte, pontos });
const E = (parte, cx, cy, rx, ry) => ({ parte, elipse: [cx, cy, rx, ry] });

// zonas no espaço 900×560, só nos quadros-chave
export const ZONAS = {
  0: [P('parabrisa', [[370, 260], [520, 258], [600, 318], [365, 320]]), P('capo', [[355, 322], [605, 320], [640, 365], [315, 368]]),
      E('rodas', 330, 460, 20, 40), E('rodas', 620, 460, 22, 40)],
  9: [P('teto', [[210, 256], [420, 254], [420, 274], [215, 278]]), P('parabrisa', [[420, 256], [520, 258], [610, 312], [470, 316]]),
      P('capo', [[500, 316], [620, 318], [740, 340], [745, 372], [560, 372]]), E('rodas', 218, 425, 28, 50), E('rodas', 498, 437, 30, 58)],
  18: [P('portamalas', [[100, 295], [215, 290], [230, 315], [105, 320]]), P('teto', [[230, 256], [550, 255], [550, 274], [235, 276]]),
       P('parabrisa', [[550, 268], [600, 268], [680, 315], [610, 318]]), P('capo', [[650, 318], [760, 330], [805, 350], [690, 352]]),
       E('rodas', 210, 440, 50, 52), E('rodas', 648, 440, 50, 52)],
  27: [P('teto', [[210, 280], [300, 262], [450, 260], [440, 300], [215, 302]]), P('portamalas', [[165, 305], [370, 305], [370, 335], [165, 338]]),
       E('rodas', 445, 445, 45, 55), E('rodas', 705, 425, 35, 45)],
  36: [P('teto', [[310, 260], [550, 260], [550, 300], [310, 300]]), P('portamalas', [[300, 310], [585, 310], [590, 355], [295, 355]])],
  45: [P('teto', [[450, 268], [620, 262], [700, 310], [520, 315]]), P('portamalas', [[500, 318], [700, 308], [725, 340], [520, 352]]),
       E('rodas', 198, 397, 22, 48), E('rodas', 452, 447, 38, 52)],
  54: [P('capo', [[110, 345], [200, 315], [260, 318], [130, 360]]), P('parabrisa', [[220, 318], [330, 270], [370, 272], [275, 322]]),
       P('teto', [[380, 256], [720, 258], [720, 280], [380, 280]]), P('portamalas', [[650, 300], [780, 302], [785, 330], [655, 330]]),
       E('tanque', 640, 352, 18, 14), E('rodas', 203, 440, 48, 50), E('rodas', 630, 440, 48, 50)],
  63: [P('capo', [[170, 350], [260, 300], [390, 305], [330, 345], [200, 370]]), P('parabrisa', [[300, 300], [380, 262], [460, 262], [420, 305]]),
       P('teto', [[470, 260], [690, 262], [690, 285], [470, 285]]), E('rodas', 362, 437, 42, 58), E('rodas', 665, 418, 26, 45)],
};

const NS = 'http://www.w3.org/2000/svg';
const mod = (i) => ((Math.round(i) % N) + N) % N;
const centro = (z) => z.elipse ? z.elipse.slice(0, 2)
  : [0, 1].map((k) => z.pontos.reduce((s, p) => s + p[k], 0) / z.pontos.length);

export function montarGiro(el, { aoTocar, base = 'img/giro/', ms = 75 } = {}) {
  el.classList.add('giro');
  const quadros = Array.from({ length: N }, (_, i) => { const im = new Image(); im.src = `${base}${String(i).padStart(2, '0')}.webp`; return im; });
  const img = document.createElement('img'); img.className = 'giro-img'; img.alt = 'Teu carro'; img.draggable = false; img.src = quadros[0].src;
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 900 560'); svg.setAttribute('class', 'giro-zonas');
  el.append(img, svg);

  let pos = 0, auto = true, anim = null, retomar = null, acesa = null;
  const mostrar = (p) => { pos = p; img.src = quadros[mod(p)].src; };

  function desenharZonas(k) {
    svg.replaceChildren();
    for (const z of ZONAS[k] ?? []) {
      let s;
      if (z.elipse) { s = document.createElementNS(NS, 'ellipse'); ['cx', 'cy', 'rx', 'ry'].forEach((a, j) => s.setAttribute(a, z.elipse[j])); }
      else { s = document.createElementNS(NS, 'polygon'); s.setAttribute('points', z.pontos.map((p) => p.join(',')).join(' ')); }
      s.setAttribute('class', 'giro-zona' + (z.parte === acesa ? ' acesa' : '')); s.dataset.parte = z.parte; svg.appendChild(s);
      const [x, y] = centro(z); const c = document.createElementNS(NS, 'circle');
      Object.entries({ cx: x, cy: y, r: 7, class: 'giro-ponto' }).forEach(([a, v]) => c.setAttribute(a, v)); c.dataset.parte = z.parte; svg.appendChild(c);
    }
  }

  function parado() { const k = mod(pos); el.classList.toggle('no-ponto', k % PASSO === 0); if (k % PASSO === 0) desenharZonas(k); }

  function animarAte(alvo, dur = 350) {
    cancelAnimationFrame(anim); const de = pos, t0 = performance.now();
    return new Promise((ok) => {
      const passo = (t) => { const u = Math.min(1, (t - t0) / dur), e = 1 - (1 - u) ** 3; mostrar(de + (alvo - de) * e); if (u < 1) anim = requestAnimationFrame(passo); else { mostrar(alvo); parado(); ok(); } };
      anim = requestAnimationFrame(passo);
    });
  }
  const encaixar = () => animarAte(Math.round(pos / PASSO) * PASSO);

  let ultimo = performance.now();
  (function girar(t) {
    if (auto && t - ultimo >= ms) { ultimo = t; mostrar(pos + 1); el.classList.remove('no-ponto'); }
    requestAnimationFrame(girar);
  })(ultimo);

  function pausar(p) { auto = !p; clearTimeout(retomar); }
  function soltarDepois() { clearTimeout(retomar); retomar = setTimeout(() => { acender(null); auto = true; }, 7000); }

  function acender(parte) { acesa = parte; svg.querySelectorAll('.giro-zona').forEach((z) => z.classList.toggle('acesa', z.dataset.parte === parte)); }

  let x0 = null, p0 = 0, moveu = false, vel = 0, tAnt = 0, xAnt = 0;
  el.addEventListener('pointerdown', (e) => { x0 = xAnt = e.clientX; tAnt = performance.now(); p0 = pos; moveu = false; vel = 0; pausar(true); cancelAnimationFrame(anim); el.setPointerCapture?.(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0; if (Math.abs(dx) > 6) moveu = true;
    if (!moveu) return;
    el.classList.remove('no-ponto'); acender(null);
    const t = performance.now(); vel = (e.clientX - xAnt) / Math.max(1, t - tAnt); xAnt = e.clientX; tAnt = t;
    mostrar(p0 - dx / 5);
  });
  el.addEventListener('pointerup', async (e) => {
    if (x0 === null) return; x0 = null;
    if (moveu) { await animarAte(Math.round((pos - vel * 60) / PASSO) * PASSO, 450); soltarDepois(); return; }
    if (mod(pos) % PASSO !== 0) { await encaixar(); soltarDepois(); return; } // 1º toque: para no ângulo
    const alvo = document.elementFromPoint(e.clientX, e.clientY); const parte = alvo?.dataset?.parte ?? null;
    acender(parte); aoTocar?.(parte); soltarDepois();
  });

  return { acender, pausar, irPara: (k) => animarAte(k, 600), get quadro() { return mod(pos); } };
}
