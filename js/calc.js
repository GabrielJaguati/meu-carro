// Cálculos e formatação do Meu Carro. Funções puras, sem DOM e sem rede.
// Datas são strings 'YYYY-MM-DD' tratadas em UTC internamente.

const FUSO = 'America/Sao_Paulo';

export function parseNumeroBR(texto) {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  let s = String(texto).replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function hojeLocal(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

const arred = (n, casas) => Math.round(n * 10 ** casas) / 10 ** casas;

export function calcLitros(valor, precoLitro) {
  if (!(valor > 0) || !(precoLitro > 0)) return null;
  return arred(valor / precoLitro, 3);
}

// ---- datas ----
export const paraData = (s) => new Date(s + 'T00:00:00Z');
export const deData = (d) => d.toISOString().slice(0, 10);
export function somarDias(s, n) {
  const d = paraData(s);
  d.setUTCDate(d.getUTCDate() + n);
  return deData(d);
}
export function diasEntre(a, b) {
  return Math.round((paraData(b) - paraData(a)) / 86400000);
}

export function periodo(dataRef, tipo) {
  if (tipo === 'dia') return { inicio: dataRef, fim: dataRef };
  const d = paraData(dataRef);
  if (tipo === 'semana') {
    const dow = (d.getUTCDay() + 6) % 7; // segunda = 0
    const inicio = somarDias(dataRef, -dow);
    return { inicio, fim: somarDias(inicio, 6) };
  }
  if (tipo === 'mes') {
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    return { inicio: deData(new Date(Date.UTC(y, m, 1))), fim: deData(new Date(Date.UTC(y, m + 1, 0))) };
  }
  throw new Error('tipo de período inválido: ' + tipo);
}

// ---- formatação ----
function numeroBR(n, casas) {
  const [int, dec] = Math.abs(n).toFixed(casas).split('.');
  const milhar = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + milhar + (dec ? ',' + dec : '');
}
const valido = (n) => typeof n === 'number' && Number.isFinite(n);

export const formatarNumero = (n, casas = 0) => (valido(n) ? numeroBR(n, casas) : '—');
export const formatarMoeda = (n) => (valido(n) ? 'R$ ' + numeroBR(n, 2) : '—');
export const formatarKm = (n) => (valido(n) ? numeroBR(n, 0) + ' km' : '—');
export const formatarKmL = (n) => (valido(n) ? numeroBR(n, 1) + ' km/l' : '—');

// ---- leituras de km ----
const porData = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.km ?? 0) - (b.km ?? 0));
const dataBR = (s) => s.slice(8, 10) + '/' + s.slice(5, 7);

export function validarLeitura(leituras, nova) {
  if (!Number.isInteger(nova.km) || nova.km <= 0) return { ok: false, erro: 'Digite o km do painel (só números).' };
  let anterior = null, seguinte = null;
  for (const l of leituras) {
    if (l.data < nova.data && (!anterior || l.data > anterior.data)) anterior = l;
    if (l.data > nova.data && (!seguinte || l.data < seguinte.data)) seguinte = l;
  }
  if (anterior && nova.km < anterior.km)
    return { ok: false, erro: `O km não pode ser menor que o da leitura anterior (${formatarKm(anterior.km)} em ${dataBR(anterior.data)}).` };
  if (seguinte && nova.km > seguinte.km)
    return { ok: false, erro: `O km não pode ser maior que o da leitura seguinte (${formatarKm(seguinte.km)} em ${dataBR(seguinte.data)}).` };
  return { ok: true };
}

export function kmPorDia(leituras, inicio, fim) {
  const ord = [...leituras].sort(porData);
  const out = [];
  for (let d = inicio, i = 0; d <= fim; d = somarDias(d, 1)) {
    while (i < ord.length - 1 && ord[i + 1].data < d) i++;
    let km = 0;
    const a = ord[i], b = ord[i + 1];
    if (a && b && a.data < d && d <= b.data) km = (b.km - a.km) / diasEntre(a.data, b.data);
    out.push({ data: d, km });
  }
  return out;
}

export const kmRodados = (leituras, inicio, fim) =>
  kmPorDia(leituras, inicio, fim).reduce((s, x) => s + x.km, 0);

// ---- consumo ----
export function intervalosConsumo(abast) {
  const ord = [...abast].sort(porData);
  const out = [];
  for (let i = 0; i < ord.length - 1; i++) {
    const a = ord[i], b = ord[i + 1];
    out.push({ de: a.data, ate: b.data, km: b.km - a.km, litros: Number(a.litros), combustivel: a.combustivel });
  }
  return out;
}

export function consumoMedio(abast, { combustivel, dataRef, dias = 60, minIntervalos = 3 } = {}) {
  const ord = [...abast].filter((a) => !dataRef || a.data <= dataRef).sort(porData);
  if (ord.length < 2) return null;

  // Regra 1: tanque cheio a tanque cheio (par mais recente)
  const cheios = ord.map((a, i) => (a.tanque_cheio ? i : -1)).filter((i) => i >= 0);
  if (cheios.length >= 2) {
    const i = cheios[cheios.length - 2], j = cheios[cheios.length - 1];
    const trecho = ord.slice(i, j + 1);
    if (!combustivel || trecho.every((a) => a.combustivel === combustivel)) {
      const km = ord[j].km - ord[i].km;
      const litros = trecho.slice(1).reduce((s, a) => s + Number(a.litros), 0);
      if (km > 0 && litros > 0) return { kmL: km / litros, metodo: 'cheio', estimativa: false };
    }
  }

  // Regra 2: média longa
  const ints = intervalosConsumo(ord).filter((x) => x.km > 0 && x.litros > 0 && (!combustivel || x.combustivel === combustivel));
  if (!ints.length) return null;
  let usados = dataRef ? ints.filter((x) => diasEntre(x.de, dataRef) <= dias) : ints;
  if (usados.length < minIntervalos) usados = ints.slice(-minIntervalos);
  const km = usados.reduce((s, x) => s + x.km, 0);
  const litros = usados.reduce((s, x) => s + x.litros, 0);
  return { kmL: km / litros, metodo: 'media', estimativa: usados.length < 4 };
}

// ---- custos ----
export function gastoEstimadoDia(kmDia, kmL, preco) {
  if (!(kmL > 0) || !(preco > 0) || !(kmDia >= 0)) return null;
  return arred((kmDia / kmL) * preco, 2);
}

export function custoPorKm(total, km) {
  if (!(km > 0) || !valido(total)) return null;
  return total / km;
}

export function compararCombustivel(precoAlcool, precoGasolina, kmLAlcool, kmLGasolina) {
  if (!(precoAlcool > 0) || !(precoGasolina > 0)) return null;
  const limite = kmLAlcool > 0 && kmLGasolina > 0 ? kmLAlcool / kmLGasolina : 0.7;
  const proporcao = precoAlcool / precoGasolina;
  return { proporcao, limite, compensa: proporcao <= limite ? 'alcool' : 'gasolina' };
}

// ---- autonomia ----
// Referência = a mais recente entre "autonomia do painel" (numa leitura) e "completei o tanque".
// A partir dela: desconta km rodados ÷ km/l e soma os litros dos abastecimentos seguintes.
export const KML_PADRAO = 11;

export function autonomia({ leituras, abast, kmL, capacidade = 49 }) {
  const usarKmL = kmL > 0 ? kmL : KML_PADRAO;
  const refs = [
    ...leituras.filter((l) => l.autonomia !== null && l.autonomia !== undefined && l.autonomia >= 0)
      .map((l) => ({ km: l.km, litros: l.autonomia / usarKmL, base: 'painel', ordem: 1 })),
    ...abast.filter((a) => a.tanque_cheio).map((a) => ({ km: a.km, litros: capacidade, base: 'cheio', ordem: 0 })),
  ].sort((a, b) => a.km - b.km || a.ordem - b.ordem);
  if (!refs.length) return null;
  const ref = refs[refs.length - 1];
  const kmAtual = Math.max(ref.km, ...leituras.map((l) => l.km), ...abast.map((a) => a.km));
  const eventos = abast.filter((a) => a.km > ref.km).sort((a, b) => a.km - b.km);
  let litros = ref.litros, km = ref.km;
  const limitar = (v) => Math.min(capacidade, Math.max(0, v));
  for (const a of eventos) { litros = limitar(litros - (a.km - km) / usarKmL + Number(a.litros)); km = a.km; }
  litros = limitar(litros - (kmAtual - km) / usarKmL);
  litros = Math.round(litros * 10) / 10;
  return { litros, km: Math.round(litros * usarKmL), base: ref.base, estimativa: !(kmL > 0) };
}

// ---- lembrete ----
export function horarioLembrete(horarios, data) {
  const dow = paraData(data).getUTCDay();
  const h = horarios?.[dow] ?? horarios?.[String(dow)];
  return typeof h === 'string' && /^\d{1,2}:\d{2}$/.test(h) ? h : null;
}

export function deveLembrar(horario, minutoAgora, jaAnotou, janela = 15) {
  if (!horario || jaAnotou) return false;
  const [h, m] = horario.split(':').map(Number);
  const alvo = h * 60 + m;
  return minutoAgora >= alvo && minutoAgora - alvo < janela;
}
