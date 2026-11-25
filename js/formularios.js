// Folhas de "Novo abastecimento" e "Novo gasto" (também usadas para editar).
import * as db from './db.js';
import { abrirFolha, aviso, html, esc } from './app.js';
import { parseNumeroBR, calcLitros, hojeLocal, validarLeitura, formatarNumero } from './calc.js';
import { carregar, COMBUSTIVEIS, COMB_CURTO, ultimaLeitura } from './dados.js';

export async function abrirAbastecimento(existente = null) {
  const { leituras, abast } = await carregar();
  const ult = abast.length ? [...abast].sort((a, b) => a.data.localeCompare(b.data)).at(-1) : null;
  const a = existente ?? { data: hojeLocal(), km: ultimaLeitura(leituras)?.km ?? '', valor: '', preco_litro: ult?.preco_litro ?? '', combustivel: ult?.combustivel ?? 'gasolina_comum', tanque_cheio: false };
  const f = html(`<form novalidate>
    <div class="lado">
      <label class="campo"><span>Data</span><input class="entrada" type="date" name="data" value="${a.data}" max="${hojeLocal()}"></label>
      <label class="campo"><span>Km do painel</span><input class="entrada" name="km" inputmode="numeric" value="${a.km ? formatarNumero(Number(a.km)) : ''}"></label>
    </div>
    <div class="lado">
      <label class="campo"><span>Valor pago</span><div class="prefixo"><i>R$</i><input class="entrada" name="valor" inputmode="decimal" placeholder="100,00" value="${a.valor ? formatarNumero(Number(a.valor), 2) : ''}"></div></label>
      <label class="campo"><span>Preço do litro</span><div class="prefixo"><i>R$</i><input class="entrada" name="preco" inputmode="decimal" placeholder="5,99" value="${a.preco_litro ? formatarNumero(Number(a.preco_litro), 2) : ''}"></div></label>
    </div>
    <p class="calc">Litros: <b id="litros">—</b></p>
    <div class="campo"><span>Combustível</span><div class="seg" id="comb">${Object.entries(COMBUSTIVEIS).map(([k, v]) => `<button type="button" data-v="${k}" class="${k === a.combustivel ? 'on' : ''}">${COMB_CURTO[k]}</button>`).join('')}</div></div>
    <label class="marcar"><input type="checkbox" name="cheio" ${a.tanque_cheio ? 'checked' : ''}> Completei o tanque</label>
    <p class="erro" id="erro"></p>
    <button class="botao largo">${existente ? 'Salvar alterações' : 'Salvar abastecimento'}</button>
    ${existente ? '<button type="button" class="botao perigo largo" id="excluir">Excluir abastecimento</button>' : ''}
  </form>`);
  let comb = a.combustivel;
  const litros = () => calcLitros(parseNumeroBR(f.valor.value), parseNumeroBR(f.preco.value));
  const mostrarLitros = () => { const l = litros(); f.querySelector('#litros').textContent = l ? formatarNumero(l, 3) + ' L' : '—'; };
  f.addEventListener('input', mostrarLitros); mostrarLitros();
  f.querySelector('#comb').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; comb = b.dataset.v;
    f.querySelectorAll('#comb button').forEach((x) => x.classList.toggle('on', x === b));
  });
  const fechar = abrirFolha(existente ? 'Editar abastecimento' : 'Novo abastecimento', f);
  f.querySelector('#excluir')?.addEventListener('click', async () => {
    if (!confirm('Excluir esse abastecimento?')) return;
    await db.remover('carro_abastecimentos', existente.id); fechar(); aviso('Abastecimento excluído');
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = f.querySelector('#erro'); erro.textContent = '';
    const km = parseNumeroBR(f.km.value), valor = parseNumeroBR(f.valor.value), preco = parseNumeroBR(f.preco.value), data = f.data.value;
    if (!data) return (erro.textContent = 'Escolha a data do abastecimento.');
    if (!(valor > 0)) return (erro.textContent = 'Digite quanto tu pagou.');
    if (!(preco > 0) || preco > 20) return (erro.textContent = 'Digite o preço do litro, tipo 5,99.');
    const outras = leituras.filter((l) => l.data !== data);
    const v = validarLeitura(outras, { data, km });
    if (!v.ok) return (erro.textContent = v.erro);
    await db.salvar('carro_abastecimentos', { ...(existente ?? {}), data, km, valor, preco_litro: preco, litros: litros(), combustivel: comb, tanque_cheio: f.cheio.checked });
    const doDia = leituras.find((l) => l.data === data);
    if (!doDia || doDia.km < km) await db.salvar('carro_leituras', { data, km });
    fechar(); aviso(existente ? 'Abastecimento atualizado' : 'Abastecimento salvo');
  });
}

export async function abrirGasto({ categoria = null, existente = null } = {}) {
  const { cats } = await carregar();
  const ativas = cats.filter((c) => c.ativa || c.id === existente?.categoria_id);
  let catId = existente?.categoria_id ?? ativas.find((c) => c.nome === categoria)?.id ?? null;
  const g = existente ?? { data: hojeLocal(), valor: '', descricao: '', km: '' };
  const f = html(`<form novalidate>
    <div class="campo"><span>Categoria</span><div class="chips" id="cats">${ativas.map((c) => `<button type="button" data-id="${c.id}" class="${c.id === catId ? 'on' : ''}">${esc(c.icone ?? '')} ${esc(c.nome)}</button>`).join('')}</div></div>
    <div class="lado">
      <label class="campo"><span>Valor</span><div class="prefixo"><i>R$</i><input class="entrada" name="valor" inputmode="decimal" placeholder="0,00" value="${g.valor ? formatarNumero(Number(g.valor), 2) : ''}"></div></label>
      <label class="campo"><span>Data</span><input class="entrada" type="date" name="data" value="${g.data}" max="${hojeLocal()}"></label>
    </div>
    <label class="campo"><span>Descrição</span><input class="entrada" name="descricao" placeholder="Ex.: troca de óleo e filtro" value="${esc(g.descricao ?? '')}"></label>
    <label class="campo"><span>Km do painel (opcional)</span><input class="entrada" name="km" inputmode="numeric" value="${g.km ? formatarNumero(Number(g.km)) : ''}"></label>
    <p class="erro" id="erro"></p>
    <button class="botao largo">${existente ? 'Salvar alterações' : 'Salvar gasto'}</button>
    ${existente ? '<button type="button" class="botao perigo largo" id="excluir">Excluir gasto</button>' : ''}
  </form>`);
  f.querySelector('#cats').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; catId = b.dataset.id;
    f.querySelectorAll('#cats button').forEach((x) => x.classList.toggle('on', x === b));
  });
  const fechar = abrirFolha(existente ? 'Editar gasto' : 'Novo gasto', f);
  f.querySelector('#excluir')?.addEventListener('click', async () => {
    if (!confirm('Excluir esse gasto?')) return;
    await db.remover('carro_gastos', existente.id); fechar(); aviso('Gasto excluído');
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = f.querySelector('#erro'); erro.textContent = '';
    const valor = parseNumeroBR(f.valor.value), km = parseNumeroBR(f.km.value);
    if (!catId) return (erro.textContent = 'Escolha a categoria.');
    if (!(valor > 0)) return (erro.textContent = 'Digite o valor do gasto.');
    if (!f.data.value) return (erro.textContent = 'Escolha a data.');
    await db.salvar('carro_gastos', { ...(existente ?? {}), data: f.data.value, categoria_id: catId, valor, descricao: f.descricao.value.trim() || null, km: km > 0 ? Math.round(km) : null });
    fechar(); aviso(existente ? 'Gasto atualizado' : 'Gasto salvo');
  });
}
