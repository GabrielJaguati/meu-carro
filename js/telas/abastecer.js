import { registrarTela, html } from '../app.js';
import { abrirAbastecimento } from '../formularios.js';
import { carregar, COMB_CURTO, dataCurta } from '../dados.js';
import { hojeLocal, consumoMedio, intervalosConsumo, compararCombustivel, formatarMoeda, formatarNumero, formatarKm } from '../calc.js';

let el = null;

async function montar(raiz) {
  el = raiz;
  el.append(html(`<div class="cabeca"><h1>Abastecer</h1><span id="ab-total"></span></div>`));
  el.append(html(`<div class="grade" id="ab-cons" style="margin-top:0"></div>`));
  el.append(html(`<button class="botao largo" id="ab-novo" style="margin-top:12px">Novo abastecimento</button>`));
  el.append(html(`<div class="secao"><h2>Histórico</h2><span class="rotulo">km até o próximo</span></div>`));
  el.append(html(`<div class="lista" id="ab-lista"></div>`));
  el.querySelector('#ab-novo').addEventListener('click', () => abrirAbastecimento());
  await atualizar();
}

async function atualizar() {
  if (!el?.isConnected) return;
  const { abast } = await carregar();
  const hoje = hojeLocal();
  const ord = [...abast].sort((a, b) => b.data.localeCompare(a.data) || b.km - a.km);
  const mes = hoje.slice(0, 7);
  const doMes = abast.filter((a) => a.data.startsWith(mes));
  el.querySelector('#ab-total').textContent = `${formatarMoeda(doMes.reduce((s, a) => s + Number(a.valor), 0))} no mês`;

  const geral = consumoMedio(abast, { dataRef: hoje });
  const g = consumoMedio(abast, { dataRef: hoje, combustivel: 'gasolina_comum' }) ?? consumoMedio(abast, { dataRef: hoje, combustivel: 'gasolina_aditivada' });
  const al = consumoMedio(abast, { dataRef: hoje, combustivel: 'alcool' });
  const ult = ord[0];
  let dica = 'Abasteça mais vezes pra comparar';
  if (g && al) {
    const r = compararCombustivel(1, 1, al.kmL, g.kmL);
    dica = `Álcool compensa até ${formatarNumero(r.limite * 100)}% da gasolina`;
  }
  el.querySelector('#ab-cons').innerHTML = `
    <div class="cartao"><span class="rotulo">Consumo médio</span><b>${geral ? formatarNumero(geral.kmL, 1) + ' km/l' : '—'}</b><i>${geral ? (geral.metodo === 'cheio' ? 'tanque cheio a tanque cheio' : geral.estimativa ? 'estimativa, melhora com o tempo' : 'média dos últimos 60 dias') : 'precisa de 2 abastecimentos'}</i></div>
    <div class="cartao"><span class="rotulo">Último preço</span><b>${ult ? formatarMoeda(Number(ult.preco_litro)) : '—'}</b><i>${ult ? COMB_CURTO[ult.combustivel] + ' · ' + dica : dica}</i></div>`;

  const ints = intervalosConsumo(abast); const kmDe = new Map(ints.map((x) => [x.de + x.combustivel + x.litros, x.km]));
  const lista = el.querySelector('#ab-lista');
  lista.replaceChildren();
  if (!ord.length) { lista.append(html('<p class="vazio">Nenhum abastecimento ainda.<br>Toque em “Novo abastecimento” depois de passar no posto.</p>')); return; }
  for (const a of ord) {
    const km = kmDe.get(a.data + a.combustivel + Number(a.litros));
    const b = html(`<button class="item">
      <span class="ico">${a.combustivel === 'alcool' ? '🌱' : '⛽'}</span>
      <span class="meio"><b>${formatarMoeda(Number(a.valor))} · ${COMB_CURTO[a.combustivel]}</b><small>${dataCurta(a.data)} · ${formatarNumero(Number(a.litros), 1)} L a ${formatarMoeda(Number(a.preco_litro))}${a.tanque_cheio ? ' · <span class="selo">cheio</span>' : ''}</small></span>
      <span class="dir"><b>${km ? formatarNumero(km) + ' km' : '—'}</b><small>${km ? 'rodados' : 'em uso'}</small></span>
    </button>`);
    b.addEventListener('click', () => abrirAbastecimento(a));
    lista.append(b);
  }
}

registrarTela('abastecer', { montar, atualizar });
