-- Meu Carro — autonomia e lembretes (rodar uma vez no SQL Editor, depois do schema.sql)

-- 1) autonomia que o painel mostra, anotada junto com o km (opcional)
alter table public.carro_leituras add column if not exists autonomia integer check (autonomia >= 0);

-- 2) configurações (uma linha por usuário)
create table if not exists public.carro_config (
  id uuid primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade default auth.uid(),
  lembretes_ativos boolean not null default true,
  horarios jsonb not null default '{"0":"18:30","1":"18:30","2":"18:30","3":"18:30","4":"21:30","5":"18:30","6":"18:30"}',
  tanque_litros numeric(5,1) not null default 49,
  alerta_km integer not null default 60
);

-- 3) aparelhos que recebem notificação (separado do meu-treino)
create table if not exists public.carro_push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  sub jsonb not null,
  criado_em timestamptz not null default now()
);

-- 4) registro do que já foi enviado (só a função mexe aqui)
create table if not exists public.carro_push_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  chave text not null,
  enviado_em timestamptz not null default now(),
  primary key (user_id, chave)
);

alter table public.carro_config enable row level security;
alter table public.carro_push_subs enable row level security;
alter table public.carro_push_log enable row level security;
drop policy if exists "dono" on public.carro_config;
create policy "dono" on public.carro_config for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "dono" on public.carro_push_subs;
create policy "dono" on public.carro_push_subs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 5) agendador: chama a função lembretes-carro a cada 5 minutos
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('lembretes-carro') where exists (select 1 from cron.job where jobname = 'lembretes-carro');
select cron.schedule('lembretes-carro', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://wiebzliwpbuwswcxyukg.supabase.co/functions/v1/lembretes-carro',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'COLE_AQUI_O_CARRO_CRON_SECRET'),
    body := '{}'::jsonb
  );
$$);
