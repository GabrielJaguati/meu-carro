import * as db from '../db.js';
import { registrarTela, html, esc, aviso } from '../app.js';
import { carregar, COMB_CURTO } from '../dados.js';
import { paraCSV } from '../csv.js';
import { VAPID_PUBLIC } from '../../config.js';
import { hojeLocal, parseNumeroBR, compararCombustivel, consumoMedio, formatarNumero } from '../calc.js';

let el = null;

async function montar(raiz) {
  el = raiz;
  el.append(html(`<div class="cabeca"><h1>Ajustes</h1><span id="aj-conta"></span></div>`));
  el.append(html(`<div class="cartao" id="aj-comp">
      <span class="rotulo">No posto: álcool ou gasolina?</span>
      <div class="lado" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
        <label class="campo"><span>Álcool</span><div class="prefixo"><i>R$</i><input class="entrada" id="p-alc" inputmode="decimal" placeholder="4,70"></div></label>
        <label class="campo"><span>Gasolina</span><div class="prefixo"><i>R$</i><input class="entrada" id="p-gas" inputmode="decimal" placeholder="5,99"></div></label>
      </div>
      <p id="comp-res" style="margin-top:12px;font-size:15px"></p>
    </div>`));
  el.append(html(`<div class="secao"><h2>Lembretes</h2><span class="rotulo" id="lb-status"></span></div>`));
  el.append(html(`<div class="cartao" id="lembretes">
      <p class="rotulo">Aviso pra anotar o km (só chega se ainda não anotou) e aviso de reserva.</p>
      <div class="acoes" id="lb-botoes"></div>
      <div class="dias" id="lb-dias"></div>
    </div>`));
  el.append(html(`<div class="secao"><h2>Tanque</h2></div>`));
  el.append(html(`<div class="cartao">
      <label class="linha-aj"><span>Capacidade do tanque (L)</span><input class="entrada" id="cfg-tanque" inputmode="decimal"></label>
      <label class="linha-aj"><span>Avisar reserva abaixo de (km)</span><input class="entrada" id="cfg-alerta" inputmode="numeric"></label>
    </div>`));
  el.append(html(`<div class="secao"><h2>Categorias de gasto</h2><button class="botao sec" id="cat-nova" style="height:38px;font-size:15px">+ Nova</button></div>`));
  el.append(html(`<div class="lista" id="aj-cats"></div>`));
  el.append(html(`<div class="secao"><h2>Dados</h2><span class="rotulo" id="aj-sync"></span></div>`));
  el.append(html(`<div class="acoes" style="margin-top:0"><button class="botao sec" id="aj-csv">Exportar planilhas (CSV)</button></div>`));
  el.append(html(`<button class="botao perigo largo" id="aj-sair" style="margin-top:12px">Sair da conta</button>`));

  const comparar = async () => {
    const { abast } = await carregar(); const hoje = hojeLocal();
    const pa = parseNumeroBR(el.querySelector('#p-alc').value), pg = parseNumeroBR(el.querySelector('#p-gas').value);
    const ka = consumoMedio(abast, { dataRef: hoje, combustivel: 'alcool' })?.kmL;
    const kg = (consumoMedio(abast, { dataRef: hoje, combustivel: 'gasolina_comum' }) ?? consumoMedio(abast, { dataRef: hoje, combustivel: 'gasolina_aditivada' }))?.kmL;
    const r = compararCombustivel(pa, pg, ka, kg);
    const res = el.querySelector('#comp-res');
    if (!r) { res.innerHTML = `<span class="rotulo">Digite os dois preços do posto.${ka && kg ? ' Vou usar o consumo real do teu carro.' : ' Uso a regra dos 70% até ter consumo dos dois.'}</span>`; return; }
    res.innerHTML = `<b class="num" style="font-size:24px;color:${r.compensa === 'alcool' ? 'var(--ok)' : 'var(--texto)'}">${r.compensa === 'alcool' ? '🌱 Álcool compensa' : '⛽ Gasolina compensa'}</b><br>
      <span class="rotulo">Álcool a ${formatarNumero(r.proporcao * 100)}% da gasolina · limite ${formatarNumero(r.limite * 100)}% ${ka && kg ? '(teu consumo real)' : '(regra dos 70%)'}</span>`;
  };
  el.querySelector('#p-alc').addEventListener('input', comparar);
  el.querySelector('#p-gas').addEventListener('input', comparar);
  comparar();

  el.querySelector('#cat-nova').addEventListener('click', async () => {
    const nome = prompt('Nome da nova categoria:')?.trim(); if (!nome) return;
    const { cats } = await carregar();
    await db.salvar('carro_categorias', { nome, icone: '📌', ordem: cats.length, ativa: true }); aviso('Categoria criada');
  });
  el.querySelector('#aj-csv').addEventListener('click', exportar);
  const salvarCfg = async (mudanca) => { const { config } = await carregar(); await db.salvar('carro_config', { ...config, ...mudanca }); aviso('Ajuste salvo'); };
  el.querySelector('#cfg-tanque').addEventListener('change', (e) => { const v = parseNumeroBR(e.target.value); if (v >= 20 && v <= 120) salvarCfg({ tanque_litros: v }); });
  el.querySelector('#cfg-alerta').addEventListener('change', (e) => { const v = parseNumeroBR(e.target.value); if (v >= 0 && v <= 300) salvarCfg({ alerta_km: Math.round(v) }); });
  el.querySelector('#lb-dias').addEventListener('change', async (e) => {
    const i = e.target.closest('input[data-dia]'); if (!i) return;
    const { config } = await carregar();
    await salvarCfg({ horarios: { ...config.horarios, [i.dataset.dia]: i.value || null } });
  });
  el.querySelector('#lb-botoes').addEventListener('click', async (e) => {
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    e.target.disabled = true;
    try { if (a === 'ativar') await ativarNotificacoes(); if (a === 'desativar') await desativarNotificacoes(); if (a === 'testar') await testar(); }
    catch (err) { aviso(err.message || 'Não deu certo', false); }
    e.target.disabled = false; desenharLembretes();
  });
  el.querySelector('#aj-sair').addEventListener('click', async () => { if (confirm('Sair da conta neste aparelho?')) { await db.sair(); location.reload(); } });
  await atualizar();
}

const DIAS = [[1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta'], [5, 'Sexta'], [6, 'Sábado'], [0, 'Domingo']];

async function inscricaoAtual() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration(); return reg ? reg.pushManager.getSubscription() : null;
}

async function desenharLembretes() {
  const b = el.querySelector('#lb-botoes'), st = el.querySelector('#lb-status');
  if (db.ehDemo()) { st.textContent = 'indisponível no modo demonstração'; b.innerHTML = ''; return; }
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!('PushManager' in window) || !standalone) {
    st.textContent = 'precisa do app na tela de início';
    b.innerHTML = '<p class="rotulo">No iPhone, as notificações só funcionam com o app instalado: Safari → Compartilhar → Adicionar à Tela de Início, e abrir por lá.</p>';
    return;
  }
  const sub = await inscricaoAtual();
  const ok = sub && Notification.permission === 'granted';
  st.textContent = ok ? 'ativos neste iPhone ✓' : Notification.permission === 'denied' ? 'bloqueados nos Ajustes do iPhone' : 'desativados';
  b.innerHTML = ok
    ? '<button class="botao sec" data-a="testar">Mandar teste</button><button class="botao sec" data-a="desativar">Desativar</button>'
    : '<button class="botao largo" data-a="ativar">Ativar notificações</button>';
}

function b64ParaU8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4); const s = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function ativarNotificacoes() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Sem permissão. Libera em Ajustes do iPhone → Notificações → Meu Carro.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ParaU8(VAPID_PUBLIC) });
  const j = sub.toJSON();
  const { error } = await db.cliente().from('carro_push_subs').upsert({ endpoint: j.endpoint, user_id: db.usuario().id, sub: j }, { onConflict: 'endpoint' });
  if (error) throw new Error('Não salvou no servidor: ' + error.message);
  aviso('Notificações ativadas');
}

async function desativarNotificacoes() {
  const sub = await inscricaoAtual();
  if (sub) { await db.cliente().from('carro_push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  aviso('Notificações desativadas');
}

async function testar() {
  const { data, error } = await db.cliente().functions.invoke('lembretes-carro', { body: { teste: true } });
  if (error) { let msg = error.message; try { msg = (await error.context.json()).erro || msg; } catch {} throw new Error(msg); }
  aviso(`Teste enviado (${data.enviados} aparelho${data.enviados > 1 ? 's' : ''})`);
}

async function atualizar() {
  if (!el?.isConnected) return;
  const { cats, config } = await carregar();
  const tq = el.querySelector('#cfg-tanque'), al = el.querySelector('#cfg-alerta');
  if (document.activeElement !== tq) tq.value = formatarNumero(Number(config.tanque_litros));
  if (document.activeElement !== al) al.value = config.alerta_km;
  el.querySelector('#lb-dias').innerHTML = DIAS.map(([d, n]) => `<label><span>${n}</span><input class="entrada" type="time" data-dia="${d}" value="${config.horarios?.[d] ?? ''}"></label>`).join('');
  desenharLembretes();
  el.querySelector('#aj-conta').textContent = db.usuario()?.email ?? '';
  const p = db.pendentes();
  el.querySelector('#aj-sync').textContent = p ? `${p} ${p === 1 ? 'anotação esperando' : 'anotações esperando'} internet` : 'tudo sincronizado ✓';
  const lista = el.querySelector('#aj-cats'); lista.replaceChildren();
  cats.forEach((c, i) => {
    const li = html(`<div class="item" style="${c.ativa ? '' : 'opacity:.45'}"><span class="ico">${esc(c.icone ?? '📌')}</span>
      <span class="meio"><b>${esc(c.nome)}</b><small>${c.ativa ? 'aparece nos gastos' : 'oculta'}</small></span>
      <span style="display:flex;gap:6px">
        <button class="botao sec" data-a="sobe" style="height:36px;padding:0 10px" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
        <button class="botao sec" data-a="nome" style="height:36px;padding:0 10px" aria-label="Renomear">✎</button>
        <button class="botao sec" data-a="ver" style="height:36px;padding:0 10px" aria-label="${c.ativa ? 'Ocultar' : 'Mostrar'}">${c.ativa ? '👁' : '◌'}</button>
      </span></div>`);
    li.addEventListener('click', async (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      if (a === 'ver') await db.salvar('carro_categorias', { ...c, ativa: !c.ativa });
      if (a === 'nome') { const n = prompt('Novo nome:', c.nome)?.trim(); if (n) await db.salvar('carro_categorias', { ...c, nome: n }); }
      if (a === 'sobe' && i > 0) { const o = cats[i - 1]; await db.salvar('carro_categorias', { ...c, ordem: o.ordem }); await db.salvar('carro_categorias', { ...o, ordem: c.ordem }); }
    });
    lista.append(li);
  });
}

async function exportar() {
  const { leituras, abast, gastos, cats } = await carregar();
  const nomeCat = (id) => cats.find((c) => c.id === id)?.nome ?? '';
  const arquivos = [
    ['km-diario.csv', paraCSV(leituras, [{ chave: 'data', titulo: 'Data' }, { chave: 'km', titulo: 'Km' }])],
    ['abastecimentos.csv', paraCSV(abast.map((a) => ({ ...a, comb: COMB_CURTO[a.combustivel], cheio: a.tanque_cheio ? 'sim' : 'não' })),
      [{ chave: 'data', titulo: 'Data' }, { chave: 'km', titulo: 'Km' }, { chave: 'valor', titulo: 'Valor (R$)' }, { chave: 'preco_litro', titulo: 'Preço do litro' }, { chave: 'litros', titulo: 'Litros' }, { chave: 'comb', titulo: 'Combustível' }, { chave: 'cheio', titulo: 'Tanque cheio' }])],
    ['gastos.csv', paraCSV(gastos.map((g) => ({ ...g, cat: nomeCat(g.categoria_id) })),
      [{ chave: 'data', titulo: 'Data' }, { chave: 'cat', titulo: 'Categoria' }, { chave: 'descricao', titulo: 'Descrição' }, { chave: 'valor', titulo: 'Valor (R$)' }, { chave: 'km', titulo: 'Km' }])],
  ];
  for (const [nome, conteudo] of arquivos) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' })); a.download = nome; a.click();
    await new Promise((r) => setTimeout(r, 300));
  }
  aviso('Planilhas exportadas');
}

registrarTela('ajustes', { montar, atualizar });
