import { registrarTela, html, esc } from '../app.js';
import { carregar, dataLongaCap, mesAno, dataCurta, precoEm } from '../dados.js';
import { hojeLocal, periodo, somarDias, kmPorDia, consumoMedio, gastoEstimadoDia, custoPorKm, formatarMoeda, formatarNumero } from '../calc.js';

let el = null, tipo = 'semana', ref = null;
const DS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

async function montar(raiz) {
  el = raiz; ref = hojeLocal();
  el.append(html(`<div class="cabeca"><h1>Resumo</h1><span>quanto o carro custa</span></div>`));
  el.append(html(`<div class="seg" id="r-tipo"><button data-t="dia">Dia</button><button data-t="semana">Semana</button><button data-t="mes">Mês</button></div>`));
  el.append(html(`<div class="periodo"><button id="r-ant" aria-label="Anterior">‹</button><strong id="r-per"></strong><button id="r-prox" aria-label="Próximo">›</button></div>`));
  el.append(html(`<div class="cartao" id="r-destaque"></div>`));
  el.append(html(`<div class="grade" id="r-grade"></div>`));
  el.append(html(`<div class="cartao" id="r-km" style="margin-top:12px"></div>`));
  el.append(html(`<div class="cartao" id="r-cats"></div>`));
  el.querySelector('#r-tipo').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { tipo = b.dataset.t; atualizar(); } });
  const mover = (d) => {
    const p = periodo(ref, tipo);
    const novo = d < 0 ? somarDias(p.inicio, -1) : somarDias(p.fim, 1);
    if (novo <= hojeLocal()) { ref = d < 0 ? periodo(novo, tipo).fim : novo; atualizar(); }
  };
  el.querySelector('#r-ant').addEventListener('click', () => mover(-1));
  el.querySelector('#r-prox').addEventListener('click', () => mover(1));
  await atualizar();
}

async function atualizar() {
  if (!el?.isConnected) return;
  const { leituras, abast, gastos, cats } = await carregar();
  const hoje = hojeLocal();
  const { inicio, fim: fimP } = periodo(ref, tipo);
  const fim = fimP > hoje ? hoje : fimP;
  el.querySelectorAll('#r-tipo button').forEach((b) => b.classList.toggle('on', b.dataset.t === tipo));
  el.querySelector('#r-per').textContent = tipo === 'dia' ? dataLongaCap(inicio) : tipo === 'mes' ? mesAno(inicio) : `${dataCurta(inicio)} a ${dataCurta(fimP)}`;

  const dias = kmPorDia(leituras, inicio, fim);
  const km = dias.reduce((s, d) => s + d.km, 0);
  const cons = consumoMedio(abast, { dataRef: fim });
  const kmL = cons?.kmL ?? null;
  const est = dias.reduce((s, d) => s + (gastoEstimadoDia(d.km, kmL, precoEm(abast, d.data)) ?? 0), 0);
  const real = abast.filter((a) => a.data >= inicio && a.data <= fim).reduce((s, a) => s + Number(a.valor), 0);
  const doPer = gastos.filter((g) => g.data >= inicio && g.data <= fim);
  const outros = doPer.reduce((s, g) => s + Number(g.valor), 0);
  const total = real + outros;
  const ckm = kmL ? custoPorKm(est + outros, km) : null;

  el.querySelector('#r-destaque').innerHTML = `<span class="rotulo">Gasto com o carro no período</span>
    <div style="display:flex;justify-content:space-between;align-items:baseline"><b class="num" style="font-size:40px">${formatarMoeda(total)}</b><span class="rotulo">${ckm ? formatarMoeda(ckm) + ' por km rodado' : ''}</span></div>
    <span class="rotulo">abastecimentos ${formatarMoeda(real)} + outros gastos ${formatarMoeda(outros)}</span>`;
  el.querySelector('#r-grade').innerHTML = `
    <div class="cartao"><span class="rotulo">Km rodados</span><b>${formatarNumero(km)} km</b><i>${tipo === 'dia' ? 'no dia' : 'média ' + formatarNumero(km / dias.length, 0) + ' km/dia'}</i></div>
    <div class="cartao"><span class="rotulo">Consumo</span><b>${kmL ? formatarNumero(kmL, 1) + ' km/l' : '—'}</b><i>${kmL ? (cons.estimativa ? 'estimativa' : 'média do período') : 'calculando…'}</i></div>
    <div class="cartao"><span class="rotulo">Abastecido</span><b>${formatarMoeda(real)}</b><i>${kmL ? 'pelo km rodado ≈ ' + formatarMoeda(est) : 'consumo: após o 2º abastecimento'}</i></div>
    <div class="cartao"><span class="rotulo">Outros gastos</span><b>${formatarMoeda(outros)}</b><i>${doPer.length} ${doPer.length === 1 ? 'registro' : 'registros'}</i></div>`;

  // gráfico de km por dia (na visão Dia, mostra os 7 dias até ele)
  const ini = tipo === 'dia' ? somarDias(inicio, -6) : inicio;
  const barras = kmPorDia(leituras, ini, tipo === 'mes' ? fimP : tipo === 'semana' ? fimP : inicio);
  const max = Math.max(1, ...barras.map((b) => b.km));
  const mostrarRot = barras.length <= 7;
  el.querySelector('#r-km').innerHTML = `<span class="rotulo">Km por dia</span><div class="barras">${barras.map((b) => {
    const dow = new Date(b.data + 'T12:00:00Z').getUTCDay(); const futuro = b.data > hoje; const sel = tipo === 'dia' && b.data === inicio;
    return `<div title="${dataCurta(b.data)}: ${formatarNumero(b.km)} km"><em>${mostrarRot && b.km ? formatarNumero(b.km) : ''}</em><span class="b" style="height:${Math.max(2, b.km / max * 100)}%;${futuro ? 'visibility:hidden;' : ''}${sel ? 'outline:2px solid #fff' : ''}${!sel && tipo === 'dia' ? ';opacity:.5' : ''}"></span><small>${mostrarRot ? DS[dow] : (Number(b.data.slice(8)) % 5 === 0 || b.data.endsWith('-01') ? Number(b.data.slice(8)) : '')}</small></div>`;
  }).join('')}</div>`;

  const porCat = new Map(); doPer.forEach((g) => porCat.set(g.categoria_id, (porCat.get(g.categoria_id) ?? 0) + Number(g.valor)));
  const linhas = [['⛽ Combustível', real], ...[...porCat].map(([id, v]) => { const c = cats.find((x) => x.id === id); return [`${c?.icone ?? ''} ${c?.nome ?? 'Outros'}`, v]; })].filter((l) => l[1] > 0).sort((a, b) => b[1] - a[1]);
  const mx = Math.max(1, ...linhas.map((l) => l[1]));
  el.querySelector('#r-cats').innerHTML = `<span class="rotulo">Para onde foi o dinheiro</span>${linhas.length ? `<div class="horiz">${linhas.map(([n, v]) => `<div class="l"><span>${esc(n)}</span><span class="t"><i style="width:${v / mx * 100}%"></i></span><b>${formatarMoeda(v)}</b></div>`).join('')}</div>` : '<p class="vazio">Sem gastos nesse período.</p>'}`;
}

registrarTela('resumo', { montar, atualizar });
