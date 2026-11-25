import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autonomia, horarioLembrete, deveLembrar } from '../js/calc.js';

const A = (data, km, litros, extra = {}) => ({ data, km, litros, combustivel: 'gasolina_comum', tanque_cheio: false, ...extra });

test('autonomia sem nenhuma referência é null', () => {
  assert.equal(autonomia({ leituras: [{ data: '2026-11-24', km: 80845 }], abast: [A('2026-11-24', 80825, 16.694)], kmL: 12 }), null);
});

test('autonomia a partir do painel desconta o que rodou depois', () => {
  const leituras = [{ data: '2026-11-24', km: 80845, autonomia: 240 }, { data: '2026-11-25', km: 80905 }];
  const r = autonomia({ leituras, abast: [], kmL: 12, capacidade: 49 });
  assert.equal(r.km, 180);            // 240 − 60 rodados
  assert.equal(r.litros, 15);         // 180 / 12
  assert.equal(r.base, 'painel');
});

test('abastecimento depois da referência soma litros', () => {
  const leituras = [{ data: '2026-11-20', km: 80500, autonomia: 60 }, { data: '2026-11-25', km: 80560 }];
  const r = autonomia({ leituras, abast: [A('2026-11-22', 80530, 20)], kmL: 12, capacidade: 49 });
  // 5 L − 30/12 + 20 − 30/12 = 20 L
  assert.equal(r.litros, 20);
  assert.equal(r.km, 240);
});

test('tanque cheio vira referência com a capacidade', () => {
  const leituras = [{ data: '2026-11-25', km: 81120 }];
  const r = autonomia({ leituras, abast: [A('2026-11-24', 81000, 30, { tanque_cheio: true })], kmL: 12, capacidade: 49 });
  assert.equal(r.litros, 39);         // 49 − 120/12
  assert.equal(r.base, 'cheio');
});

test('a referência mais recente vence e o tanque não passa da capacidade nem fica negativo', () => {
  const leituras = [{ data: '2026-11-20', km: 80000, autonomia: 500 }, { data: '2026-11-21', km: 80100, autonomia: 100 }, { data: '2026-11-22', km: 80300 }];
  const r = autonomia({ leituras, abast: [], kmL: 10, capacidade: 49 });
  assert.equal(r.litros, 0); assert.equal(r.km, 0);
  const cheia = autonomia({ leituras: [{ data: '2026-11-20', km: 80000, autonomia: 900 }], abast: [], kmL: 10, capacidade: 49 });
  assert.equal(cheia.litros, 49); assert.equal(cheia.km, 490);
});

test('sem consumo conhecido usa 11 km/l e marca estimativa', () => {
  const r = autonomia({ leituras: [{ data: '2026-11-24', km: 80845, autonomia: 110 }], abast: [], kmL: null, capacidade: 49 });
  assert.equal(r.litros, 10); assert.equal(r.km, 110); assert.equal(r.estimativa, true);
});

test('horarioLembrete usa o dia da semana (domingo = 0)', () => {
  const H = { 0: '18:30', 1: '18:30', 2: '18:30', 3: '18:30', 4: '21:30', 5: '18:30', 6: '18:30' };
  assert.equal(horarioLembrete(H, '2026-11-26'), '21:30'); // quinta
  assert.equal(horarioLembrete(H, '2026-11-25'), '18:30'); // quarta
  assert.equal(horarioLembrete({}, '2026-11-25'), null);
});

test('deveLembrar só na janela do horário e se ainda não anotou', () => {
  assert.equal(deveLembrar('18:30', 18 * 60 + 32, false), true);
  assert.equal(deveLembrar('18:30', 18 * 60 + 29, false), false);
  assert.equal(deveLembrar('18:30', 18 * 60 + 50, false), false); // passou da janela de 15 min
  assert.equal(deveLembrar('18:30', 18 * 60 + 32, true), false);  // já anotou
  assert.equal(deveLembrar(null, 0, false), false);
});
