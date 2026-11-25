import * as db from '../db.js';
import { registrarTela, irPara, aviso, html } from '../app.js';
import { montarGiro, PARTES } from '../carroGiro.js';
import { abrirAbastecimento, abrirGasto } from '../formularios.js';
import { carregar, dataLonga, precoEm, ultimaLeitura } from '../dados.js';
import { hojeLocal, somarDias, parseNumeroBR, validarLeitura, kmPorDia, kmRodados, consumoMedio, gastoEstimadoDia, periodo, formatarKm, formatarMoeda, formatarNumero, autonomia } from '../calc.js';

const ACOES = {
  tanque: () => abrirAbastecimento(),
  rodas: () => abrirGasto({ categoria: 'Troca de pneu' }),
  capo: () => abrirGasto({ categoria: 'Revisão' }),
  teto: () => abrirGasto({ categoria: 'Lavagem' }),
  portamalas: () => irPara('resumo'),
  parabrisa: () => { const i = document.getElementById('km-hoje'); i.focus(); i.scrollIntoView({ block: 'center', behavior: 'smooth' }); },
};

let el = null;

async function montar(raiz) {
  el = raiz;
  const hoje = hojeLocal();
  el.append(html(`<div class="garagem">
      <div class="cabeca"><h1>Meu Carro</h1><span>${dataLonga(hoje)}</span></div>
      <div id="giro"></div>
      <div class="chip" id="chip"><div><small id="chip-parte"></small><b id="chip-acao"></b></div><button id="chip-abrir">Abrir</button></div>
      <p class="dica">Arraste pra girar · toque numa parte</p>
    </div>`));
  el.append(html(`<form class="cartao" id="form-km" novalidate>
      <label class="rotulo" for="km-hoje">Km do painel hoje</label>
      <div class="km"><input class="entrada grande" id="km-hoje" inputmode="numeric" autocomplete="off"><button class="botao">Salvar km</button></div>
      <label class="aut"><span>Autonomia no painel <i>(opcional)</i></span><input class="entrada" id="aut-hoje" inputmode="numeric" autocomplete="off" placeholder="ex.: 240"><b>km</b></label>
      <div class="km-info"><span id="km-ultima"></span><span class="erro" id="km-erro"></span></div>
    </form>`));
  el.append(html(`<div class="cartao tanque" id="tanque"></div>`));
  el.append(html(`<div class="tres" id="numeros"></div>`));
  el.append(html(`<div class="acoes"><button class="botao sec" id="b-abast">⛽ Abastecer</button><button class="botao sec" id="b-gasto">🔧 Novo gasto</button></div>`));

  let parte = null;
  const chip = el.querySelector('#chip');
  montarGiro(el.querySelector('#giro'), {
    aoTocar(p) {
      parte = p; if (!p) return chip.classList.remove('on');
      el.querySelector('#chip-parte').textContent = PARTES[p].nome; el.querySelector('#chip-acao').textContent = PARTES[p].acao; chip.classList.add('on');
    },
  });
  el.querySelector('#chip-abrir').addEventListener('click', () => parte && ACOES[parte]());
  el.querySelector('#b-abast').addEventListener('click', () => abrirAbastecimento());
  el.querySelector('#b-gasto').addEventListener('click', () => abrirGasto());
  el.querySelector('#form-km').addEventListener('submit', salvarKm);
  await atualizar();
}

async function salvarKm(e) {
  e.preventDefault();
  const erro = el.querySelector('#km-erro'); erro.textContent = '';
  const km = parseNumeroBR(el.querySelector('#km-hoje').value);
  const autTxt = el.querySelector('#aut-hoje').value.trim();
  const aut = autTxt ? parseNumeroBR(autTxt) : null;
  if (autTxt && !(aut >= 0 && aut < 1500)) { erro.textContent = 'A autonomia tem que ser os km que o painel mostra, tipo 240.'; return; }
  const { leituras } = await carregar(); const data = hojeLocal();
  const v = validarLeitura(leituras.filter((l) => l.data !== data), { data, km });
  if (!v.ok) { erro.textContent = v.erro; return; }
  await db.salvar('carro_leituras', { data, km, autonomia: aut === null ? null : Math.round(aut) });
  aviso(db.pendentes() ? 'Km salvo (envia quando tiver internet)' : 'Km salvo');
}

async function atualizar() {
  if (!el?.isConnected) return;
  const { leituras, abast, config } = await carregar();
  const hoje = hojeLocal(), ontem = somarDias(hoje, -1);
  const doDia = leituras.find((l) => l.data === hoje);
  const ult = ultimaLeitura(leituras.filter((l) => l.data < hoje));
  const input = el.querySelector('#km-hoje');
  if (document.activeElement !== input) input.value = doDia ? formatarNumero(doDia.km) : '';
  const inAut = el.querySelector('#aut-hoje');
  if (document.activeElement !== inAut) inAut.value = doDia?.autonomia ?? '';
  input.placeholder = ult ? formatarNumero(ult.km) : '80.000';
  el.querySelector('#km-ultima').textContent = doDia ? `anotado hoje ✓` : ult ? `último: ${formatarKm(ult.km)} (${ult.data === ontem ? 'ontem' : ult.data.slice(8, 10) + '/' + ult.data.slice(5, 7)})` : 'primeira anotação';

  const cons = consumoMedio(abast, { dataRef: hoje });
  const kmL = cons?.kmL ?? null;
  desenharTanque(autonomia({ leituras, abast, kmL, capacidade: Number(config.tanque_litros) }), config);
  const dia = doDia ? hoje : ontem;
  const kmDia = kmPorDia(leituras, dia, dia)[0].km;
  const sem = periodo(hoje, 'semana'); const kmSem = kmRodados(leituras, sem.inicio, hoje);
  const gastoSem = abast.filter((a) => a.data >= sem.inicio && a.data <= hoje).reduce((s, a) => s + Number(a.valor), 0);
  el.querySelector('#numeros').innerHTML = `
    <div><span class="rotulo">${doDia ? 'Hoje' : 'Ontem'}</span><b>${formatarNumero(kmDia)} km</b><i>≈ ${formatarMoeda(gastoEstimadoDia(kmDia, kmL, precoEm(abast, dia)))}</i></div>
    <div><span class="rotulo">Semana</span><b>${formatarNumero(kmSem)} km</b><i>${gastoSem ? formatarMoeda(gastoSem) + ' abastecido' : 'sem abastecer'}</i></div>
    <div><span class="rotulo">Consumo</span><b>${kmL ? formatarNumero(kmL, 1) : '—'}</b><i>${kmL ? 'km/l' + (cons.estimativa ? ', estimativa' : '') : 'calculando…'}</i></div>`;
}

function desenharTanque(a, config) {
  const t = el.querySelector('#tanque');
  if (!a) {
    t.className = 'cartao tanque';
    t.innerHTML = `<span class="rotulo">Tanque</span><p class="vazio-mini">Anota a <b>autonomia do painel</b> junto com o km (ou marca “Completei o tanque” no próximo abastecimento) que eu passo a mostrar quanto ainda dá pra rodar.</p>`;
    return;
  }
  const cap = Number(config.tanque_litros), pct = Math.round(a.litros / cap * 100);
  const baixo = a.km <= Number(config.alerta_km);
  t.className = 'cartao tanque' + (baixo ? ' baixo' : '');
  t.innerHTML = `<div class="tq-topo"><span class="rotulo">${baixo ? '⛽ Hora de abastecer' : 'Tanque'}</span><span class="rotulo">${a.base === 'painel' ? 'pelo painel' : 'desde o tanque cheio'}${a.estimativa ? ' · estimativa' : ''}</span></div>
    <div class="tq-linha"><b class="num">≈ ${formatarNumero(a.km)} km</b><span>${formatarNumero(a.litros, 1)} L de ${formatarNumero(cap)} L</span></div>
    <div class="tq-barra"><i style="width:${Math.max(3, pct)}%"></i>${[25, 50, 75].map((m) => `<s style="left:${m}%"></s>`).join('')}</div>`;
}

registrarTela('hoje', { montar, atualizar });
