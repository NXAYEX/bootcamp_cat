/** PER-002 (lote): el periodo declarado ya está cerrado. */
export function checkClosedPeriod(ctx, out) {
  if (ctx.period && ctx.closedPeriods.has(ctx.period)) {
    out.add("PER-002", { field: "period", value: ctx.period, params: { period: ctx.period } });
  }
}

/** PER-001 (fuera del mes declarado) y PER-003 (fecha futura respecto de `today`). */
export function checkRowPeriod(rows, ctx, out) {
  for (const r of rows) {
    if (!r.date) continue;
    if (ctx.period && r.date.slice(0, 7) !== ctx.period) {
      r.flags.add("PER-001");
      out.add("PER-001", { rowNumber: r.rowNumber, field: "date", value: r.date, params: { date: r.date } });
    }
    if (ctx.today && r.date > ctx.today) {
      r.flags.add("PER-003");
      out.add("PER-003", { rowNumber: r.rowNumber, field: "date", value: r.date, params: { date: r.date } });
    }
  }
}
