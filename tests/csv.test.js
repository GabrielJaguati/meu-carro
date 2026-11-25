import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paraCSV } from '../js/csv.js';

test('paraCSV usa ; , vírgula decimal, BOM e aspas quando precisa', () => {
  const out = paraCSV([{ v: 5.99, d: 'a;b' }, { v: 100, d: 'disse "oi"' }], [{ chave: 'v', titulo: 'Valor' }, { chave: 'd', titulo: 'Descrição' }]);
  assert.equal(out, '﻿Valor;Descrição\r\n5,99;"a;b"\r\n100;"disse ""oi"""\r\n');
});
test('paraCSV deixa vazio null e undefined', () => {
  assert.equal(paraCSV([{ a: null }], [{ chave: 'a', titulo: 'A' }, { chave: 'b', titulo: 'B' }]), '﻿A;B\r\n;\r\n');
});
