import { ArrowLeft, Check, Plus, Search, Send, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { inputClass } from "../components/Field";
import FindingsTable from "../components/FindingsTable";
import { EmptyState, ErrorState, LoadingState } from "../components/StateBlock";
import { Verdict } from "../components/Status";
import { useAuth } from "../context/AuthContext";
import { formatPeriod, usePeriod } from "../context/PeriodContext";
import { useAsync } from "../hooks/useAsync";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatDate } from "../lib/dates";
import { listSiteEmployees } from "../services/employees";
import { getConcepts, getCountries } from "../services/reference";
import { sendBatch, validateRows } from "../services/validationFlow";

const big = "min-h-[48px] text-base";
const UNIT = { hours: "horas", days: "días" };

function draftKey(userId, siteId, period) {
  return `validador.captura.${userId}.${siteId}.${period}`;
}
function loadDraft(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
function saveDraft(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Sin almacenamiento: el borrador vive solo mientras la pantalla esté abierta.
  }
}

export default function MobileCapture() {
  usePageTitle("Captura en terreno");
  const navigate = useNavigate();
  const { user, sites } = useAuth();
  const { period } = usePeriod();
  const site = sites[0];
  const employees = useAsync(() => (site ? listSiteEmployees(site.id) : Promise.resolve({ data: [] })), [site?.id]);
  const concepts = useAsync(() => (site ? getConcepts(site.country_code) : Promise.resolve({ data: [] })), [site?.country_code]);
  const countries = useAsync(() => getCountries(), []);
  const country = (countries.data || []).find((c) => c.code === site?.country_code);

  const key = site && period ? draftKey(user.id, site.id, period) : null;
  const [items, setItems] = useState([]);
  const [step, setStep] = useState("list");
  const [draft, setDraft] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (key) setItems(loadDraft(key));
  }, [key]);
  useEffect(() => {
    if (key) saveDraft(key, items);
  }, [key, items]);

  if (!site) return <EmptyState title="No tienes una planta asignada">Pide al administrador que te asigne una planta.</EmptyState>;
  if (employees.loading || concepts.loading || countries.loading) return <LoadingState label="Preparando la captura…" />;
  const loadError = employees.error || concepts.error || countries.error;
  if (loadError) return <ErrorState message={loadError.message} onRetry={() => { employees.reload(); concepts.reload(); countries.reload(); }} />;

  const activeConcepts = concepts.data.filter((c) => c.active);
  const conceptOf = (code) => activeConcepts.find((c) => c.code === code);
  const employeeOf = (code) => employees.data.find((e) => e.employee_code === code);

  function startNew() {
    setDraft({ date: draft.date || "", quantity: "" });
    setResult(null);
    setStep("employee");
  }

  function addItem() {
    setItems((list) => [...list, { ...draft, id: crypto.randomUUID() }]);
    setDraft({ date: draft.date });
    setResult(null);
    setStep("list");
  }

  async function validate() {
    setBusy("Validando…");
    setError(null);
    const rows = items.map((it, i) => ({
      rowNumber: i + 1,
      employee_code: it.employee_code,
      concept_code: it.concept_code,
      date: it.date,
      quantity: it.quantity,
      unit: conceptOf(it.concept_code)?.unit,
      support_ref: it.support_ref || "",
    }));
    const res = await validateRows({ rows, structure: null, country, site, period });
    setBusy(null);
    if (res.error) setError(res.error.message);
    else setResult(res.data);
  }

  async function send() {
    setBusy("Enviando…");
    setError(null);
    const res = await sendBatch({ result, country, site, period, source: "mobile" });
    setBusy(null);
    if (res.error) setError(res.error.message);
    else {
      setItems([]);
      navigate(`/lotes/${res.data}`);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-wide text-niebla">{site.name} · {formatPeriod(period)}</p>
        <h1 className="text-xl font-bold">Captura en terreno</h1>
      </header>

      {step === "employee" && (
        <EmployeeStep employees={employees.data} onBack={() => setStep("list")} onPick={(e) => { setDraft((d) => ({ ...d, employee_code: e.employee_code })); setStep("concept"); }} />
      )}

      {step === "concept" && (
        <Step title="¿Qué novedad?" subtitle={labelOf(employeeOf(draft.employee_code))} onBack={() => setStep("employee")}>
          <ul className="grid gap-2">
            {activeConcepts.filter((c) => c.category !== "benefit").map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => { setDraft((d) => ({ ...d, concept_code: c.code })); setStep("detail"); }}
                  className="flex min-h-[56px] w-full items-center justify-between rounded-lg border border-linea bg-superficie px-4 text-left hover:border-petroleo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo"
                >
                  <span>
                    <span className="block font-medium">{c.name}</span>
                    <span className="text-xs text-niebla">{c.code} · en {UNIT[c.unit]}{c.requires_support ? " · exige respaldo" : ""}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Step>
      )}

      {step === "detail" && (
        <DetailStep
          concept={conceptOf(draft.concept_code)}
          employee={employeeOf(draft.employee_code)}
          draft={draft}
          setDraft={setDraft}
          period={period}
          onBack={() => setStep("concept")}
          onAdd={addItem}
        />
      )}

      {step === "list" && (
        <>
          {items.length === 0 ? (
            <EmptyState title="Aún no registras novedades" action={<Button icon={Plus} className={big} onClick={startNew}>Agregar novedad</Button>}>
              Registra una por una las horas extraordinarias, feriados y ausencias del periodo. Se guardan en este dispositivo hasta que las envíes.
            </EmptyState>
          ) : (
            <>
              <ul className="mb-4 divide-y divide-linea rounded-lg border border-linea bg-superficie">
                {items.map((it, i) => (
                  <li key={it.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="tabular w-6 text-sm text-niebla">{i + 1}</span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-medium">{labelOf(employeeOf(it.employee_code))}</p>
                      <p className="tabular text-niebla">{it.concept_code} · {formatDate(it.date)} · {it.quantity} {UNIT[conceptOf(it.concept_code)?.unit] || ""}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Quitar novedad ${i + 1}`}
                      onClick={() => { setItems((l) => l.filter((x) => x.id !== it.id)); setResult(null); }}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-md text-bloqueado hover:bg-bloqueado-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo"
                    >
                      <Trash2 className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="grid gap-2">
                <Button variant="secondary" icon={Plus} className={big} onClick={startNew}>Agregar otra novedad</Button>
                <Button icon={ShieldCheck} className={big} onClick={validate} loading={busy === "Validando…"} loadingText="Validando…" disabled={Boolean(busy)}>
                  Validar {items.length} novedad{items.length > 1 ? "es" : ""}
                </Button>
              </div>
            </>
          )}

          {result && (
            <div className="mt-6 space-y-4">
              <Verdict disposition={result.disposition} counts={result.counts} />
              {result.findings.length > 0 && <FindingsTable findings={result.findings} caption="Hallazgos de la captura" />}
              <Button icon={Send} className={`${big} w-full`} onClick={send} loading={busy === "Enviando…"} loadingText="Enviando…" disabled={Boolean(busy)}>
                Enviar lote
              </Button>
            </div>
          )}
          {error && <div className="mt-4"><ErrorState title="No se pudo completar" message={error} /></div>}
        </>
      )}
    </div>
  );
}

function labelOf(e) {
  return e ? `${e.first_name} ${e.last_name} · ${e.employee_code}` : "Trabajador";
}

function Step({ title, subtitle, onBack, children }) {
  return (
    <section>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 text-sm font-medium text-petroleo hover:bg-petroleo-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
      </button>
      <h2 className="text-lg font-bold">{title}</h2>
      {subtitle && <p className="mb-3 text-sm text-niebla">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmployeeStep({ employees, onPick, onBack }) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const active = employees.filter((e) => e.active);
    if (!q) return active.slice(0, 30);
    return active
      .filter((e) => `${e.first_name} ${e.last_name} ${e.employee_code}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q))
      .slice(0, 30);
  }, [employees, query]);

  return (
    <Step title="¿Para quién es la novedad?" onBack={onBack}>
      <label htmlFor="cap-search" className="sr-only">Buscar trabajador</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-niebla" aria-hidden="true" />
        <input id="cap-search" type="search" autoFocus placeholder="Nombre o código" value={query} onChange={(e) => setQuery(e.target.value)} className={`${inputClass} min-h-[48px] pl-10 text-base`} />
      </div>
      {list.length === 0 ? (
        <p className="mt-4 text-sm text-niebla">Ningún trabajador activo de tu planta coincide con «{query}».</p>
      ) : (
        <ul className="mt-3 divide-y divide-linea rounded-lg border border-linea bg-superficie">
          {list.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onPick(e)} className="flex min-h-[56px] w-full flex-col justify-center px-4 text-left hover:bg-papel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petroleo">
                <span className="font-medium">{e.first_name} {e.last_name}</span>
                <span className="tabular text-xs text-niebla">{e.employee_code} · {e.national_id_masked}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Step>
  );
}

function DetailStep({ concept, employee, draft, setDraft, period, onBack, onAdd }) {
  const [y, m] = period.split("-").map(Number);
  const min = `${period}-01`;
  const max = `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const qty = Number(String(draft.quantity ?? "").replace(",", "."));
  const valid = draft.date && Number.isFinite(qty) && qty > 0;

  return (
    <Step title={concept?.name} subtitle={labelOf(employee)} onBack={onBack}>
      <div className="space-y-4">
        <div>
          <label htmlFor="cap-date" className="mb-1 block text-sm font-medium">Fecha</label>
          <input id="cap-date" type="date" min={min} max={max} value={draft.date || ""} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} className={`${inputClass} min-h-[48px] text-base`} />
        </div>
        <div>
          <label htmlFor="cap-qty" className="mb-1 block text-sm font-medium">Cantidad ({UNIT[concept?.unit]})</label>
          <input id="cap-qty" type="text" inputMode="decimal" autoComplete="off" placeholder={concept?.unit === "hours" ? "Ej.: 2 o 1,5" : "Ej.: 1"} value={draft.quantity || ""} onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))} className={`${inputClass} min-h-[48px] text-base`} />
        </div>
        {concept?.requires_support && (
          <div>
            <label htmlFor="cap-support" className="mb-1 block text-sm font-medium">Respaldo (folio o autorización)</label>
            <input id="cap-support" type="text" value={draft.support_ref || ""} onChange={(e) => setDraft((d) => ({ ...d, support_ref: e.target.value }))} className={`${inputClass} min-h-[48px] text-base`} />
            <p className="mt-1 text-xs text-niebla">Este concepto exige respaldo. Sin él, la novedad quedará con advertencia.</p>
          </div>
        )}
        <Button icon={Check} className={`${big} w-full`} disabled={!valid} onClick={onAdd}>Agregar a la lista</Button>
      </div>
    </Step>
  );
}
