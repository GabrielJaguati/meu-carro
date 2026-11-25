# Copia js/calc.js pra dentro da função do Supabase (o Supabase não deixa importar de outro site).
# Rodar depois de mexer em js/calc.js:  python3 scripts/gerar-funcao.py
import re, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
calc = re.sub(r'^export (function|const|async function)', r'\1', (raiz / 'js/calc.js').read_text(), flags=re.M)
alvo = raiz / 'supabase/functions/lembretes-carro/index.ts'
marca = '\n// ===== cálculos do app (cópia de js/calc.js — gerada por scripts/gerar-funcao.py) =====\n'
alvo.write_text(alvo.read_text().split(marca)[0].rstrip() + '\n' + marca + calc)
print('ok')
