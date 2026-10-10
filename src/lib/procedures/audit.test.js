import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditProcedure, computeScore, requiredRules } from './audit.js';
import { extractProcedureText } from './extractText.js';
import { normalize, splitParagraphs, containsKeyword } from './text.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

function item(overrides = {}) {
  return {
    code: 'X-01',
    title: 'Ítem de prueba',
    weight: 1,
    keywords: ['alfa', 'beta', 'gamma', 'fecha de corte'],
    min_hits_full: 3,
    min_hits_partial: 1,
    uses_country_rules: false,
    question: '¿Pregunta?',
    suggested_text: 'Texto sugerido.',
    active: true,
    ...overrides,
  };
}

const RULES_ITEM = item({
  code: 'R-01',
  keywords: ['tope', 'jornada', 'legal', 'ley'],
  min_hits_full: 2,
  min_hits_partial: 1,
  uses_country_rules: true,
  suggested_text: 'Se deben respetar las reglas legales vigentes: <REGLAS_FALTANTES>.',
});

const RULES = [
  {
    rule_key: 'max_overtime_hours_per_day',
    value_numeric: 2,
    unit: 'hours',
    description: 'Máximo de horas extraordinarias por día',
    procedure_keywords: ['2 horas extraordinarias', 'dos horas extra'],
    valid_from: '2000-01-01',
    valid_to: null,
  },
  {
    rule_key: 'weekly_hours_limit',
    value_numeric: 42,
    unit: 'hours',
    description: 'Jornada ordinaria máxima semanal',
    procedure_keywords: ['42 horas'],
    valid_from: '2026-04-26',
    valid_to: '2028-04-25',
  },
  {
    rule_key: 'weekly_hours_limit',
    value_numeric: 40,
    unit: 'hours',
    description: 'Jornada ordinaria máxima semanal',
    procedure_keywords: ['40 horas'],
    valid_from: '2028-04-26',
    valid_to: null,
  },
  {
    rule_key: 'no_keywords_rule',
    value_numeric: 7,
    unit: 'days',
    description: 'Regla sin palabras clave',
    procedure_keywords: null,
    valid_from: '2000-01-01',
    valid_to: null,
  },
];

const TODAY = '2026-10-10';

describe('normalización y párrafos', () => {
  it('quita tildes, pasa a minúsculas y colapsa espacios', () => {
    expect(normalize('  Próxima   REVISIÓN\n Dueño ')).toBe('proxima revision dueno');
  });

  it('palabras sueltas respetan límites; frases exigen límite a la izquierda', () => {
    const t = normalize('Los conceptos y 12 horas extraordinarias');
    expect(containsKeyword(t, 'concepto')).toBe(false);
    expect(containsKeyword(t, 'conceptos')).toBe(true);
    expect(containsKeyword(t, '2 horas extraordinarias')).toBe(false);
    expect(containsKeyword(normalize('2 horas extraordinarias'), '2 horas extra')).toBe(true);
  });

  it('un título markdown solo se une al párrafo siguiente', () => {
    const text = '# Título\n\n## Sección\n\nCuerpo del párrafo.\n\nOtro.';
    const ps = splitParagraphs(text);
    expect(ps.map((p) => p.original)).toEqual(['# Título\n\n## Sección\n\nCuerpo del párrafo.', 'Otro.']);
    ps.forEach((p) => expect(text.includes(p.original)).toBe(true));
  });
});

describe('auditProcedure: resultados por ítem', () => {
  const text = 'Introducción sin nada.\n\nAlfa y beta y gamma en este párrafo.\n\nSolo alfa aquí.';

  it('cumple cuando el mejor párrafo alcanza min_hits_full', () => {
    const { findings } = auditProcedure({ text, checklist: [item()], today: TODAY });
    expect(findings[0].result).toBe('cumple');
    expect(findings[0].evidenceQuote).toBe('Alfa y beta y gamma en este párrafo.');
    expect(findings[0].matchedKeywords).toEqual(['alfa', 'beta', 'gamma']);
    expect(findings[0].suggestedText).toBeNull();
  });

  it('parcial cuando solo alcanza min_hits_partial', () => {
    const { findings } = auditProcedure({ text: 'Solo alfa aquí.', checklist: [item()] });
    expect(findings[0].result).toBe('parcial');
    expect(findings[0].evidenceQuote).toBe('Solo alfa aquí.');
    expect(findings[0].suggestedText).toBe('Texto sugerido.');
  });

  it('no_encontrado sin cita cuando no hay palabras clave', () => {
    const { findings } = auditProcedure({ text: 'Nada relevante.', checklist: [item()] });
    expect(findings[0].result).toBe('no_encontrado');
    expect(findings[0].evidenceQuote).toBeNull();
  });

  it('la cita es texto exacto del documento y se trunca a 400 caracteres', () => {
    const long = `Alfa beta gamma ${'texto '.repeat(120)}fin.`;
    const doc = `Encabezado.\n\n${long}`;
    const { findings } = auditProcedure({ text: doc, checklist: [item()] });
    const quote = findings[0].evidenceQuote;
    expect(quote.length).toBeLessThanOrEqual(400);
    expect(quote.endsWith('…')).toBe(true);
    expect(doc.includes(quote.slice(0, -1))).toBe(true);
  });

  it('respeta el invariante cita ⇔ cumple/parcial', () => {
    const { findings } = auditProcedure({
      text,
      checklist: [item(), item({ code: 'X-02', keywords: ['zeta'] })],
    });
    findings.forEach((f) => {
      if (f.result === 'no_encontrado') expect(f.evidenceQuote).toBeNull();
      else expect(f.evidenceQuote).toBeTruthy();
    });
  });

  it('ignora ítems inactivos', () => {
    const r = auditProcedure({
      text,
      checklist: [item(), item({ code: 'X-02', active: false })],
    });
    expect(r.findings.map((f) => f.itemCode)).toEqual(['X-01']);
    expect(r.coverage).toEqual({ withQuote: 1, total: 1 });
    expect(r.maxScore).toBe(100);
  });
});

describe('ítems con reglas del país', () => {
  it('solo exige reglas vigentes con palabras clave (42 h sí, 40 h futura no)', () => {
    const keys = requiredRules(RULES, TODAY).map((r) => `${r.rule_key}:${r.value_numeric}`);
    expect(keys).toEqual(['max_overtime_hours_per_day:2', 'weekly_hours_limit:42']);
    const later = requiredRules(RULES, '2028-05-01').map((r) => r.value_numeric);
    expect(later).toEqual([2, 40]);
  });

  it('cumple si menciona todas las reglas vigentes con contexto legal', () => {
    const text = 'Según la ley, máximo 2 horas extraordinarias por día y jornada de 42 horas.';
    const [f] = auditProcedure({ text, checklist: [RULES_ITEM], countryRules: RULES, today: TODAY }).findings;
    expect(f.result).toBe('cumple');
    expect(f.missingRules).toEqual([]);
    expect(f.evidenceQuote).toBe(text);
  });

  it('parcial si menciona solo algunas, con la lista de faltantes en la redacción', () => {
    const text = 'Introducción.\n\nLa ley fija un tope de 2 horas extraordinarias por día.';
    const [f] = auditProcedure({ text, checklist: [RULES_ITEM], countryRules: RULES, today: TODAY }).findings;
    expect(f.result).toBe('parcial');
    expect(f.evidenceQuote).toBe('La ley fija un tope de 2 horas extraordinarias por día.');
    expect(f.missingRules).toEqual([
      { ruleKey: 'weekly_hours_limit', description: 'Jornada ordinaria máxima semanal', value: '42 horas' },
    ]);
    expect(f.suggestedText).toBe(
      'Se deben respetar las reglas legales vigentes: jornada ordinaria máxima semanal: 42 horas.',
    );
  });

  it('no_encontrado si no menciona ninguna regla, aunque hable de la ley en general', () => {
    const text = 'Se respeta la jornada legal y la ley vigente.';
    const [f] = auditProcedure({ text, checklist: [RULES_ITEM], countryRules: RULES, today: TODAY }).findings;
    expect(f.result).toBe('no_encontrado');
    expect(f.evidenceQuote).toBeNull();
    expect(f.missingRules).toHaveLength(2);
  });

  it('mencionar solo la regla futura (40 h) no cuenta', () => {
    const text = 'La jornada legal es de 40 horas.';
    const [f] = auditProcedure({ text, checklist: [RULES_ITEM], countryRules: RULES, today: TODAY }).findings;
    expect(f.result).toBe('no_encontrado');
  });
});

describe('puntaje', () => {
  it('Σ peso × (1 | 0,5 | 0) / Σ pesos × 100, redondeado a 1 decimal', () => {
    const score = computeScore([
      { weight: 1, result: 'cumple' },
      { weight: 1.5, result: 'parcial' },
      { weight: 2, result: 'no_encontrado' },
      { weight: 0.5, result: 'cumple' },
    ]);
    // (1 + 0,75 + 0 + 0,5) / 5 = 45 %
    expect(score).toBe(45);
    expect(computeScore([{ weight: 1, result: 'parcial' }, { weight: 2, result: 'no_encontrado' }])).toBe(16.7);
    expect(computeScore([])).toBe(0);
  });
});

describe('extractProcedureText', () => {
  it('decodifica .md y .txt como UTF-8', async () => {
    const buf = new TextEncoder().encode('Revisión de ñandú').buffer;
    await expect(extractProcedureText(buf, 'a.md')).resolves.toBe('Revisión de ñandú');
    await expect(extractProcedureText(buf, 'a.TXT')).resolves.toBe('Revisión de ñandú');
  });

  it('rechaza extensiones no soportadas y archivos de más de 5 MB', async () => {
    await expect(extractProcedureText(new ArrayBuffer(4), 'a.pdf')).rejects.toThrow(/no soportado/);
    await expect(extractProcedureText(new ArrayBuffer(5 * 1024 * 1024 + 1), 'a.txt')).rejects.toThrow(/5 MB/);
  });
});

describe('muestras sintéticas y concordancia con revisión humana', () => {
  const checklist = readJson('supabase/seed/source/global.json').checklist;
  const countryRules = readJson('supabase/seed/source/cl.json').rules;
  const dir = 'samples/procedures';

  async function loadText(file) {
    const path = join(root, dir, file);
    if (file.endsWith('.docx')) {
      const buf = readFileSync(path);
      return extractProcedureText(new Uint8Array(buf), file);
    }
    return readFileSync(path, 'utf8');
  }

  const files = ['procedimiento-bueno.md', 'procedimiento-regular.txt', 'procedimiento-malo.md'];
  const docxFile = 'procedimiento-bueno.docx';
  const hasDocx = existsSync(join(root, dir, docxFile));

  it('ordena bueno > regular > malo, respeta rangos, cita todo hallazgo y concuerda ≥ 75 %', async () => {
    const all = hasDocx ? [...files, docxFile] : files;
    const documents = [];
    let matches = 0;
    let labelled = 0;
    let positive = 0;
    let positiveWithQuote = 0;

    for (const file of all) {
      const expectedName = file.endsWith('.docx') ? `${file}.json` : file.replace(/\.[^.]+$/, '.json');
      const expected = readJson(join(dir, 'expected', expectedName));
      const text = await loadText(file);
      const { findings, score } = auditProcedure({ text, checklist, countryRules, today: TODAY });

      const [min, max] = expected.expectedScoreRange;
      expect(score, `${file} fuera de rango`).toBeGreaterThanOrEqual(min);
      expect(score, `${file} fuera de rango`).toBeLessThanOrEqual(max);

      const disagreements = [];
      let docMatches = 0;
      findings.forEach((f) => {
        if (f.result !== 'no_encontrado') {
          positive += 1;
          if (f.evidenceQuote) positiveWithQuote += 1;
          // La cita (sin el "…" final) debe ser texto literal del documento.
          expect(text.includes(f.evidenceQuote.replace(/…$/, ''))).toBe(true);
        }
        const human = expected.items[f.itemCode];
        if (human === undefined) return;
        labelled += 1;
        if (human === f.result) docMatches += 1;
        else disagreements.push({ item: f.itemCode, human, algorithm: f.result });
      });
      matches += docMatches;
      const total = Object.keys(expected.items).length;
      documents.push({
        file,
        score,
        concordance: Math.round((docMatches / total) * 1000) / 1000,
        disagreements,
      });
    }

    const scoreOf = (f) => documents.find((d) => d.file === f).score;
    expect(scoreOf('procedimiento-bueno.md')).toBeGreaterThan(scoreOf('procedimiento-regular.txt'));
    expect(scoreOf('procedimiento-regular.txt')).toBeGreaterThan(scoreOf('procedimiento-malo.md'));

    const unsupportedFindings = positive - positiveWithQuote;
    expect(unsupportedFindings).toBe(0);

    const overall = {
      concordance: Math.round((matches / labelled) * 1000) / 1000,
      findingsWithQuotePct: positive === 0 ? 100 : Math.round((positiveWithQuote / positive) * 1000) / 10,
      unsupportedFindings,
    };
    expect(overall.concordance).toBeGreaterThanOrEqual(0.75);

    writeFileSync(
      join(root, 'docs/evaluacion-procedimientos.json'),
      `${JSON.stringify({ generatedAt: new Date().toISOString(), today: TODAY, documents, overall }, null, 2)}\n`,
    );
  });
});
