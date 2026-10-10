// Utilidades de texto para el auditor de procedimientos (sin IA).

export const MAX_QUOTE_LENGTH = 400;

/** Minúsculas, sin tildes (NFD), espacios colapsados. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const matcherCache = new Map();

/**
 * Palabra suelta: límite de palabra a ambos lados.
 * Frase (contiene espacio): límite solo a la izquierda, de modo que
 * "2 horas extra" calza con "2 horas extraordinarias" pero no con "12 horas extra".
 */
function matcherFor(keyword) {
  const kw = normalize(keyword);
  if (!matcherCache.has(kw)) {
    const body = escapeRegExp(kw);
    const isPhrase = kw.includes(' ');
    const re = isPhrase
      ? new RegExp(`(?:^|[^a-z0-9])${body}`)
      : new RegExp(`(?:^|[^a-z0-9])${body}(?:$|[^a-z0-9])`);
    matcherCache.set(kw, re);
  }
  return matcherCache.get(kw);
}

/** `normalizedText` debe venir ya normalizado. */
export function containsKeyword(normalizedText, keyword) {
  if (!keyword || !normalize(keyword)) return false;
  return matcherFor(keyword).test(normalizedText);
}

const HEADING_RE = /^\s{0,3}#{1,6}\s/;

function isHeadingOnly(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  return lines.length > 0 && lines.every((l) => HEADING_RE.test(l));
}

/**
 * Divide el documento en párrafos = bloques separados por líneas en blanco.
 * Un bloque formado solo por títulos markdown se une al bloque siguiente
 * (el párrafo resultante es el tramo original continuo, incluida la línea en blanco),
 * para que la cita no sea un título suelto. Cada párrafo conserva su texto original exacto.
 */
export function splitParagraphs(text) {
  const source = String(text ?? '');
  const blocks = [];
  const re = /\S[\s\S]*?(?=\r?\n[ \t]*\r?\n|$)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    blocks.push({ start: m.index, end: m.index + m[0].length });
  }

  const paragraphs = [];
  let pendingStart = null;
  for (let i = 0; i < blocks.length; i += 1) {
    const { start, end } = blocks[i];
    const raw = source.slice(start, end);
    const isLast = i === blocks.length - 1;
    if (isHeadingOnly(raw) && !isLast) {
      if (pendingStart === null) pendingStart = start;
      continue;
    }
    const from = pendingStart ?? start;
    pendingStart = null;
    const original = source.slice(from, end).trim();
    paragraphs.push({ original, normalized: normalize(original) });
  }
  return paragraphs;
}

/** Recorta a MAX_QUOTE_LENGTH caracteres agregando "…" si es más largo. */
export function truncateQuote(quote) {
  if (quote.length <= MAX_QUOTE_LENGTH) return quote;
  return `${quote.slice(0, MAX_QUOTE_LENGTH - 1).trimEnd()}…`;
}
