// Casca do app: login, troca de telas, folha (bottom sheet) e avisos.
import * as db from './db.js';

const telas = {};
let atual = null;
const app = document.getElementById('app');
const nav = document.getElementById('nav');

export function registrarTela(id, tela) { telas[id] = tela; }

const ORDEM = ['hoje', 'abastecer', 'gastos', 'resumo', 'ajustes'];

function moverIndicador(animar = true) {
  const b = nav.querySelector('button.on'), ind = nav.querySelector('.nav-ind');
  if (!b || !ind) return;
  ind.style.transition = animar ? '' : 'none';
  ind.style.setProperty('--x', b.offsetLeft + 'px'); ind.style.setProperty('--w', b.offsetWidth + 'px');
}
addEventListener('resize', () => moverIndicador(false));

export async function irPara(id, opcoes = {}) {
  const de = atual; atual = id;
  const dir = de ? Math.sign(ORDEM.indexOf(id) - ORDEM.indexOf(de)) || 1 : 0;
  nav.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.tela === id;
    if (on && !b.classList.contains('on')) { b.classList.remove('pulo'); void b.offsetWidth; b.classList.add('pulo'); }
    b.classList.toggle('on', on);
  });
  moverIndicador(!!de);
  const velha = app.querySelector('section.tela');
  if (velha && dir) {
    velha.classList.add('saindo'); velha.style.setProperty('--dir', dir); velha.style.top = -scrollY + 'px';
    setTimeout(() => velha.remove(), 280);
  } else velha?.remove();
  const el = document.createElement('section'); el.className = 'tela'; el.dataset.tela = id;
  if (dir) { el.classList.add('entrando'); el.style.setProperty('--dir', dir); el.addEventListener('animationend', () => el.classList.remove('entrando'), { once: true }); }
  app.appendChild(el);
  scrollTo(0, 0);
  await telas[id].montar(el, opcoes);
}

// recarrega a tela atual quando os dados mudam (salvar, remover, sincronizar)
let agendado = null;
document.addEventListener('dados-mudaram', () => {
  clearTimeout(agendado);
  agendado = setTimeout(() => { if (atual && !document.querySelector('.folha.on')) telas[atual].atualizar?.(); }, 50);
});

export function aviso(texto, ok = true) {
  const t = document.getElementById('toast');
  t.textContent = texto; t.className = 'toast on' + (ok ? ' ok' : '');
  clearTimeout(t._t); t._t = setTimeout(() => (t.className = 'toast'), 2200);
}

export function abrirFolha(titulo, corpo) {
  const veu = document.createElement('div'); veu.className = 'veu';
  const folha = document.createElement('div'); folha.className = 'folha'; folha.setAttribute('role', 'dialog');
  const h = document.createElement('h2'); h.textContent = titulo;
  folha.append(h, corpo);
  document.body.append(veu, folha);
  requestAnimationFrame(() => { veu.classList.add('on'); folha.classList.add('on'); });
  const fechar = () => {
    veu.classList.remove('on'); folha.classList.remove('on');
    setTimeout(() => { veu.remove(); folha.remove(); document.dispatchEvent(new CustomEvent('dados-mudaram')); }, 300);
  };
  veu.addEventListener('click', fechar);
  return fechar;
}

// pequeno ajudante para montar HTML
export function html(str) {
  const t = document.createElement('template'); t.innerHTML = str.trim();
  return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function entrarNoApp() {
  document.getElementById('login').hidden = true;
  app.hidden = false; nav.hidden = false;
  document.body.dataset.nav = new URLSearchParams(location.search).get('nav') || localStorage.getItem('meu-carro:nav') || 'central';
  await db.garantirCategorias();
  const inicial = new URLSearchParams(location.search).get('tela') || 'hoje';
  await irPara(telas[inicial] ? inicial : 'hoje');
}

async function iniciar() {
  await Promise.all([
    import('./telas/hoje.js'), import('./telas/abastecer.js'), import('./telas/gastos.js'),
    import('./telas/resumo.js'), import('./telas/ajustes.js'),
  ]);
  nav.addEventListener('click', (e) => { const b = e.target.closest('button[data-tela]'); if (b) irPara(b.dataset.tela); });
  const login = document.getElementById('login');
  let user = null;
  try { user = await db.iniciar(); }
  catch (err) {
    login.hidden = false;
    document.getElementById('erro-login').textContent = 'Falta configurar o Supabase: cola a URL e a chave no arquivo config.js (passo a passo no LEIA-ME).';
    return;
  }
  if (user) return entrarNoApp();
  login.hidden = false;
  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target); const erro = document.getElementById('erro-login');
    erro.textContent = '';
    try { await db.entrar(f.get('email'), f.get('senha')); await entrarNoApp(); }
    catch (err) { erro.textContent = err.message || 'Não deu pra entrar. Confere a internet e tenta de novo.'; }
  });
}

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
iniciar();
