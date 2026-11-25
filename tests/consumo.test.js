import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarLeitura, kmPorDia, kmRodados, intervalosConsumo, consumoMedio, gastoEstimadoDia, custoPorKm, compararCombustivel } from '../js/calc.js';

const L = [{ data: '2026-11-24', km: 80825 }, { data: '2026-11-25', km: 80870 }, { data: '2026-11-27', km: 80950 }];

test('validarLeitura recusa km menor que a leitura anterior', () => {
  const r = validarLeitura(L, { data: '2026-11-28', km: 8095 });
  assert.equal(r.ok, false);
  assert.match(r.erro, /menor/);
});
test('validarLeitura recusa km maior que a leitura seguinte', () => {
  const r = validarLeitura(L, { data: '2026-11-26', km: 80960 });
  assert.equal(r.ok, false);
  assert.match(r.erro, /maior/);
});
test('validarLeitura aceita leitura válida, primeira leitura e substituição do mesmo dia', () => {
  assert.equal(validarLeitura(L, { data: '2026-11-28', km: 81000 }).ok, true);
  assert.equal(validarLeitura([], { data: '2026-11-24', km: 80825 }).ok, true);
  assert.equal(validarLeitura(L, { data: '2026-11-27', km: 80940 }).ok, true);
});
test('validarLeitura recusa km inválido', () => {
  assert.equal(validarLeitura(L, { data: '2026-11-28', km: null }).ok, false);
  assert.equal(validarLeitura(L, { data: '2026-11-28', km: -5 }).ok, false);
});

test('kmPorDia distribui dias sem anotação', () => {
  assert.deepEqual(kmPorDia(L, '2026-11-25', '2026-11-27'),
    [{ data: '2026-11-25', km: 45 }, { data: '2026-11-26', km: 40 }, { data: '2026-11-27', km: 40 }]);
  assert.deepEqual(kmPorDia(L, '2026-11-28', '2026-11-28'), [{ data: '2026-11-28', km: 0 }]);
});
test('kmRodados soma o período', () => {
  assert.equal(kmRodados(L, '2026-11-24', '2026-11-27'), 125);
  assert.equal(kmRodados([L[0]], '2026-11-24', '2026-11-24'), 0);
  assert.equal(kmRodados([], '2026-11-24', '2026-11-30'), 0);
});

const g = (data, km, litros, extra = {}) => ({ data, km, litros, combustivel: 'gasolina_comum', tanque_cheio: false, ...extra });
const A = [g('2026-11-24', 80825, 16.694), g('2026-12-01', 81090, 16.0)];

test('intervalosConsumo usa os litros e o combustível do início', () => {
  assert.deepEqual(intervalosConsumo(A)[0], { de: '2026-11-24', ate: '2026-12-01', km: 265, litros: 16.694, combustivel: 'gasolina_comum' });
  assert.equal(intervalosConsumo(A).length, 1);
});

test('consumoMedio com um intervalo é estimativa', () => {
  const m = consumoMedio(A, { dataRef: '2026-12-01' });
  assert.equal(m.kmL.toFixed(3), (265 / 16.694).toFixed(3));
  assert.equal(m.metodo, 'media');
  assert.equal(m.estimativa, true);
});
test('consumoMedio sem dados suficientes é null', () => {
  assert.equal(consumoMedio([A[0]], { dataRef: '2026-12-01' }), null);
  assert.equal(consumoMedio([], { dataRef: '2026-12-01' }), null);
});
test('consumoMedio tanque cheio a tanque cheio', () => {
  const C = [g('2026-11-01', 80000, 40, { tanque_cheio: true }), g('2026-11-08', 80200, 10), g('2026-11-15', 80500, 20, { tanque_cheio: true })];
  assert.deepEqual(consumoMedio(C, { dataRef: '2026-11-15' }), { kmL: 500 / 30, metodo: 'cheio', estimativa: false });
});
test('consumoMedio janela de 60 dias ignora intervalos antigos quando há 3 recentes', () => {
  const D = [g('2026-08-01', 70000, 100), g('2026-08-08', 70100, 10), g('2026-11-01', 80000, 10), g('2026-11-08', 80150, 10), g('2026-11-15', 80300, 10), g('2026-11-22', 80450, 10)];
  // intervalos recentes (início em nov): 3 × 150 km / 30 L = 15; intervalo de out (início 08/08) fica fora
  const m = consumoMedio(D, { dataRef: '2026-11-22' });
  assert.equal(m.kmL, 15);
  assert.equal(m.estimativa, true);
});
test('consumoMedio completa com os 3 mais recentes quando a janela tem poucos', () => {
  const E = [g('2026-06-01', 70000, 10), g('2026-06-08', 70120, 10), g('2026-06-15', 70240, 10), g('2026-06-22', 70360, 10)];
  assert.equal(consumoMedio(E, { dataRef: '2026-11-22' }).kmL, 12);
});
test('consumoMedio filtra por combustível pelo início do intervalo', () => {
  const F = [g('2026-11-01', 80000, 20, { combustivel: 'alcool' }), g('2026-11-08', 80200, 10), g('2026-11-15', 80350, 10)];
  assert.equal(consumoMedio(F, { combustivel: 'alcool', dataRef: '2026-11-15' }).kmL, 10);
  assert.equal(consumoMedio(F, { combustivel: 'gasolina_comum', dataRef: '2026-11-15' }).kmL, 15);
});
test('consumoMedio ignora intervalos com km ou litros zerados', () => {
  const Z = [g('2026-11-01', 80000, 0), g('2026-11-02', 80000, 10)];
  assert.equal(consumoMedio(Z, { dataRef: '2026-11-02' }), null);
});

test('gastoEstimadoDia e custoPorKm', () => {
  assert.equal(gastoEstimadoDia(45, 15, 5.99), 17.97);
  assert.equal(gastoEstimadoDia(45, null, 5.99), null);
  assert.equal(gastoEstimadoDia(0, 15, 5.99), 0);
  assert.equal(custoPorKm(100, 0), null);
  assert.equal(custoPorKm(100, 250), 0.4);
});

test('compararCombustivel', () => {
  assert.equal(compararCombustivel(5.10, 5.99).compensa, 'gasolina');
  assert.equal(compararCombustivel(5.10, 5.99).proporcao.toFixed(3), '0.851');
  assert.equal(compararCombustivel(5.10, 5.99).limite, 0.7);
  assert.equal(compararCombustivel(4.0, 6.0).compensa, 'alcool');
  assert.equal(compararCombustivel(4.5, 6.0, 11, 15).limite.toFixed(3), '0.733');
  assert.equal(compararCombustivel(4.5, 6.0, 11, 15).compensa, 'gasolina');
  assert.equal(compararCombustivel(0, 6.0), null);
});
