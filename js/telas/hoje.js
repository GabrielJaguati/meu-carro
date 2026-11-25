import * as db from '../db.js';
import { registrarTela, irPara, aviso, html } from '../app.js';
import { montarGiro, PARTES } from '../carroGiro.js';
import { abrirAbastecimento, abrirGasto } from '../formularios.js';
import { carregar, dataLonga, precoEm, ultimaLeitura } from '../dados.js';
import { mostrador, barra, escala } from '../painel.js';
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

const DSEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function relogio() {
  const st = el?.querySelector('#st-hora'); if (!st) return;
  const d = new Date(); const h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  st.textContent = h;
}

async function montar(raiz) {
  el = raiz;
  const hoje = hojeLocal();
  el.classList.add('hoje-painel');
  el.append(html(`<div class="status"><span id="st-hora"></span><span>${DSEM[new Date(hoje + 'T12:00:00Z').getUTCDay()]}, ${hoje.slice(8, 10)}/${hoje.slice(5, 7)}</span><span id="st-sync"></span></div>`));
  el.append(html(`<div class="ambiente"></div>`));
  el.append(html(`<div class="painel">
      <div class="cluster">
        <div id="b-cons"></div><div class="m" id="m-hoje"></div>
        <div class="mini-tela" id="mini"></div>
        <div class="m" id="m-aut"></div><div id="b-tanque"></div>
      </div>
      <div class="trip" id="trip"></div>
    </div>`));
  el.append(html(`<div class="display" id="display">
      <span class="canto">MEU CARRO</span><span class="canto2">toque numa parte</span>
      <div id="giro"></div>
      <div class="chip" id="chip"><div><small id="chip-parte"></small><b id="chip-acao"></b></div><button id="chip-abrir">Abrir</button></div>
      <p class="dica">arraste pra girar</p>
    </div>`));
  el.append(html(`<div class="linha-info" id="numeros"></div>`));
  el.append(html(`<form class="visor-km" id="form-km" novalidate>
      <div class="km"><label class="visor"><small>Km do painel hoje</small><input class="entrada-km" id="km-hoje" inputmode="numeric" autocomplete="off"></label><button class="botao">Salvar km</button></div>
      <label class="aut"><span>Autonomia no painel <i>(opcional)</i></span><input class="entrada" id="aut-hoje" inputmode="numeric" autocomplete="off" placeholder="ex.: 240"><b>km</b></label>
      <div class="km-info"><span id="km-ultima"></span><span class="erro" id="km-erro"></span></div>
    </form>`));
  relogio(); clearInterval(montar._t); montar._t = setInterval(relogio, 15000);

  let parte = null;
  const chip = el.querySelector('#chip');
  montarGiro(el.querySelector('#giro'), {
    aoTocar(p) {
      parte = p; if (!p) return chip.classList.remove('on');
      el.querySelector('#chip-parte').textContent = PARTES[p].nome; el.querySelector('#chip-acao').textContent = PARTES[p].acao; chip.classList.add('on');
    },
  });
  el.querySelector('#chip-abrir').addEventListener('click', () => parte && ACOES[parte]());
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
  const { leituras, abast, gastos, config } = await carregar();
  const hoje = hojeLocal(), ontem = somarDias(hoje, -1);
  const doDia = leituras.find((l) => l.data === hoje);
  const ult = ultimaLeitura(leituras.filter((l) => l.data < hoje));
  const input = el.querySelector('#km-hoje');
  if (document.activeElement !== input) input.value = doDia ? formatarNumero(doDia.km) : '';
  input.placeholder = ult ? formatarNumero(ult.km) : '80.000';
  const inAut = el.querySelector('#aut-hoje');
  if (document.activeElement !== inAut) inAut.value = doDia?.autonomia ?? '';
  el.querySelector('#km-ultima').textContent = doDia ? 'anotado hoje ✓' : ult ? `último: ${formatarKm(ult.km)} (${ult.data === ontem ? 'ontem' : ult.data.slice(8, 10) + '/' + ult.data.slice(5, 7)})` : 'primeira anotação';
  const p = db.pendentes(); el.querySelector('#st-sync').textContent = p ? `⏳ ${p} pra enviar` : '';

  const cons = consumoMedio(abast, { dataRef: hoje });
  const kmL = cons?.kmL ?? null;
  const cap = Number(config.tanque_litros);
  const aut = autonomia({ leituras, abast, kmL, capacidade: cap });
  const baixo = aut && aut.km <= Number(config.alerta_km);
  const dia = doDia ? hoje : ontem;
  const kmDia = kmPorDia(leituras, dia, dia)[0].km;

  // relógio da esquerda: km rodados (hoje, ou ontem enquanto não anotou)
  const eh = escala(kmDia, 100);
  el.querySelector('#m-hoje').innerHTML = mostrador({ ...eh, valor: kmDia, vermelho: eh.max * 0.8, centro: formatarNumero(kmDia), unidade: doDia ? 'km hoje' : 'km ontem' });
  // relógio da direita: autonomia
  const ea = escala(aut?.km ?? 0, 600);
  el.querySelector('#m-aut').innerHTML = mostrador({ ...ea, valor: aut?.km ?? 0, apagado: !aut, centro: aut ? formatarNumero(aut.km) : '—', unidade: aut ? 'autonomia km' : 'anote a autonomia' });
  // telinha do meio: consumo
  el.querySelector('#mini').innerHTML = `<small>Consumo</small><b>${kmL ? formatarNumero(kmL, 1) : '—'}</b><i>km/l</i><span class="sel">${kmL ? (cons.estimativa ? 'estimativa' : 'média') : 'calculando'}</span>`;
  // barras laterais
  el.querySelector('#b-cons').innerHTML = barra({ fracao: kmL ? (kmL - 6) / 10 : 0, topo: '16', base: '6', rotulo: 'km/l' });
  el.querySelector('#b-tanque').innerHTML = barra({ fracao: aut ? aut.litros / cap : 0, topo: '1', base: '0', rotulo: '⛽', alerta: 2 });
  el.querySelector('#trip').innerHTML = `<span>${doDia ? 'hoje' : 'ontem'} <b>${formatarNumero(kmDia)} km</b></span>`
    + (baixo ? `<span class="alerta">⛽ hora de abastecer</span>` : `<span>tanque <b>${aut ? formatarNumero(aut.litros, 1) + ' L' : '—'}</b></span>`)
    + `<span>total <b>${ult || doDia ? formatarNumero((doDia ?? ult).km) + ' km' : '—'}</b></span>`;
  el.querySelector('.painel').classList.toggle('baixo', !!baixo);

  const sem = periodo(hoje, 'semana'), mes = periodo(hoje, 'mes');
  const kmSem = kmRodados(leituras, sem.inicio, hoje);
  const abSem = abast.filter((a) => a.data >= sem.inicio && a.data <= hoje).reduce((s, a) => s + Number(a.valor), 0);
  const gMes = [...abast, ...gastos].filter((x) => x.data >= mes.inicio && x.data <= hoje).reduce((s, x) => s + Number(x.valor), 0);
  el.querySelector('#numeros').innerHTML = `<div><small>Semana</small><b>${formatarNumero(kmSem)} km</b></div><div><small>Abastecido</small><b>${formatarMoeda(abSem).replace(',00', '')}</b></div><div><small>Mês</small><b>${formatarMoeda(gMes).replace(',00', '')}</b></div>`;
}

registrarTela('hoje', { montar, atualizar });
