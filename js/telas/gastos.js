import { registrarTela, html, esc } from '../app.js';
import { abrirGasto } from '../formularios.js';
import { carregar, dataCurta, mesAno } from '../dados.js';
import { hojeLocal, periodo, somarDias, formatarMoeda } from '../calc.js';

let el = null, mesRef = null, filtro = null;

async function montar(raiz) {
  el = raiz; mesRef = hojeLocal(); filtro = null;
  el.append(html(`<div class="cabeca"><h1>Gastos</h1><span>fora o combustível</span></div>`));
  el.append(html(`<div class="periodo"><button id="g-ant" aria-label="Mês anterior">‹</button><strong id="g-mes"></strong><button id="g-prox" aria-label="Próximo mês">›</button></div>`));
  el.append(html(`<div class="cartao" id="g-total"></div>`));
  el.append(html(`<button class="botao largo" id="g-novo" style="margin-top:12px">Novo gasto</button>`));
  el.append(html(`<div class="chips rolar" id="g-filtro" style="margin-top:16px"></div>`));
  el.append(html(`<div class="lista" id="g-lista" style="margin-top:12px"></div>`));
  el.querySelector('#g-ant').addEventListener('click', () => { mesRef = somarDias(periodo(mesRef, 'mes').inicio, -1); atualizar(); });
  el.querySelector('#g-prox').addEventListener('click', () => { const p = somarDias(periodo(mesRef, 'mes').fim, 1); if (p <= hojeLocal()) { mesRef = p; atualizar(); } });
  el.querySelector('#g-novo').addEventListener('click', () => abrirGasto());
  el.querySelector('#g-filtro').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; filtro = filtro === b.dataset.id ? null : b.dataset.id; atualizar(); });
  await atualizar();
}

async function atualizar() {
  if (!el?.isConnected) return;
  const { gastos, cats, abast } = await carregar();
  const { inicio, fim } = periodo(mesRef, 'mes');
  el.querySelector('#g-mes').textContent = mesAno(mesRef);
  const doMes = gastos.filter((g) => g.data >= inicio && g.data <= fim);
  const comb = abast.filter((a) => a.data >= inicio && a.data <= fim).reduce((s, a) => s + Number(a.valor), 0);
  const total = doMes.reduce((s, g) => s + Number(g.valor), 0);
  const porCat = new Map(); doMes.forEach((g) => porCat.set(g.categoria_id, (porCat.get(g.categoria_id) ?? 0) + Number(g.valor)));
  const top = [...porCat].sort((a, b) => b[1] - a[1])[0];
  const nomeCat = (id) => cats.find((c) => c.id === id);
  el.querySelector('#g-total').innerHTML = `<span class="rotulo">Total do mês</span>
    <div style="display:flex;justify-content:space-between;align-items:baseline"><b class="num" style="font-size:38px">${formatarMoeda(total)}</b><span class="rotulo">+ ${formatarMoeda(comb)} de combustível</span></div>
    <span class="rotulo">${top ? `Maior gasto: ${esc(nomeCat(top[0])?.nome ?? '—')} (${formatarMoeda(top[1])})` : 'Nenhum gasto nesse mês'}</span>`;

  el.querySelector('#g-filtro').innerHTML = cats.filter((c) => c.ativa).map((c) =>
    `<button data-id="${c.id}" class="${c.id === filtro ? 'on' : ''}">${esc(c.icone ?? '')} ${esc(c.nome)}${porCat.get(c.id) ? ' · ' + formatarMoeda(porCat.get(c.id)) : ''}</button>`).join('');

  const lista = el.querySelector('#g-lista'); lista.replaceChildren();
  const itens = doMes.filter((g) => !filtro || g.categoria_id === filtro).sort((a, b) => b.data.localeCompare(a.data));
  if (!itens.length) { lista.append(html(`<p class="vazio">${filtro ? 'Nada nessa categoria nesse mês.' : 'Nenhum gasto nesse mês.<br>Revisão, pneu, lavagem… registra aqui.'}</p>`)); return; }
  for (const g of itens) {
    const c = nomeCat(g.categoria_id);
    const b = html(`<button class="item"><span class="ico">${esc(c?.icone ?? '📦')}</span>
      <span class="meio"><b>${esc(g.descricao || c?.nome || 'Gasto')}</b><small>${dataCurta(g.data)} · ${esc(c?.nome ?? '')}</small></span>
      <span class="dir"><b>${formatarMoeda(Number(g.valor))}</b></span></button>`);
    b.addEventListener('click', () => abrirGasto({ existente: g }));
    lista.append(b);
  }
}

registrarTela('gastos', { montar, atualizar });
