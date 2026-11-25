// Fila de gravações feitas sem internet. Cada op: {tabela, linha, remover?}.
// Ops com a mesma tabela + linha.id se substituem: a mais nova vence.

const CHAVE = 'meu-carro:fila';

export function criarFila(storage, enviar) {
  const ler = () => {
    try { return JSON.parse(storage.getItem(CHAVE) || '[]'); } catch { return []; }
  };
  const gravar = (ops) => storage.setItem(CHAVE, JSON.stringify(ops));

  return {
    adicionar(op) {
      const ops = ler().filter((o) => !(o.tabela === op.tabela && o.linha.id === op.linha.id));
      ops.push(op);
      gravar(ops);
    },
    pendentes: ler,
    async descarregar() {
      let enviados = 0;
      for (const op of ler()) {
        try { await enviar(op); } catch { break; }
        enviados++;
        gravar(ler().filter((o) => !(o.tabela === op.tabela && o.linha.id === op.linha.id)));
      }
      return enviados;
    },
  };
}
