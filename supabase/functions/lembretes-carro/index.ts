// @ts-nocheck
// Meu Carro — função "lembretes-carro" (Supabase Edge Function)
// Roda a cada 5 minutos pelo agendador. Manda:
//   🚗 "Anota o km de hoje" no horário do dia, se ainda não anotou;
//   ⛽ aviso de reserva (uma vez por dia) quando a autonomia estimada fica abaixo do limite.
// Também aceita {"teste":true} vindo do app (com o login do usuário) para mandar um teste.
// Usa as mesmas chaves VAPID do meu-treino (segredos do projeto) e um segredo próprio: CARRO_CRON_SECRET.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string) => { const v = Deno.env.get(k); return v == null ? undefined : v.trim().replace(/^[`'"\s]+|[`'"\s]+$/g, "") || undefined; };

let sb: any = null;
function iniciar() {
  const faltando = ["VAPID_PUBLIC", "VAPID_PRIVATE", "CARRO_CRON_SECRET"].filter((k) => !env(k));
  const service = env("SERVICE_KEY") ?? env("SUPABASE_SERVICE_ROLE_KEY");
  if (!service) faltando.push("SERVICE_KEY");
  if (faltando.length) throw new Error("Faltam os segredos: " + faltando.join(", "));
  if (!sb) {
    sb = createClient(env("SUPABASE_URL")!, service!, { auth: { persistSession: false } });
    webpush.setVapidDetails("mailto:" + (env("VAPID_EMAIL") || "meu-carro@example.com").replace(/^mailto:/i, ""), env("VAPID_PUBLIC")!, env("VAPID_PRIVATE")!);
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function minutoSP() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return +p.hour * 60 + +p.minute;
}

async function enviar(userId: string, payload: Record<string, unknown>) {
  const { data: subs } = await sb.from("carro_push_subs").select("endpoint, sub").eq("user_id", userId);
  let ok = 0;
  for (const s of subs || []) {
    try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 3600 }); ok++; }
    catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) await sb.from("carro_push_subs").delete().eq("endpoint", s.endpoint);
      else console.error("push falhou", err?.statusCode, err?.body);
    }
  }
  return ok;
}

// grava a chave antes de mandar: se outro disparo já mandou, não repete
async function umaVez(uid: string, chave: string) {
  const { error } = await sb.from("carro_push_log").insert({ user_id: uid, chave });
  return !error;
}

async function rodar() {
  const hoje = hojeLocal(), agora = minutoSP();
  const { data: subs } = await sb.from("carro_push_subs").select("user_id");
  const users = [...new Set((subs || []).map((s: any) => s.user_id))] as string[];
  let enviados = 0;
  for (const uid of users) {
    const { data: cfg } = await sb.from("carro_config").select("*").eq("user_id", uid).maybeSingle();
    if (cfg && cfg.lembretes_ativos === false) continue;
    const horarios = cfg?.horarios ?? { 0: "18:30", 1: "18:30", 2: "18:30", 3: "18:30", 4: "21:30", 5: "18:30", 6: "18:30" };
    const horario = horarioLembrete(horarios, hoje);
    const [{ data: leituras }, { data: abast }] = await Promise.all([
      sb.from("carro_leituras").select("data, km, autonomia").eq("user_id", uid),
      sb.from("carro_abastecimentos").select("data, km, litros, combustivel, tanque_cheio").eq("user_id", uid),
    ]);
    const L = (leituras || []).map((l: any) => ({ ...l, km: +l.km }));
    const A = (abast || []).map((a: any) => ({ ...a, km: +a.km, litros: +a.litros }));

    // 1) lembrete do km
    const jaAnotou = L.some((l: any) => l.data === hoje);
    if (deveLembrar(horario, agora, jaAnotou) && await umaVez(uid, `${hoje}|km`)) {
      enviados += await enviar(uid, { title: "🚗 Anota o km de hoje", body: "Abre o Meu Carro e salva o km do painel (e a autonomia, se quiser).", tag: "km", url: "./" });
    }

    // 2) reserva: junto com o horário do lembrete (ou às 7h30), uma vez por dia
    const aut = autonomia({ leituras: L, abast: A, kmL: consumoMedio(A, { dataRef: hoje })?.kmL ?? null, capacidade: +(cfg?.tanque_litros ?? 49) });
    const limite = +(cfg?.alerta_km ?? 60);
    const horaAviso = deveLembrar("07:30", agora, false) || deveLembrar(horario, agora, false);
    if (aut && aut.km <= limite && horaAviso && await umaVez(uid, `${hoje}|reserva`)) {
      enviados += await enviar(uid, { title: "⛽ Tanque na reserva", body: `Dá pra rodar uns ${aut.km} km. Bom passar no posto.`, tag: "reserva", url: "./" });
    }
  }
  await sb.from("carro_push_log").delete().lt("enviado_em", new Date(Date.now() - 3 * 864e5).toISOString());
  return { usuarios: users.length, enviados, hoje, minuto: agora };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try { iniciar(); } catch (e: any) { return json({ erro: e.message }, 500); }
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.teste) {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data, error } = await sb.auth.getUser(token);
      if (error || !data?.user) return json({ erro: "Login não reconhecido. Saia e entre de novo no app." }, 401);
      const n = await enviar(data.user.id, { title: "Meu Carro 🚗", body: "Notificações funcionando!", tag: "teste", url: "./" });
      if (!n) return json({ erro: "Nenhum aparelho ativado. Toque em Ativar notificações de novo." }, 404);
      return json({ enviados: n });
    }
    if (req.headers.get("x-cron-secret") !== env("CARRO_CRON_SECRET")) return json({ erro: "não autorizado" }, 401);
    return json(await rodar());
  } catch (e: any) {
    console.error(e);
    return json({ erro: "Erro na função: " + (e?.message || e) }, 500);
  }
});

// ===== cálculos do app (cópia de js/calc.js — gerada por scripts/gerar-funcao.py) =====
// Cálculos e formatação do Meu Carro. Funções puras, sem DOM e sem rede.
// Datas são strings 'YYYY-MM-DD' tratadas em UTC internamente.

const FUSO = 'America/Sao_Paulo';

function parseNumeroBR(texto) {
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

function hojeLocal(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

const arred = (n, casas) => Math.round(n * 10 ** casas) / 10 ** casas;

function calcLitros(valor, precoLitro) {
  if (!(valor > 0) || !(precoLitro > 0)) return null;
  return arred(valor / precoLitro, 3);
}

// ---- datas ----
const paraData = (s) => new Date(s + 'T00:00:00Z');
const deData = (d) => d.toISOString().slice(0, 10);
function somarDias(s, n) {
  const d = paraData(s);
  d.setUTCDate(d.getUTCDate() + n);
  return deData(d);
}
function diasEntre(a, b) {
  return Math.round((paraData(b) - paraData(a)) / 86400000);
}

function periodo(dataRef, tipo) {
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

const formatarNumero = (n, casas = 0) => (valido(n) ? numeroBR(n, casas) : '—');
const formatarMoeda = (n) => (valido(n) ? 'R$ ' + numeroBR(n, 2) : '—');
const formatarKm = (n) => (valido(n) ? numeroBR(n, 0) + ' km' : '—');
const formatarKmL = (n) => (valido(n) ? numeroBR(n, 1) + ' km/l' : '—');

// ---- leituras de km ----
const porData = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.km ?? 0) - (b.km ?? 0));
const dataBR = (s) => s.slice(8, 10) + '/' + s.slice(5, 7);

function validarLeitura(leituras, nova) {
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

function kmPorDia(leituras, inicio, fim) {
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

const kmRodados = (leituras, inicio, fim) =>
  kmPorDia(leituras, inicio, fim).reduce((s, x) => s + x.km, 0);

// ---- consumo ----
function intervalosConsumo(abast) {
  const ord = [...abast].sort(porData);
  const out = [];
  for (let i = 0; i < ord.length - 1; i++) {
    const a = ord[i], b = ord[i + 1];
    out.push({ de: a.data, ate: b.data, km: b.km - a.km, litros: Number(a.litros), combustivel: a.combustivel });
  }
  return out;
}

function consumoMedio(abast, { combustivel, dataRef, dias = 60, minIntervalos = 3 } = {}) {
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
function gastoEstimadoDia(kmDia, kmL, preco) {
  if (!(kmL > 0) || !(preco > 0) || !(kmDia >= 0)) return null;
  return arred((kmDia / kmL) * preco, 2);
}

function custoPorKm(total, km) {
  if (!(km > 0) || !valido(total)) return null;
  return total / km;
}

function compararCombustivel(precoAlcool, precoGasolina, kmLAlcool, kmLGasolina) {
  if (!(precoAlcool > 0) || !(precoGasolina > 0)) return null;
  const limite = kmLAlcool > 0 && kmLGasolina > 0 ? kmLAlcool / kmLGasolina : 0.7;
  const proporcao = precoAlcool / precoGasolina;
  return { proporcao, limite, compensa: proporcao <= limite ? 'alcool' : 'gasolina' };
}

// ---- autonomia ----
// Referência = a mais recente entre "autonomia do painel" (numa leitura) e "completei o tanque".
// A partir dela: desconta km rodados ÷ km/l e soma os litros dos abastecimentos seguintes.
const KML_PADRAO = 11;

function autonomia({ leituras, abast, kmL, capacidade = 49 }) {
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
function horarioLembrete(horarios, data) {
  const dow = paraData(data).getUTCDay();
  const h = horarios?.[dow] ?? horarios?.[String(dow)];
  return typeof h === 'string' && /^\d{1,2}:\d{2}$/.test(h) ? h : null;
}

function deveLembrar(horario, minutoAgora, jaAnotou, janela = 15) {
  if (!horario || jaAnotou) return false;
  const [h, m] = horario.split(':').map(Number);
  const alvo = h * 60 + m;
  return minutoAgora >= alvo && minutoAgora - alvo < janela;
}
