// CSV no jeito que o Excel brasileiro abre direto: ; como separador, vírgula decimal e BOM UTF-8.
const campo = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function paraCSV(linhas, colunas) {
  const cab = colunas.map((c) => campo(c.titulo)).join(';');
  const corpo = linhas.map((l) => colunas.map((c) => campo(l[c.chave])).join(';'));
  return '﻿' + [cab, ...corpo].join('\r\n') + '\r\n';
}
