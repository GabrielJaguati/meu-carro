# Meu Carro

App pessoal pro iPhone: km do dia, abastecimentos, consumo e gastos do carro.
Site estático no GitHub Pages, com os dados no Supabase (o mesmo projeto do meu-treino).

## Colocar no ar (uma vez só)

### 1. Banco (Supabase)
1. Abre o projeto do **meu-treino** no Supabase.
2. Vai em **SQL Editor → New query**, cola todo o conteúdo do `schema.sql` e clica em **Run**.
   Isso cria 4 tabelas novas (`carro_leituras`, `carro_abastecimentos`, `carro_categorias`, `carro_gastos`).
   As tabelas do meu-treino não são tocadas.
3. (Opcional) No fim do `schema.sql` tem um bloco comentado com os primeiros registros
   (km 80.825 no abastecimento e 80.845 à noite, em 24/11). Troca `SEU_EMAIL` pelo teu email,
   tira os `--` do começo das linhas e roda de novo só esse bloco.

### 2. Configuração
O `config.js` já vem com a URL e a chave *publishable* do projeto do meu-treino.
Se um dia trocar de projeto, é só editar esses dois valores.

### 3. GitHub Pages
No repositório: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
branch `main`, pasta `/ (root)`, **Save**. Em 1 ou 2 minutos fica no ar em
`https://gabrieljaguati.github.io/meu-carro/`.

### 4. No iPhone
Abre o link no **Safari** → botão **Compartilhar** → **Adicionar à Tela de Início**.
Entra com o mesmo email e senha do meu-treino.

### 5. Lembretes e autonomia (uma vez só)
1. **SQL Editor:** roda o `schema-lembretes.sql` (a versão com o segredo preenchido que veio no chat).
2. **Edge Functions → Secrets:** adiciona `CARRO_CRON_SECRET` com o mesmo valor que está no SQL.
   As chaves `VAPID_PUBLIC`, `VAPID_PRIVATE` e `SERVICE_KEY` já existem por causa do meu-treino.
3. **Edge Functions → Deploy a new function → Via editor:** nome `lembretes-carro`, cola o
   `supabase/functions/lembretes-carro/index.ts` e faz o deploy. Depois, nos detalhes da função,
   **desliga "Verify JWT"** (o agendador chama sem login; a função confere o segredo sozinha).
4. **No app (instalado na tela de início):** Ajustes → Lembretes → **Ativar notificações** → **Mandar teste**.

## Rotina
- **Toda noite:** abre o app, digita o km do painel (e, se quiser, a autonomia que o painel mostra) e toca em **Salvar km**.
- **No posto:** toca no tanque do carro (ou em *Abastecer*) e lança valor, preço do litro e combustível.
  Se completar o tanque, marca **Completei o tanque**: o consumo fica exato.
- **Outros gastos:** revisão, pneu, lavagem, estacionamento… em *Gastos* ou tocando na parte do carro.
- **Na dúvida entre álcool e gasolina:** *Ajustes* → digita os dois preços.

## Testar sem login
Abre o site com `?demo=1` no fim do endereço: usa dados de exemplo e não grava nada.

## Para quem for mexer no código
- HTML/CSS/JS puro, sem build. Bibliotecas e fontes ficam em `vendor/` e `fonts/` (funciona offline).
- Toda a conta (km, consumo, custos) está em `js/calc.js`, com testes: `npm test` (Node 20+).
- `sw.js` guarda a interface no aparelho. Ao mudar arquivos, aumenta a `VERSAO` lá dentro.
- O giro do carro são 72 imagens em `img/giro/`, tiradas do modelo 3D gerado das fotos do carro (placas desfocadas).
