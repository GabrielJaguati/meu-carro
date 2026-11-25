import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumeroBR, hojeLocal, calcLitros, periodo, formatarMoeda, formatarKm, formatarKmL } from '../js/calc.js';

test('parseNumeroBR aceita formatos pt-BR', () => {
  assert.equal(parseNumeroBR('5,99'), 5.99);
  assert.equal(parseNumeroBR('80.825'), 80825);
  assert.equal(parseNumeroBR('80825'), 80825);
  assert.equal(parseNumeroBR('R$ 100,00'), 100);
  assert.equal(parseNumeroBR('1.234,5'), 1234.5);
  assert.equal(parseNumeroBR('5.99'), 5.99);
  assert.equal(parseNumeroBR('abc'), null);
  assert.equal(parseNumeroBR(''), null);
  assert.equal(parseNumeroBR(null), null);
});

test('hojeLocal usa o dia de America/Sao_Paulo', () => {
  assert.equal(hojeLocal(new Date('2026-11-25T02:50:00Z')), '2026-11-24');
  assert.equal(hojeLocal(new Date('2026-11-25T03:10:00Z')), '2026-11-25');
});

test('calcLitros', () => {
  assert.equal(calcLitros(100, 5.99), 16.694);
  assert.equal(calcLitros(100, 0), null);
  assert.equal(calcLitros(null, 5.99), null);
});

test('periodo dia/semana/mes', () => {
  assert.deepEqual(periodo('2026-11-26', 'semana'), { inicio: '2026-11-23', fim: '2026-11-29' });
  assert.deepEqual(periodo('2026-11-29', 'semana'), { inicio: '2026-11-23', fim: '2026-11-29' });
  assert.deepEqual(periodo('2026-11-24', 'mes'), { inicio: '2026-11-01', fim: '2026-11-30' });
  assert.deepEqual(periodo('2026-02-10', 'mes'), { inicio: '2026-02-01', fim: '2026-02-28' });
  assert.deepEqual(periodo('2026-11-24', 'dia'), { inicio: '2026-11-24', fim: '2026-11-24' });
});

test('formatadores pt-BR', () => {
  assert.equal(formatarMoeda(89.25), 'R$ 89,25');
  assert.equal(formatarMoeda(null), '—');
  assert.equal(formatarKm(80825), '80.825 km');
  assert.equal(formatarKmL(15.874), '15,9 km/l');
  assert.equal(formatarKmL(null), '—');
});
