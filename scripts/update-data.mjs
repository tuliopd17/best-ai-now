#!/usr/bin/env node
/**
 * Atualiza data/models.json e data/models.js com dados do Artificial Analysis
 * (https://artificialanalysis.ai). Rode sempre que quiser dados novos:
 *
 *    node scripts/update-data.mjs
 *
 * Modos, em ordem de preferência:
 *  1. Extração do site público — dataset completo (~570 modelos) embutido nas
 *     páginas (payload Next.js), com mais campos: nome curto, flags de
 *     descontinuado/estimado, contexto, pesos abertos, cache. Usa 2 requisições.
 *  2. Fallback: API oficial, se AA_API_KEY estiver definida (chave gratuita em
 *     https://artificialanalysis.ai/api-key-management-redirect; free = 100 req/dia).
 *     Entra em ação automaticamente se a extração quebrar (ex.: redesign do site).
 *
 * Atribuição obrigatória: os dados exibidos devem creditar Artificial Analysis.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Mozilla/5.0 (compatible; best-ai-now/1.0; site pessoal; dados: Artificial Analysis)";

async function getText(url, headers = {}) {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
  if (!res.ok) throw new Error(`${url} respondeu ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Modo 1: API oficial (requer AA_API_KEY)
// ---------------------------------------------------------------------------
async function fetchFromApi(apiKey) {
  const res = await fetch("https://artificialanalysis.ai/api/v2/data/llms/models", {
    headers: { "x-api-key": apiKey, "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`API respondeu ${res.status}`);
  const body = await res.json();
  // No tier gratuito, os campos de desempenho vêm no nível raiz do modelo, e não
  // há nome curto, flags de descontinuado/estimado, contexto nem pesos abertos.
  const models = (body.data ?? []).map((m) => ({
    slug: m.slug ?? m.id,
    name: m.name,
    creator: m.model_creator?.name ?? null,
    releaseDate: m.release_date ?? null,
    isReasoning: null,
    isOpenWeights: null,
    deprecated: false,
    estimated: false,
    intelligenceIndex: m.evaluations?.artificial_analysis_intelligence_index ?? null,
    codingIndex: m.evaluations?.artificial_analysis_coding_index ?? null,
    agenticIndex: m.evaluations?.artificial_analysis_agentic_index ?? null,
    inputPrice: m.pricing?.price_1m_input_tokens ?? null,
    outputPrice: m.pricing?.price_1m_output_tokens ?? null,
    cacheHitPrice: m.pricing?.price_1m_input_cache_hit_tokens ?? null,
    blendedPrice: m.pricing?.price_1m_blended_3_to_1 ?? null,
    outputSpeed: m.median_output_tokens_per_second ?? m.performance?.median_output_tokens_per_second ?? null,
    latency: m.median_time_to_first_answer_token ?? m.median_time_to_first_token_seconds ?? null,
    contextWindowTokens: m.context_window_tokens ?? null,
  }));
  return { source: "api-oficial", iiVersion: body.intelligence_index_version ?? null, models };
}

// ---------------------------------------------------------------------------
// Modo 2: dataset completo embutido nas páginas públicas (payload Next.js)
// ---------------------------------------------------------------------------

// Decodifica os chunks self.__next_f.push([1,"..."]) de uma página Next.js
function decodeFlightPayload(html) {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let m,
    payload = "";
  while ((m = re.exec(html))) payload += JSON.parse(m[1]);
  return payload;
}

// Extrai um array/objeto JSON balanceado a partir da posição `start`
function scanBalanced(s, start) {
  const open = s[start];
  if (open !== "[" && open !== "{") return null;
  let depth = 0,
    inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "[" || c === "{") depth++;
      else if (c === "]" || c === "}") {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  return null;
}

// Procura no payload o array `"models":[...]` com o dataset completo
function extractModelsArray(payload) {
  const key = '"models":[';
  let idx = -1;
  while ((idx = payload.indexOf(key, idx + 1)) !== -1) {
    const raw = scanBalanced(payload, idx + key.length - 1);
    if (!raw || !raw.includes('"price1mInputTokens"')) continue;
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 100) return arr;
    } catch {
      /* tenta a próxima ocorrência */
    }
  }
  return null;
}

// Extrai o objeto rico de um modelo específico (página /models/<slug>).
// O dataset embutido em "models":[...] às vezes omite o líder recém-lançado;
// a página de detalhes ainda traz o objeto completo com II, preço e shortName.
function extractRichModel(payload, slug) {
  const needle = `"slug":"${slug}"`;
  let i = -1;
  let best = null;
  while ((i = payload.indexOf(needle, i + 1)) !== -1) {
    let start = i;
    while (start > 0 && payload[start] !== "{") start--;
    const raw = scanBalanced(payload, start);
    if (!raw) continue;
    try {
      const obj = JSON.parse(raw);
      if (obj.slug !== slug) continue;
      // Prefere o objeto com métricas de ranking (II + preço)
      const rich =
        obj.intelligenceIndex != null &&
        (obj.price1mInputTokens != null || obj.price1mBlended0To3To1 != null);
      if (rich) return obj;
      if (!best && (obj.shortName || obj.name)) best = obj;
    } catch {
      /* tenta a próxima ocorrência */
    }
  }
  return best;
}

function normalizeModel(m) {
  return {
    slug: m.slug,
    // shortName é o rótulo canônico do AA (ex.: "Claude Opus 5 (max)")
    name: m.shortName ?? m.name,
    creator: m.creator?.name ?? null,
    releaseDate: m.releaseDate ?? null,
    isReasoning: m.isReasoning ?? null,
    isOpenWeights: m.isOpenWeights ?? null,
    deprecated: Boolean(m.deprecated),
    estimated: Boolean(m.intelligenceIndexIsEstimated),
    intelligenceIndex: m.intelligenceIndex ?? null,
    codingIndex: m.codingIndex ?? null,
    agenticIndex: m.agenticIndex ?? null,
    inputPrice: m.price1mInputTokens ?? null,
    outputPrice: m.price1mOutputTokens ?? null,
    cacheHitPrice: m.cacheHitPrice ?? null,
    blendedPrice: m.price1mBlended0To3To1 ?? null,
    outputSpeed: m.timescaleData?.medianOutputSpeed ?? null,
    latency: m.timeToFirstAnswerToken?.total ?? null,
    contextWindowTokens: m.contextWindowTokens ?? null,
  };
}

async function fetchFromSite() {
  // 1) Página /models: versão do II + slugs visíveis no ranking do site
  const listHtml = await getText("https://artificialanalysis.ai/models");
  const iiVersion = listHtml.match(/Intelligence Index v([\d.]+)/)?.[1] ?? null;
  const listSlugs = [
    ...listHtml.matchAll(/"detailsUrl":"\/models\/([a-z0-9-]+)"/g),
  ].map((m) => m[1]);
  const uniqueListSlugs = [...new Set(listSlugs)];
  const seed = uniqueListSlugs[0];
  if (!seed) throw new Error("Não achei nenhum slug de modelo na página /models");

  // 2) Página de detalhes: embute o dataset completo de (quase) todos os modelos
  const detailHtml = await getText(`https://artificialanalysis.ai/models/${seed}`);
  const seedPayload = decodeFlightPayload(detailHtml);
  const all = extractModelsArray(seedPayload);
  if (!all) throw new Error("Dataset completo não encontrado no payload da página de detalhes");

  // 3) Reconcilia modelos listados em /models mas ausentes do array embutido
  //    (ex.: Claude Opus 5 max — presente na página própria, omitido do chart dataset)
  const bySlug = new Map(all.map((m) => [m.slug, m]));
  const recovered = [];
  for (const s of uniqueListSlugs) {
    if (bySlug.has(s)) continue;
    const html = s === seed ? detailHtml : await getText(`https://artificialanalysis.ai/models/${s}`);
    const payload = s === seed ? seedPayload : decodeFlightPayload(html);
    const rich = extractRichModel(payload, s);
    if (!rich) {
      console.warn(`Aviso: slug listado "${s}" não encontrado no dataset nem na página de detalhes`);
      continue;
    }
    all.push(rich);
    bySlug.set(s, rich);
    recovered.push(s);
  }
  if (recovered.length) {
    console.log(`Recuperados ${recovered.length} modelo(s) omitidos do dataset: ${recovered.join(", ")}`);
  }

  return { source: "site-publico", iiVersion, models: all.map(normalizeModel) };
}

// ---------------------------------------------------------------------------
async function main() {
  const apiKey = process.env.AA_API_KEY;
  let result;
  try {
    result = await fetchFromSite();
  } catch (err) {
    if (!apiKey) throw new Error(`extração do site falhou (${err.message}) e AA_API_KEY não está definida`);
    console.warn(`Extração do site falhou (${err.message}); usando a API oficial.`);
    result = await fetchFromApi(apiKey);
  }

  // Mantém apenas modelos com o mínimo necessário para o ranking
  const models = result.models.filter(
    (m) => m.intelligenceIndex != null && m.inputPrice != null && m.outputPrice != null,
  );
  for (const m of models) {
    // Preço combinado no padrão Artificial Analysis: 3 partes input : 1 parte output
    if (m.blendedPrice == null) m.blendedPrice = (3 * m.inputPrice + m.outputPrice) / 4;
  }
  models.sort((a, b) => b.intelligenceIndex - a.intelligenceIndex);

  const payload = {
    fetchedAt: new Date().toISOString(),
    source: result.source,
    intelligenceIndexVersion: result.iiVersion,
    attribution: "Dados: Artificial Analysis (https://artificialanalysis.ai)",
    models,
  };

  mkdirSync(join(ROOT, "data"), { recursive: true });
  const json = JSON.stringify(payload, null, 1);
  writeFileSync(join(ROOT, "data", "models.json"), json);
  // Versão carregável via <script>, para o site funcionar até em file://
  writeFileSync(join(ROOT, "data", "models.js"), `window.__AA_DATA__ = ${json};\n`);

  console.log(
    `OK: ${models.length} modelos gravados (fonte: ${payload.source}, Intelligence Index v${payload.intelligenceIndexVersion ?? "?"})`,
  );
}

main().catch((err) => {
  console.error("Falha na atualização:", err);
  process.exit(1);
});
