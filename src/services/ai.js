import { supabase, supabaseConfigured } from "../lib/supabase";

const UNAVAILABLE = { message: "No fue posible generar la sugerencia." };

// Llama a la Edge Function ai-assist. Ante cualquier falla devuelve error y la pantalla sigue en modo sin IA.
async function invoke(task, payload) {
  if (!supabaseConfigured) return { data: null, error: UNAVAILABLE };
  try {
    const { data, error } = await supabase.functions.invoke("ai-assist", { body: { task, payload } });
    if (error || !data?.data) return { data: null, error: UNAVAILABLE };
    return { data: data.data, error: null };
  } catch {
    return { data: null, error: UNAVAILABLE };
  }
}

// Solo se envían encabezados y nombres de campo: nunca filas, RUT ni nombres.
export async function aiMapColumns(headers, fields) {
  const res = await invoke("map_columns", { headers, fields });
  if (res.error) return res;
  const mapping = {};
  const confidence = {};
  for (const m of res.data.mappings) {
    if (m.field && !mapping[m.field]) {
      mapping[m.field] = m.header;
      confidence[m.field] = m.confidence;
    }
  }
  return { data: { mapping, confidence }, error: null };
}

// Solo el código, la regla y la plantilla del mensaje: sin valores del trabajador.
export const aiExplainFinding = (finding) => invoke("explain_finding", { finding });

// Fusiona la propuesta de la IA con la auditoría por palabras clave (que conserva pesos y textos sugeridos).
export async function aiAuditProcedure({ text, checklist, baseline }) {
  const active = checklist.filter((c) => c.active !== false);
  const res = await invoke("audit_procedure", {
    text,
    checklist: active.map((c) => ({ code: c.code, title: c.title, description: c.description })),
  });
  if (res.error) return res;
  const byCode = Object.fromEntries(res.data.items.map((i) => [i.code, i]));
  const confidence = {};
  const findings = baseline.findings.map((f) => {
    const ai = byCode[f.itemCode];
    if (!ai) return f;
    confidence[f.itemCode] = ai.confidence;
    return {
      ...f,
      result: ai.result,
      evidenceQuote: ai.result === "no_encontrado" ? null : ai.evidence_quote,
      question: ai.question || f.question,
      suggestedText: ai.result === "cumple" ? null : f.suggestedText ?? active.find((c) => c.code === f.itemCode)?.suggested_text ?? null,
      source: "ai",
    };
  });
  return { data: { findings, confidence }, error: null };
}
