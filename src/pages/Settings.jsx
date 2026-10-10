import { useEffect, useState } from "react";
import EditableTable from "../components/EditableTable";
import { Field, Select } from "../components/Field";
import PageHeader from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../components/StateBlock";
import { useAsync } from "../hooks/useAsync";
import { insertRow, updateRow } from "../services/admin";
import { getChecklist, getConcepts, getCountries, getCountryRules, getPeriods, getValidationRules } from "../services/reference";
import { AuditLogPanel, UsersPanel } from "./SettingsUsers";

const TABS = [
  ["rules", "Reglas del país"],
  ["concepts", "Conceptos"],
  ["validation", "Reglas de validación"],
  ["periods", "Periodos"],
  ["checklist", "Checklist de procedimientos"],
  ["users", "Usuarios y accesos"],
  ["audit", "Registro de auditoría"],
];

const SEVERITY_OPTS = [["blocking", "Bloqueante"], ["warning", "Advertencia"], ["info", "Informativo"]];
const OWNER_OPTS = [["site", "Planta"], ["central", "Centro de operaciones"]];
const UNIT_OPTS = [["hours", "Horas"], ["days", "Días"]];
const CATEGORY_OPTS = [["overtime", "Horas extra"], ["vacation", "Feriado / vacaciones"], ["absence", "Ausencia"], ["medical_leave", "Licencia médica"], ["benefit", "Beneficio"]];

export default function Settings() {
  const [tab, setTab] = useState("rules");
  const countries = useAsync(() => getCountries(), []);
  const [country, setCountry] = useState("CL");

  useEffect(() => {
    if (countries.data?.length && !countries.data.some((c) => c.code === country)) setCountry(countries.data[0].code);
  }, [countries.data, country]);

  const countryScoped = ["rules", "concepts", "validation", "periods", "checklist"].includes(tab);

  return (
    <>
      <PageHeader title="Configuración" subtitle="Todo lo que cambia por país vive aquí, como datos. Cada cambio queda en el registro de auditoría." />

      <div role="tablist" aria-label="Secciones de configuración" className="mb-4 flex gap-1 overflow-x-auto border-b border-linea">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-[40px] whitespace-nowrap border-b-2 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petroleo ${
              tab === key ? "border-petroleo font-medium text-petroleo" : "border-transparent text-niebla hover:text-pizarra"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {countryScoped && (
        <div className="mb-4 max-w-xs">
          <Field label="País" htmlFor="cfg-country">
            <Select id="cfg-country" value={country} onChange={setCountry}>
              {(countries.data || []).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
      )}

      <div role="tabpanel">
        {tab === "rules" && <RulesPanel country={country} />}
        {tab === "concepts" && <ConceptsPanel country={country} />}
        {tab === "validation" && <ValidationPanel country={country} />}
        {tab === "periods" && <PeriodsPanel country={country} />}
        {tab === "checklist" && <ChecklistPanel country={country} />}
        {tab === "users" && <UsersPanel />}
        {tab === "audit" && <AuditLogPanel />}
      </div>
    </>
  );
}

function Panel({ query, render }) {
  if (query.loading) return <LoadingState />;
  if (query.error) return <ErrorState message={query.error.message} onRetry={query.reload} />;
  if (!query.data?.length) return <EmptyState title="No hay registros">Agrega el primero con el botón «Agregar».</EmptyState>;
  return render(query.data);
}

function useSaver(table, query) {
  return {
    onSave: async (id, changes) => {
      const res = await updateRow(table, id, changes);
      if (!res.error) query.reload();
      return res;
    },
    onCreate: async (row) => {
      const res = await insertRow(table, row);
      if (!res.error) query.reload();
      return res;
    },
  };
}

function RulesPanel({ country }) {
  const q = useAsync(() => getCountryRules(country), [country]);
  const saver = useSaver("country_rules", q);
  return (
    <>
      <p className="mb-3 text-sm text-niebla">
        Las reglas tienen vigencia: para cambiar un valor desde una fecha, cierra la regla actual con «Vigente hasta» y agrega una nueva con «Vigente desde». El motor aplica la regla vigente en la fecha de cada novedad.
      </p>
      <Panel
        query={q}
        render={(rows) => (
          <EditableTable
            caption="Reglas legales y operativas del país"
            rows={rows}
            newRowDefaults={{ country_code: country, valid_from: new Date().toISOString().slice(0, 10) }}
            {...saver}
            columns={[
              { key: "rule_key", label: "Clave", type: "text" },
              { key: "description", label: "Descripción", type: "textarea" },
              { key: "value_numeric", label: "Valor", type: "number", align: "right" },
              { key: "value_text", label: "Valor texto", type: "text" },
              { key: "unit", label: "Unidad", type: "text" },
              { key: "valid_from", label: "Vigente desde", type: "date" },
              { key: "valid_to", label: "Vigente hasta", type: "date" },
              { key: "legal_reference", label: "Referencia", type: "text" },
              { key: "procedure_keywords", label: "Palabras en procedimientos", type: "list" },
            ]}
          />
        )}
      />
    </>
  );
}

function ConceptsPanel({ country }) {
  const q = useAsync(() => getConcepts(country), [country]);
  const saver = useSaver("concepts", q);
  return (
    <Panel
      query={q}
      render={(rows) => (
        <EditableTable
          caption="Conceptos de novedades del país"
          rows={rows}
          newRowDefaults={{ country_code: country, unit: "days", category: "absence", requires_support: false, active: true }}
          {...saver}
          columns={[
            { key: "code", label: "Código", type: "text", editable: false },
            { key: "name", label: "Nombre", type: "text" },
            { key: "unit", label: "Unidad", type: "select", options: UNIT_OPTS },
            { key: "category", label: "Categoría", type: "select", options: CATEGORY_OPTS },
            { key: "requires_support", label: "Exige respaldo", type: "bool" },
            { key: "active", label: "Activo", type: "bool" },
          ]}
        />
      )}
    />
  );
}

function ValidationPanel({ country }) {
  const q = useAsync(() => getValidationRules(country), [country]);
  const saver = useSaver("validation_rules", q);
  const rows = (q.data || []).map((r) => ({ ...r, scope: r.country_code ? `Solo ${r.country_code}` : "Todos los países" }));
  return (
    <>
      <p className="mb-3 text-sm text-niebla">
        Una regla con país propio reemplaza a la regla general del mismo código. Desactivar una regla hace que el motor deje de generar ese hallazgo.
      </p>
      <Panel
        query={{ ...q, data: rows }}
        render={(list) => (
          <EditableTable
            caption="Reglas de validación"
            rows={list}
            {...saver}
            columns={[
              { key: "code", label: "Código", type: "text", editable: false },
              { key: "scope", label: "Alcance", type: "text", editable: false },
              { key: "name", label: "Regla", type: "text" },
              { key: "severity", label: "Severidad", type: "select", options: SEVERITY_OPTS },
              { key: "owner", label: "Responsable", type: "select", options: OWNER_OPTS },
              { key: "message_template", label: "Mensaje", type: "textarea" },
              { key: "active", label: "Activa", type: "bool" },
            ]}
          />
        )}
      />
    </>
  );
}

function PeriodsPanel({ country }) {
  const q = useAsync(() => getPeriods(country), [country]);
  const saver = useSaver("payroll_periods", q);
  return (
    <Panel
      query={q}
      render={(rows) => (
        <EditableTable
          caption="Periodos de nómina"
          rows={rows}
          newRowDefaults={{ country_code: country, status: "open" }}
          {...saver}
          columns={[
            { key: "period", label: "Periodo (AAAA-MM)", type: "text", editable: false },
            { key: "status", label: "Estado", type: "select", options: [["open", "Abierto"], ["closed", "Cerrado"]] },
            { key: "cutoff_date", label: "Fecha de corte", type: "date" },
          ]}
        />
      )}
    />
  );
}

function ChecklistPanel({ country }) {
  const q = useAsync(() => getChecklist(country), [country]);
  const saver = useSaver("procedure_checklist_items", q);
  return (
    <Panel
      query={q}
      render={(rows) => (
        <EditableTable
          caption="Checklist de procedimientos"
          rows={rows}
          {...saver}
          columns={[
            { key: "code", label: "Código", type: "text", editable: false },
            { key: "title", label: "Ítem", type: "text" },
            { key: "weight", label: "Peso", type: "number", align: "right" },
            { key: "keywords", label: "Palabras clave", type: "list" },
            { key: "min_hits_full", label: "Mín. cumple", type: "number", align: "right" },
            { key: "min_hits_partial", label: "Mín. parcial", type: "number", align: "right" },
            { key: "question", label: "Pregunta de aclaración", type: "textarea" },
            { key: "active", label: "Activo", type: "bool" },
          ]}
        />
      )}
    />
  );
}
