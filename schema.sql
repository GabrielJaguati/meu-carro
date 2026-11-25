-- Meu Carro — tabelas no Supabase (rodar no SQL Editor do mesmo projeto do meu-treino)
-- Pode rodar de novo sem problema: só cria o que não existe.

create table if not exists public.carro_leituras (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  data date not null,
  km integer not null check (km > 0),
  criado_em timestamptz not null default now(),
  unique (user_id, data)
);

create table if not exists public.carro_abastecimentos (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  data date not null,
  km integer not null check (km > 0),
  valor numeric(10,2) not null check (valor > 0),
  preco_litro numeric(6,3) not null check (preco_litro > 0),
  litros numeric(8,3) not null check (litros > 0),
  combustivel text not null check (combustivel in ('alcool','gasolina_comum','gasolina_aditivada')),
  tanque_cheio boolean not null default false,
  obs text,
  criado_em timestamptz not null default now()
);

create table if not exists public.carro_categorias (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  nome text not null,
  icone text,
  ordem integer not null default 0,
  ativa boolean not null default true
);

create table if not exists public.carro_gastos (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  data date not null,
  km integer check (km > 0),
  categoria_id uuid not null references public.carro_categorias(id),
  valor numeric(10,2) not null check (valor > 0),
  descricao text,
  criado_em timestamptz not null default now()
);

create index if not exists carro_leituras_user_data on public.carro_leituras (user_id, data);
create index if not exists carro_abast_user_data on public.carro_abastecimentos (user_id, data);
create index if not exists carro_gastos_user_data on public.carro_gastos (user_id, data);

-- Segurança: cada usuário só enxerga e mexe nos próprios dados
do $$
declare t text;
begin
  foreach t in array array['carro_leituras','carro_abastecimentos','carro_categorias','carro_gastos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format('create policy "dono" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ===== Dados iniciais (opcional) =====
-- Troque SEU_EMAIL pelo email do login e rode este bloco UMA vez.
-- insert into public.carro_leituras (id, user_id, data, km)
--   select gen_random_uuid(), id, '2026-11-24', 80845 from auth.users where email = 'SEU_EMAIL';
-- insert into public.carro_abastecimentos (id, user_id, data, km, valor, preco_litro, litros, combustivel)
--   select gen_random_uuid(), id, '2026-11-24', 80825, 100.00, 5.99, 16.694, 'gasolina_comum' from auth.users where email = 'SEU_EMAIL';
