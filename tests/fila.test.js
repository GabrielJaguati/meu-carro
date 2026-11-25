import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarFila } from '../js/fila.js';

const memoria = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('ops com mesma tabela+id se substituem (a mais nova vence)', () => {
  const fila = criarFila(memoria(), async () => {});
  fila.adicionar({ tabela: 'carro_leituras', linha: { id: 'a', km: 1 } });
  fila.adicionar({ tabela: 'carro_leituras', linha: { id: 'a', km: 2 } });
  fila.adicionar({ tabela: 'carro_gastos', linha: { id: 'a', valor: 3 } });
  assert.equal(fila.pendentes().length, 2);
  assert.equal(fila.pendentes()[0].linha.km, 2);
});

test('descarregar envia em ordem e para no primeiro erro', async () => {
  const enviados = [];
  const fila = criarFila(memoria(), async (op) => { if (op.linha.id === 'b') throw new Error('sem rede'); enviados.push(op.linha.id); });
  fila.adicionar({ tabela: 't', linha: { id: 'a' } });
  fila.adicionar({ tabela: 't', linha: { id: 'b' } });
  fila.adicionar({ tabela: 't', linha: { id: 'c' } });
  assert.equal(await fila.descarregar(), 1);
  assert.deepEqual(enviados, ['a']);
  assert.deepEqual(fila.pendentes().map((o) => o.linha.id), ['b', 'c']);
});

test('fila persiste no storage', () => {
  const s = memoria();
  criarFila(s, async () => {}).adicionar({ tabela: 't', linha: { id: 'x' } });
  assert.equal(criarFila(s, async () => {}).pendentes().length, 1);
});

test('remoção também entra na fila', async () => {
  const ops = [];
  const fila = criarFila(memoria(), async (op) => ops.push(op));
  fila.adicionar({ tabela: 't', linha: { id: 'a' } });
  fila.adicionar({ tabela: 't', linha: { id: 'a' }, remover: true });
  assert.equal(fila.pendentes().length, 1);
  await fila.descarregar();
  assert.equal(ops[0].remover, true);
  assert.equal(fila.pendentes().length, 0);
});
