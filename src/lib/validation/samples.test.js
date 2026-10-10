// Evaluación de punta a punta: cada archivo de samples/ pasa por lectura → mapeo → motor y se compara
// con samples/expected/<archivo>.json por (código, fila). Escribe docs/evaluacion-resultados.json.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyMapping, readTabularFile, suggestMapping } from "../parsing/index.js";
import { validateBatch } from "./index.js";
import { ALIASES, buildContext, ROOT } from "./testFixtures.js";

const SAMPLES_DIR = join(ROOT, "samples");
const EXPECTED_DIR = join(SAMPLES_DIR, "expected");
const expectedFiles = readdirSync(EXPECTED_DIR).filter((f) => f.endsWith(".json")).sort();

const key = (f) => `${f.code}@${f.rowNumber ?? "lote"}`;

/** Diferencia de multiconjuntos: elementos de `a` que no están en `b`. */
function minus(a, b) {
  const pool = new Map();
  for (const k of b) pool.set(k, (pool.get(k) || 0) + 1);
  const rest = [];
  for (const k of a) {
    if (pool.get(k)) pool.set(k, pool.get(k) - 1);
    else rest.push(k);
  }
  return rest;
}

const results = [];

async function evaluate(spec) {
  const bytes = new Uint8Array(readFileSync(join(SAMPLES_DIR, spec.file)));
  const { headers, rows } = await readTabularFile(bytes, spec.file);
  const country = spec.countryCode || spec.siteCode.slice(0, 2);
  const { mapping, renamed, missingFields } = suggestMapping(headers, ALIASES, { countryCode: country });
  return validateBatch({
    rows: applyMapping(rows, mapping),
    structure: { fileName: spec.file, headers, missingFields, renamed },
    context: buildContext({ country, siteCode: spec.siteCode, period: spec.period }),
  });
}

describe("samples", () => {
  it("hay al menos 7 archivos de ejemplo", () => {
    expect(expectedFiles.length).toBeGreaterThanOrEqual(7);
  });

  it.each(expectedFiles)("%s", async (name) => {
    const spec = JSON.parse(readFileSync(join(EXPECTED_DIR, name), "utf8"));
    const result = await evaluate(spec);
    const expected = spec.expected.map(key);
    const detected = result.findings.map(key);
    const falseNegatives = minus(expected, detected);
    const falsePositives = minus(detected, expected);
    results.push({
      file: spec.file,
      expected: expected.length,
      detected: detected.length,
      truePositives: expected.length - falseNegatives.length,
      falseNegatives,
      falsePositives,
    });
    // Ningún RUT completo en mensajes ni valores.
    for (const f of result.findings) expect(`${f.value} ${f.message}`).not.toMatch(/\d{7,8}-[\dkK]/);
    expect({ falseNegatives, falsePositives }).toEqual({ falseNegatives: [], falsePositives: [] });
  });

  afterAll(() => {
    results.sort((a, b) => a.file.localeCompare(b.file));
    const sum = (k) => results.reduce((a, r) => a + r[k], 0);
    const expected = sum("expected");
    const detected = sum("detected");
    const truePositives = sum("truePositives");
    const totals = {
      expected,
      detected,
      truePositives,
      detectionRate: expected ? truePositives / expected : 1,
      falsePositiveRate: detected ? (detected - truePositives) / detected : 0,
    };
    const report = { generatedAt: new Date().toISOString(), files: results, totals };
    writeFileSync(join(ROOT, "docs", "evaluacion-resultados.json"), JSON.stringify(report, null, 2) + "\n");
    console.table(results.map((r) => ({ archivo: r.file, esperados: r.expected, detectados: r.detected, aciertos: r.truePositives })));
    console.info(`Detección: ${(totals.detectionRate * 100).toFixed(1)} % · Falsos positivos: ${(totals.falsePositiveRate * 100).toFixed(1)} %`);
    expect(totals.detectionRate).toBe(1);
    expect(totals.falsePositiveRate).toBe(0);
  });
});
