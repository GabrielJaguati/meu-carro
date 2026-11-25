# Meu Carro — Design

**Data:** 24/11/2026
**Dono:** Gabriel (GitHub: GabrielJaguati)
**Status:** aguardando aprovação

## 1. Intenção e o porquê

Hoje o Gabriel faz na mão as contas do Virtus (álcool × gasolina, quanto dura o abastecimento, se chega em casa na reserva). Ele quer um app no iPhone onde anota o km todo dia e registra abastecimentos e gastos. O app mostra quanto o carro roda, consome e custa por dia, semana e mês, com os gastos detalhados por categoria.

O carro é um VW Virtus 200 TSI flex, usado só na cidade (Cachoeirinha ↔ Porto Alegre), sem viagens longas. A média tem sido uns R$ 100 por semana de combustível.

## 2. Objetivos

- Anotar o **km do painel todo dia à noite** em poucos segundos.
- Registrar **abastecimentos**: data, km, valor pago, preço do litro e combustível (álcool, gasolina comum ou aditivada). Os litros são calculados.
- Registrar **gastos** por categoria: Revisão, Troca de roda, Troca de pneu, Modificações, Lavagem, Estacionamento e Outros, com a possibilidade de criar categorias novas no app.
- Mostrar, **por dia, semana e mês**:
  - km rodados (exatos, pela diferença entre as anotações)
  - consumo médio em km/l
  - gasto estimado com combustível por dia
  - gastos por categoria
  - custo total por km (combustível + gastos)
- Funcionar como **app instalável na tela de início do iPhone**, com os dados na nuvem e acesso também pelo PC.

## 3. Não objetivos (por enquanto)

- Avisos e lembretes de manutenção (o Gabriel disse que por hora não precisa).
- IPVA/licenciamento, seguro e pedágio (ele tem tag), que não entram como categorias padrão.
- Mais de um carro, mais de um usuário ou compartilhamento.
- Comparador de preço de postos.

## 4. Anti-objetivos (seria fracasso mesmo funcionando)

- Anotar o km diário levar mais que uns 10 segundos ou exigir várias telas.
- Perder dados, já que meses de anotações não podem sumir.
- Mostrar números de consumo que oscilam sem sentido por causa de abastecimentos parciais.

## 5. Restrições

- O Gabriel não tem Mac, então o app é web instalável (PWA), não nativo.
- iPhone 17 Pro com Safari, "Adicionar à Tela de Início".
- Tudo de graça: GitHub Pages + o **mesmo projeto Supabase do meu-treino** (o app de treino foi desativado, mas o projeto continua), com tabelas novas e o mesmo login.
- Interface em português do Brasil.

## 6. Abordagens consideradas

| # | Abordagem | Prós | Contras |
|---|---|---|---|
| **1** | **GitHub Pages + Supabase (igual ao meu-treino)** ✅ escolhida | dados seguros na nuvem, abre no PC, estrutura já conhecida, tela cheia no iPhone | um pouco de configuração (rodar o SQL) |
| 2 | PWA com dados só no iPhone | simples, sem login | risco de perder dados, não abre no PC |
| 3 | Página no Claude com banco do Claude | zero configuração, o Claude lê os dados | fica preso ao Claude, sem tela cheia, não funciona offline |

O Gabriel escolheu a **1**. Antes ele cogitou a 2 com dados no Claude, mas um app no GitHub Pages não consegue salvar dados no Claude. Por isso voltou pra 1.

## 7. Dados (Supabase / Postgres)

Todas as tabelas têm `user_id uuid` com RLS (cada usuário só vê os próprios dados), igual ao meu-treino. Prefixo `carro_` pra não misturar com as tabelas do treino.

- **carro_leituras**: `id, user_id, data date, km int, criado_em`
  - Uma por dia (unique `user_id, data`). Anotar de novo no mesmo dia substitui a anterior.
  - Validação: o km não pode ser menor que o da leitura anterior nem maior que o da seguinte.
- **carro_abastecimentos**: `id, user_id, data date, km int, valor numeric, preco_litro numeric, litros numeric (calculado = valor / preco_litro, editável), combustivel text ('alcool' | 'gasolina_comum' | 'gasolina_aditivada'), tanque_cheio bool default false, obs text`
  - Ao salvar um abastecimento, grava ou atualiza também a leitura de km daquele dia.
- **carro_categorias**: `id, user_id, nome, icone, ordem, ativa`
  - Criadas na primeira entrada: Revisão, Troca de roda, Troca de pneu, Modificações, Lavagem, Estacionamento, Outros.
- **carro_gastos**: `id, user_id, data date, km int null, categoria_id, valor numeric, descricao text`

**Dados iniciais:** leitura de 24/11/2026 em 80.825 km e abastecimento de R$ 100,00 de gasolina comum a R$ 5,99 (16,69 L) no mesmo dia.

## 8. Cálculos

- **km rodados no período:** a maior leitura do período menos a última leitura anterior a ele (ou a primeira do período, se não houver anterior). Dias sem anotação ficam distribuídos entre as leituras vizinhas, e o gráfico mostra a barra "esticada".
- **Consumo (km/l):** o Gabriel abastece valores variados (nem sempre R$ 100) e com o tanque em níveis diferentes, então o km/l de um intervalo isolado não é confiável. Regras, em ordem:
  1. **Tanque cheio a tanque cheio (exato):** se houver 2 abastecimentos marcados "completei o tanque", usa-se o par mais recente F1 → F2: km/l = (km_F2 − km_F1) ÷ soma dos litros dos abastecimentos depois de F1 até F2, inclusive. Isso vale se todos os abastecimentos do trecho forem do combustível pedido, ou quando nenhum combustível for pedido.
  2. **Média longa (estimativa que melhora com o tempo):** cada intervalo A → B tem km = km_B − km_A, litros = litros_A e o combustível de A. Usam-se os intervalos cujo A esteja nos **últimos 60 dias**; se forem menos de 3, pegam-se os 3 mais recentes. km/l = Σkm ÷ Σlitros. Os erros de nível do tanque se anulam com o tempo.
  3. Com menos de 2 abastecimentos, aparece "calculando…". Quando a regra 2 usar menos de 4 intervalos, o número aparece marcado como **estimativa**.
  - Álcool e gasolina são calculados separados quando houver dados dos dois. A lista de abastecimentos mostra os **km rodados** de cada intervalo, sem km/l por intervalo, porque esse número é ruidoso.
  *(Ajustado em 24/11 depois que o Gabriel explicou que o valor e o nível do tanque variam.)*
- **Gasto estimado de combustível por dia:** km do dia ÷ km/l médio × preço do litro do último abastecimento.
- **Gasto real de combustível no mês:** soma dos abastecimentos do mês.
- **Custo por km:** (combustível + gastos do período) ÷ km rodados no período.
- **Comparação álcool × gasolina** (cálculo simples pra decidir no posto): o usuário digita os dois preços e vê a proporção e qual compensa, usando o km/l real dele quando houver dados dos dois combustíveis, ou a regra dos 70% quando não houver.

## 9. Telas

Barra de navegação embaixo, com cinco abas:

1. **Hoje**: campo grande "km do painel" já focado, botão Salvar, e o resumo de ontem/hoje (km rodados, gasto estimado). Atalhos pra "Abastecer" e "Novo gasto".
2. **Abastecer**: formulário (data, km, valor, preço do litro, combustível, tanque cheio?) e o histórico de abastecimentos com o km/l de cada intervalo.
3. **Gastos**: formulário (data, categoria, valor, descrição, km opcional) e lista filtrável por categoria e mês.
4. **Resumo**: seletor Dia / Semana / Mês, com cards (km, km/l, gasto de combustível, outros gastos, custo/km), um gráfico de km por dia e uma pizza ou barras por categoria.
5. **Ajustes**: categorias (criar, renomear, ocultar), a comparação álcool × gasolina, exportar CSV e sair.

## 10. Estrutura técnica

- Repositório novo **`GabrielJaguati/meu-carro`** (público, GitHub Pages), com a mesma organização do meu-treino: `index.html`, `app.js`, `style.css`, `sw.js` (cache offline da interface), `manifest.json`, `config.js` (URL e chave anon do Supabase), `schema.sql` e `LEIA-ME.md` com o passo a passo.
- Sem framework e sem build: HTML/CSS/JS puro + `supabase-js` via CDN, igual ao meu-treino.
- Sem internet, a interface abre do cache, e as anotações feitas offline ficam numa fila local e são enviadas quando a conexão voltar.

## 11. Decisões que ficam com quem constrói

- **Visual:** cores, tipografia e ícone. Pela preferência do Gabriel, **mostrar opções em print antes de decidir**. Ponto de partida: algo que combine com carro e que seja diferente do vermelho do meu-treino, mas a escolha é dele.
- Biblioteca de gráficos (proposta: Chart.js via CDN).
- Textos de interface e mensagens de erro.
- Layout exato de cada tela, dentro do que está descrito na seção 9.

## 12. Chamadas que eu fiz (pra o Gabriel conferir)

- Reutilizar o projeto Supabase do meu-treino, com tabelas de prefixo `carro_`.
- Nome do repositório `meu-carro`.
- Uma leitura por dia, com a nova substituindo a anterior.
- Consumo pela média longa (60 dias, mínimo de 3 intervalos), ou exato entre dois "tanque cheio".
- Campo opcional "completei o tanque?" no abastecimento, que deixa o km/l exato quando usado.
- Comparação álcool × gasolina dentro do app.
- Exportar CSV como backup extra.
- Fila offline pra anotações sem internet.
