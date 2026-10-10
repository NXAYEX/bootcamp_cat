import { CATEGORY_LABELS } from "./catalog.js";
import { eligibleLegal, groupBy, round2 } from "./prepare.js";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function stats(values) {
  const n = values.length;
  if (!n) return { mean: 0, sd: 0, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1) : 0;
  return { mean: round2(mean), sd: round2(Math.sqrt(variance)), n };
}

/**
 * Convierte el historial del maestro (employees[].history = [{ period, category, total }])
 * en { employees: { [employeeCode]: { [category]: { mean, sd, n } } }, sites: { [siteCode]: {...} } }.
 * El total mensual de una planta es la suma de sus trabajadores en cada periodo. sd es muestral (n − 1).
 */
export function buildHistoryStats(employees = []) {
  const empSeries = {};
  const siteSeries = {};
  for (const e of employees) {
    for (const h of e.history || []) {
      const total = Number(h.total);
      if (!h.category || !Number.isFinite(total)) continue;
      const ek = e.employeeCode;
      empSeries[ek] ??= {};
      (empSeries[ek][h.category] ??= []).push(total);
      if (e.siteCode) {
        siteSeries[e.siteCode] ??= {};
        const byPeriod = (siteSeries[e.siteCode][h.category] ??= {});
        byPeriod[h.period] = (byPeriod[h.period] || 0) + total;
      }
    }
  }
  const result = { employees: {}, sites: {} };
  for (const [code, cats] of Object.entries(empSeries)) {
    result.employees[code] = {};
    for (const [cat, values] of Object.entries(cats)) result.employees[code][cat] = stats(values);
  }
  for (const [site, cats] of Object.entries(siteSeries)) {
    result.sites[site] = {};
    for (const [cat, byPeriod] of Object.entries(cats)) result.sites[site][cat] = stats(Object.values(byPeriod));
  }
  return result;
}

function isOutlier(total, hist, ctx) {
  if (!hist) return false;
  const minN = ctx.rule("outlier_min_history");
  const zMax = ctx.rule("outlier_z_score");
  if (!isNum(minN) || !isNum(zMax) || !(hist.n >= minN)) return false;
  const z = (total - Number(hist.mean)) / Math.max(Number(hist.sd) || 0, 1);
  return z > zMax;
}

/** RNG-001 (trabajador vs su historial) y RNG-002 (planta vs su historial, nivel lote). */
export function checkRange(rows, ctx, out) {
  const eligible = rows.filter(eligibleLegal);

  const byEmpCat = groupBy(
    eligible.filter((r) => r.employee),
    (r) => `${r.employee.employeeCode}|${r.category}`,
  );
  for (const list of byEmpCat.values()) {
    const { employee, category } = list[0];
    const total = list.reduce((a, r) => a + r.quantity, 0);
    const hist = ctx.history.employees?.[employee.employeeCode]?.[category];
    if (!isOutlier(total, hist, ctx)) continue;
    const last = list.reduce((a, b) => (b.rowNumber > a.rowNumber ? b : a));
    out.add("RNG-001", {
      rowNumber: last.rowNumber,
      field: "quantity",
      value: String(round2(total)),
      params: {
        employeeCode: employee.employeeCode,
        total: round2(total),
        mean: hist.mean,
        sd: hist.sd,
        category,
        categoryLabel: CATEGORY_LABELS[category] || category,
      },
    });
  }

  const siteHist = ctx.history.sites?.[ctx.siteCode];
  if (!siteHist) return;
  for (const [category, list] of groupBy(eligible, (r) => r.category)) {
    const total = list.reduce((a, r) => a + r.quantity, 0);
    const hist = siteHist[category];
    if (!isOutlier(total, hist, ctx)) continue;
    out.add("RNG-002", {
      field: "quantity",
      value: String(round2(total)),
      params: { total: round2(total), mean: hist.mean, sd: hist.sd, category, categoryLabel: CATEGORY_LABELS[category] || category },
    });
  }
}
