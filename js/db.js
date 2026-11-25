// Acesso a dados: Supabase + cache local + fila offline.
// Com ?demo=1 na URL, usa dados em memória (para testes e demonstração).

import { criarFila } from './fila.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { hojeLocal, somarDias } from './calc.js';

export const TABELAS = ['carro_leituras', 'carro_abastecimentos', 'carro_categorias', 'carro_gastos', 'carro_config'];
export const CONFIG_PADRAO = { lembretes_ativos: true, horarios: { 0: '18:30', 1: '18:30', 2: '18:30', 3: '18:30', 4: '21:30', 5: '18:30', 6: '18:30' }, tanque_litros: 49, alerta_km: 60 };
export const ehDemo = () => DEMO;
export const cliente = () => sb;
export const CATEGORIAS_PADRAO = [
  ['Revisão', '🔧'], ['Troca de roda', '🛞'], ['Troca de pneu', '🛞'], ['Modificações', '✨'],
  ['Lavagem', '🧽'], ['Estacionamento', '🅿️'], ['Outros', '📦'],
];

const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');
const uuid = () => crypto.randomUUID();
const ordenar = (linhas) => [...linhas].sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '') || (a.ordem ?? 0) - (b.ordem ?? 0));

let sb = null;
let user = null;
const cache = {};

// ---- cache local (para abrir offline) ----
const chaveCache = (t) => `meu-carro:cache:${user?.id ?? 'x'}:${t}`;
function lerCache(t) {
  if (cache[t]) return cache[t];
  try { cache[t] = JSON.parse(localStorage.getItem(chaveCache(t)) || '[]'); } catch { cache[t] = []; }
  return cache[t];
}
function gravarCache(t, linhas) {
  cache[t] = ordenar(linhas);
  if (!DEMO) try { localStorage.setItem(chaveCache(t), JSON.stringify(cache[t])); } catch {}
}

// ---- fila offline ----
const fila = criarFila(DEMO ? { getItem: () => null, setItem: () => {} } : localStorage, async (op) => {
  if (op.remover) {
    const { error } = await sb.from(op.tabela).delete().eq('id', op.linha.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from(op.tabela).upsert(op.linha, { onConflict: 'id' });
    if (error) throw error;
  }
});

async function enviar() {
  if (DEMO || !navigator.onLine) return;
  await fila.descarregar();
}

export const pendentes = () => fila.pendentes().length;

// ---- sessão ----
export async function iniciar() {
  if (DEMO) { user = { id: 'demo', email: 'demo@meu-carro' }; semearDemo(); return user; }
  while (!window.supabase) await new Promise((r) => setTimeout(r, 30));
  const { createClient } = window.supabase;
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true } });
  const { data } = await sb.auth.getSession();
  user = data.session?.user ?? null;
  addEventListener('online', () => enviar().then(() => document.dispatchEvent(new CustomEvent('dados-mudaram'))));
  return user;
}

export async function entrar(email, senha) {
  if (DEMO) return user;
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email ou senha incorretos.' : error.message);
  user = data.user;
  return user;
}

export async function sair() {
  if (!DEMO) await sb.auth.signOut();
  for (const t of TABELAS) delete cache[t];
  user = null;
}

export const usuario = () => user;

// ---- dados ----
// Devolve na hora o que está guardado no aparelho e busca o servidor em segundo plano.
// Só espera a rede na primeira vez (quando o aparelho ainda não tem nada).
const ultimaBusca = {};
const temCache = (t) => cache[t] !== undefined || localStorage.getItem(chaveCache(t)) !== null;

async function buscarServidor(tabela) {
  if (!navigator.onLine) return false;
  await enviar().catch(() => {});
  const { data, error } = await sb.from(tabela).select('*');
  if (error) return false;
  ultimaBusca[tabela] = Date.now();
  const fil = fila.pendentes().filter((o) => o.tabela === tabela);
  const porId = new Map(data.map((l) => [l.id, normalizar(l)]));
  for (const o of fil) o.remover ? porId.delete(o.linha.id) : porId.set(o.linha.id, o.linha);
  const novo = ordenar([...porId.values()]);
  const mudou = JSON.stringify(novo) !== JSON.stringify(lerCache(tabela));
  gravarCache(tabela, novo);
  return mudou;
}

let avisoAgendado = null;
export async function listar(tabela) {
  if (DEMO) return lerCache(tabela);
  if (!temCache(tabela)) { await buscarServidor(tabela); return lerCache(tabela); }
  if (Date.now() - (ultimaBusca[tabela] ?? 0) > 20000) {
    ultimaBusca[tabela] = Date.now();
    buscarServidor(tabela).then((mudou) => {
      if (!mudou) return;
      clearTimeout(avisoAgendado);
      avisoAgendado = setTimeout(() => document.dispatchEvent(new CustomEvent('dados-mudaram')), 100);
    }).catch(() => {});
  }
  return lerCache(tabela);
}

// numeric vem do Postgres como string em alguns casos
function normalizar(l) {
  const out = { ...l };
  for (const k of ['km', 'valor', 'preco_litro', 'litros', 'ordem', 'autonomia', 'tanque_litros', 'alerta_km']) if (out[k] !== null && out[k] !== undefined) out[k] = Number(out[k]);
  return out;
}

export async function salvar(tabela, linha) {
  const atual = lerCache(tabela);
  const nova = { ...linha, user_id: user.id };
  if (tabela === 'carro_leituras') {
    const mesmoDia = atual.find((l) => l.data === nova.data);
    nova.id = mesmoDia?.id ?? nova.id ?? uuid();
  } else {
    nova.id ??= uuid();
  }
  gravarCache(tabela, [...atual.filter((l) => l.id !== nova.id), nova]);
  fila.adicionar({ tabela, linha: nova });
  await enviar().catch(() => {});
  document.dispatchEvent(new CustomEvent('dados-mudaram'));
  return nova;
}

export async function remover(tabela, id) {
  gravarCache(tabela, lerCache(tabela).filter((l) => l.id !== id));
  fila.adicionar({ tabela, linha: { id }, remover: true });
  await enviar().catch(() => {});
  document.dispatchEvent(new CustomEvent('dados-mudaram'));
}

export async function garantirCategorias() {
  const cats = await listar('carro_categorias');
  if (cats.length) return;
  for (const [i, [nome, icone]] of CATEGORIAS_PADRAO.entries()) {
    await salvar('carro_categorias', { nome, icone, ordem: i, ativa: true });
  }
}

// ---- modo demo ----
function semearDemo() {
  const hoje = hojeLocal();
  const leituras = [], abast = [];
  let km = 80825;
  for (let d = -21; d <= 0; d++) {
    const data = somarDias(hoje, d);
    if (d > -21) km += 25 + ((d * 7) % 20 + 20) % 20; // 25–44 km por dia
    if (d !== -10) leituras.push({ id: uuid(), user_id: 'demo', data, km });
    const f = { [-21]: [100, 4.69, 'alcool'], [-15]: [80, 4.79, 'alcool'], [-8]: [100, 5.99, 'gasolina_comum'], [-2]: [70, 5.99, 'gasolina_comum'] }[d];
    if (f) abast.push({ id: uuid(), user_id: 'demo', data, km, valor: f[0], preco_litro: f[1], litros: Math.round(f[0] / f[1] * 1000) / 1000, combustivel: f[2], tanque_cheio: false });
  }
  leituras[leituras.length - 2].autonomia = 210;
  cache.carro_leituras = leituras;
  cache.carro_config = [];
  cache.carro_abastecimentos = abast;
  cache.carro_categorias = CATEGORIAS_PADRAO.map(([nome, icone], i) => ({ id: uuid(), user_id: 'demo', nome, icone, ordem: i, ativa: true }));
  const cat = (n) => cache.carro_categorias.find((c) => c.nome === n).id;
  cache.carro_gastos = [
    { id: uuid(), user_id: 'demo', data: somarDias(hoje, -18), categoria_id: cat('Modificações'), valor: 180, descricao: 'Antena shark', km: null },
    { id: uuid(), user_id: 'demo', data: somarDias(hoje, -12), categoria_id: cat('Lavagem'), valor: 40, descricao: 'Lavagem completa', km: null },
    { id: uuid(), user_id: 'demo', data: somarDias(hoje, -6), categoria_id: cat('Estacionamento'), valor: 18, descricao: 'Shopping', km: null },
    { id: uuid(), user_id: 'demo', data: somarDias(hoje, -3), categoria_id: cat('Estacionamento'), valor: 12, descricao: 'Moinhos', km: null },
  ];
}
