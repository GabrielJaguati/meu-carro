// Meu Carro — função "lembretes-carro" (Supabase Edge Function)
// Roda a cada 5 minutos pelo agendador. Manda:
//   🚗 "Anota o km de hoje" no horário do dia, se ainda não anotou;
//   ⛽ aviso de reserva (uma vez por dia) quando a autonomia estimada fica abaixo do limite.
// Também aceita {"teste":true} vindo do app (com o login do usuário) para mandar um teste.
// Usa as mesmas chaves VAPID do meu-treino (segredos do projeto) e um segredo próprio: CARRO_CRON_SECRET.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
// mesma conta do app (km, consumo, autonomia), direto do site publicado
import { autonomia, consumoMedio, horarioLembrete, deveLembrar, hojeLocal } from "https://gabrieljaguati.github.io/meu-carro/js/calc.js";

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
