# Melhor IA Agora

Site estático que mostra, de forma dinâmica, **qual modelo de IA tem o melhor
custo-benefício no momento**, combinando força (Artificial Analysis Intelligence
Index) e custo (US$ por milhão de tokens).

Dados: [Artificial Analysis](https://artificialanalysis.ai) — atribuição obrigatória.

## Como usar

```bash
# 1. Atualizar os dados (gera data/models.json e data/models.js)
node scripts/update-data.mjs

# 2. Abrir o site
#    - duplo clique em index.html funciona (os dados vão embutidos em data/models.js), ou
npm run dev   # serve em http://localhost:3000
```

## A fórmula

```
Score(m) = 100 × [ (I_m / 100)^γ ÷ P_m^β ] ÷ máximo entre os modelos
```

- `I_m` — Intelligence Index do modelo (0–100, medido independentemente pelo AA)
- `P_m` — preço combinado em US$/1M tokens (3 partes entrada : 1 parte saída, padrão AA)
- `γ` (padrão 4) — recompensa convexa por inteligência: pontos no topo do índice são
  exponencialmente mais difíceis de obter, então valem mais
- `β` (padrão 0,35) — comprime a escala de preços (que varia mais de 100× entre
  modelos) para que um modelo minúsculo e barato não domine só por ser barato
- O líder do momento vale 100; os demais são relativos a ele

Presets no site: **Equilibrado** (γ=4, β=0,35), **Economia** (γ=3, β=0,5),
**Desempenho** (γ=5, β=0,25) — além de sliders para personalizar. Por padrão o
ranking exclui modelos descontinuados, com índice apenas estimado, ou abaixo da
inteligência mínima escolhida (padrão 40).

## Por que o site é "dinâmico"

- O ranking inteiro é **recalculado no navegador** a partir de `data/models.json`:
  qualquer modelo novo que apareça nos dados entra na conta automaticamente.
- `scripts/update-data.mjs` busca os dados mais recentes do Artificial Analysis
  (todos os ~380 modelos com preço e índice publicados).
- Quando servido via HTTP, o site re-verifica o JSON a cada 15 minutos e
  re-renderiza sozinho se os dados mudarem.

### Atualização automática

**Local (Windows):** agende uma tarefa diária no Agendador de Tarefas rodando
`node C:\Users\tulio\projetos-pessoais\best-ai-now\scripts\update-data.mjs`.

**Publicado no GitHub Pages:** o workflow `.github/workflows/update-data.yml`
já atualiza os dados todo dia às 06:00 (Brasília) e faz commit. Basta subir o
repositório para o GitHub e ativar o Pages (branch `main`, pasta raiz).

### Fonte de dados

O script extrai o dataset completo embutido nas páginas públicas do Artificial
Analysis (2 requisições) — é a fonte mais rica: nome curto, flags de modelo
descontinuado/estimado, janela de contexto, pesos abertos etc. Se a extração
quebrar (ex.: redesign do site), ele cai automaticamente para a
[API oficial](https://artificialanalysis.ai/data-api), desde que a variável de
ambiente `AA_API_KEY` esteja definida (chave gratuita, 100 req/dia; no GitHub,
cadastre-a como secret `AA_API_KEY` que o workflow já usa).
