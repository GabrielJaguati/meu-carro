// Carrega tudo de uma vez e oferece atalhos usados por várias telas.
import * as db from './db.js';

export const COMBUSTIVEIS = { alcool: 'Álcool', gasolina_comum: 'Gasolina comum', gasolina_aditivada: 'Gasolina aditivada' };
export const COMB_CURTO = { alcool: 'Álcool', gasolina_comum: 'Comum', gasolina_aditivada: 'Aditivada' };

export async function carregar() {
  const [leituras, abast, gastos, cats, cfgs] = await Promise.all([
    db.listar('carro_leituras'), db.listar('carro_abastecimentos'), db.listar('carro_gastos'), db.listar('carro_categorias'), db.listar('carro_config'),
  ]);
  const config = { ...db.CONFIG_PADRAO, ...(cfgs[0] ?? {}) };
  return { leituras, abast, gastos, cats: [...cats].sort((a, b) => a.ordem - b.ordem), config };
}

export const ultimo = (lista) => lista.length ? lista[lista.length - 1] : null;
export const ultimaLeitura = (leituras) => ultimo([...leituras].sort((a, b) => a.data.localeCompare(b.data)));

// preço do litro vigente numa data: o do último abastecimento até ela
export function precoEm(abast, data) {
  const ant = abast.filter((a) => a.data <= data).sort((a, b) => a.data.localeCompare(b.data));
  return ant.length ? Number(ant[ant.length - 1].preco_litro) : null;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const dataLonga = (s) => { const d = new Date(s + 'T12:00:00Z'); return `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`; };
export const dataCurta = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const cap = (t) => t[0].toUpperCase() + t.slice(1);
export const mesAno = (s) => `${cap(MESES[Number(s.slice(5, 7)) - 1])} de ${s.slice(0, 4)}`;
export const dataLongaCap = (s) => cap(dataLonga(s));
