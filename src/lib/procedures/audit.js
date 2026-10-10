// Auditor determinístico de procedimientos (módulo B). No usa IA.
import { containsKeyword, splitParagraphs, truncateQuote } from './text.js';

export const RESULT = Object.freeze({
  CUMPLE: 'cumple',
  PARCIAL: 'parcial',
  NO_ENCONTRADO: 'no_encontrado',
});

const RESULT_FACTOR = { cumple: 1, parcial: 0.5, no_encontrado: 0 };

// Etiquetas genéricas de unidad para redactar las reglas faltantes.
const UNIT_LABELS = {
  hours: 'horas',
  days: 'días',
  percent: '%',
  minutes: 'minutos',
  months: 'meses',
  years: 'años',
};

function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toIsoDate(value) {
  if (!value) return todayIso();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Reglas vigentes en `today` que tienen palabras clave para buscar en el procedimiento. */
export function requiredRules(countryRules, today) {
  const day = toIsoDate(today);
  return (countryRules ?? []).filter((r) => {
    const kws = Array.isArray(r.procedure_keywords) ? r.procedure_keywords.filter(Boolean) : [];
    if (kws.length === 0) return false;
    const from = r.valid_from ? String(r.valid_from).slice(0, 10) : null;
    const to = r.valid_to ? String(r.valid_to).slice(0, 10) : null;
    return (!from || from <= day) && (!to || day <= to);
  });
}

export function formatRuleValue(rule) {
  const value = rule.value_numeric;
  if (value === null || value === undefined) return '';
  const unit = UNIT_LABELS[rule.unit] ?? rule.unit ?? '';
  if (unit === '%') return `${value} %`;
  return unit ? `${value} ${unit}` : String(value);
}

function lowerFirst(s) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/** "máximo de horas extraordinarias por día: 2 horas; jornada ordinaria máxima semanal: 42 horas" */
export function describeMissingRules(missingRules) {
  return missingRules
    .map((r) => (r.value ? `${lowerFirst(r.description)}: ${r.value}` : lowerFirst(r.description)))
    .join('; ');
}

function keywordHits(paragraph, keywords) {
  return keywords.filter((kw) => containsKeyword(paragraph.normalized, kw));
}

function ruleMentioned(paragraph, rule) {
  return rule.procedure_keywords.some((kw) => containsKeyword(paragraph.normalized, kw));
}

/** Mejor párrafo = más palabras clave distintas; en empate gana el primero. */
function bestByKeywords(paragraphs, keywords) {
  let best = null;
  paragraphs.forEach((p) => {
    const hits = keywordHits(p, keywords);
    if (!best || hits.length > best.hits.length) best = { paragraph: p, hits };
  });
  return best ?? { paragraph: null, hits: [] };
}

function evaluateKeywordItem(item, paragraphs) {
  const keywords = item.keywords ?? [];
  const { paragraph, hits } = bestByKeywords(paragraphs, keywords);
  let result = RESULT.NO_ENCONTRADO;
  if (hits.length > 0 && hits.length >= item.min_hits_full) result = RESULT.CUMPLE;
  else if (hits.length > 0 && hits.length >= item.min_hits_partial) result = RESULT.PARCIAL;
  return { result, paragraph: result === RESULT.NO_ENCONTRADO ? null : paragraph, hits };
}

/**
 * Ítem vinculado a country_rules. Regla de decisión:
 * - Todas las reglas requeridas mencionadas (en cualquier parte del documento)
 *   y el párrafo citado alcanza min_hits_partial de palabras clave → cumple.
 * - Todas mencionadas sin contexto suficiente, o solo algunas → parcial.
 * - Ninguna mencionada → no_encontrado, aunque el texto hable de "la ley" en general:
 *   el ítem existe para verificar los topes concretos.
 * - Sin reglas requeridas vigentes → se evalúa solo por palabras clave.
 * La cita es el párrafo con más reglas mencionadas (desempate: más palabras clave).
 */
function evaluateRulesItem(item, paragraphs, rules) {
  if (rules.length === 0) return { ...evaluateKeywordItem(item, paragraphs), missing: [] };

  const keywords = item.keywords ?? [];
  const mentioned = new Set();
  let best = null;
  paragraphs.forEach((p) => {
    const rulesHere = rules.filter((r) => ruleMentioned(p, r));
    rulesHere.forEach((r) => mentioned.add(r));
    const hits = keywordHits(p, keywords);
    if (rulesHere.length === 0) return;
    if (
      !best ||
      rulesHere.length > best.rulesHere.length ||
      (rulesHere.length === best.rulesHere.length && hits.length > best.hits.length)
    ) {
      best = { paragraph: p, hits, rulesHere };
    }
  });

  const missing = rules.filter((r) => !mentioned.has(r));
  if (!best) return { result: RESULT.NO_ENCONTRADO, paragraph: null, hits: [], missing };

  const minContext = Math.max(1, item.min_hits_partial ?? 1);
  const result =
    missing.length === 0 && best.hits.length >= minContext ? RESULT.CUMPLE : RESULT.PARCIAL;
  return { result, paragraph: best.paragraph, hits: best.hits, missing };
}

function buildSuggestedText(item, missingRules) {
  const template = item.suggested_text ?? '';
  if (!template.includes('<REGLAS_FALTANTES>')) return template;
  const list = describeMissingRules(missingRules);
  return template.replace('<REGLAS_FALTANTES>', list || 'las reglas legales vigentes del país');
}

export function computeScore(findings) {
  const total = findings.reduce((acc, f) => acc + Number(f.weight || 0), 0);
  if (total === 0) return 0;
  const earned = findings.reduce(
    (acc, f) => acc + Number(f.weight || 0) * RESULT_FACTOR[f.result],
    0,
  );
  return Math.round((earned / total) * 1000) / 10;
}

/**
 * @param {{ text: string, checklist: object[], countryRules?: object[], today?: string|Date }} input
 * @returns {{ findings: object[], score: number, maxScore: 100, coverage: { withQuote: number, total: number } }}
 */
export function auditProcedure({ text, checklist, countryRules = [], today } = {}) {
  const paragraphs = splitParagraphs(text);
  const rules = requiredRules(countryRules, today);
  const items = (checklist ?? []).filter((item) => item.active !== false);

  const findings = items.map((item) => {
    const evaluation = item.uses_country_rules
      ? evaluateRulesItem(item, paragraphs, rules)
      : { ...evaluateKeywordItem(item, paragraphs), missing: null };

    const missingRules = item.uses_country_rules
      ? evaluation.missing.map((r) => ({
          ruleKey: r.rule_key,
          description: r.description,
          value: formatRuleValue(r),
        }))
      : [];

    const isGap = evaluation.result !== RESULT.CUMPLE;
    const finding = {
      itemCode: item.code,
      title: item.title,
      weight: Number(item.weight),
      result: evaluation.result,
      evidenceQuote:
        evaluation.result === RESULT.NO_ENCONTRADO || !evaluation.paragraph
          ? null
          : truncateQuote(evaluation.paragraph.original),
      matchedKeywords: evaluation.hits,
      missingRules,
      question: item.question ?? null,
      suggestedText: isGap || missingRules.length > 0 ? buildSuggestedText(item, missingRules) : null,
    };
    // Invariante: un hallazgo sin cita nunca queda como cumple/parcial.
    if (finding.result !== RESULT.NO_ENCONTRADO && !finding.evidenceQuote) {
      finding.result = RESULT.NO_ENCONTRADO;
    }
    return finding;
  });

  return {
    findings,
    score: computeScore(findings),
    maxScore: 100,
    coverage: {
      withQuote: findings.filter((f) => f.evidenceQuote !== null).length,
      total: findings.length,
    },
  };
}
