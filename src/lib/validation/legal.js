import { isoWeek } from "./normalize.js";
import { byDateThenRow, eligibleLegal, employeeKey, employeeLabel, groupBy, round2 } from "./prepare.js";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** LEG-001 a LEG-005. Topes y jornada vienen de country_rules vía ctx.rule (con vigencia). */
export function checkLegal(rows, ctx, out) {
  const eligible = rows.filter(eligibleLegal);
  const byEmployee = groupBy(eligible, employeeKey);

  for (const empRows of byEmployee.values()) {
    const sorted = [...empRows].sort(byDateThenRow);
    const overtime = sorted.filter((r) => r.category === "overtime");

    // LEG-001: total diario acumulado; se reporta en la fila que supera el tope.
    for (const dayRows of groupBy(overtime, (r) => r.date).values()) {
      let total = 0;
      for (const r of dayRows) {
        total += r.quantity;
        const max = ctx.rule("max_overtime_hours_per_day", r.date);
        if (isNum(max) && total > max) {
          out.add("LEG-001", {
            rowNumber: r.rowNumber,
            field: "quantity",
            value: String(r.quantity),
            params: { quantity: round2(total), date: r.date, max },
          });
          break;
        }
      }
    }

    // LEG-002: semana ISO; un hallazgo por trabajador y semana.
    for (const [week, weekRows] of groupBy(overtime, (r) => isoWeek(r.date))) {
      let total = 0;
      for (const r of weekRows) {
        total += r.quantity;
        const max = ctx.rule("max_overtime_hours_per_week", r.date);
        if (isNum(max) && total > max) {
          out.add("LEG-002", {
            rowNumber: r.rowNumber,
            field: "quantity",
            value: String(r.quantity),
            params: { total: round2(total), week, max, employeeCode: employeeLabel(r) },
          });
          break;
        }
      }
    }

    const employee = sorted[0]?.employee;

    // LEG-003: días de feriado acumulados contra el saldo del trabajador.
    const hasBalance = employee && employee.leaveBalanceDays !== null && employee.leaveBalanceDays !== undefined;
    if (hasBalance && isNum(Number(employee.leaveBalanceDays))) {
      const balance = Number(employee.leaveBalanceDays);
      let total = 0;
      for (const r of sorted.filter((x) => x.category === "vacation")) {
        total += r.quantity;
        if (total > balance) {
          out.add("LEG-003", {
            rowNumber: r.rowNumber,
            field: "quantity",
            value: String(r.quantity),
            params: { total: round2(total), balance, employeeCode: employee.employeeCode },
          });
          break;
        }
      }
    }

    // LEG-005: una vez por trabajador y lote, en su primera fila, con la jornada vigente al inicio del periodo.
    if (employee && employee.weeklyHours !== null && employee.weeklyHours !== undefined) {
      const max = ctx.rule("weekly_hours_limit", ctx.periodStart);
      const weeklyHours = Number(employee.weeklyHours);
      if (isNum(max) && weeklyHours > max) {
        const first = empRows.reduce((a, b) => (b.rowNumber < a.rowNumber ? b : a));
        out.add("LEG-005", {
          rowNumber: first.rowNumber,
          field: "employee_code",
          value: employee.employeeCode,
          params: { employeeCode: employee.employeeCode, weeklyHours, max },
        });
      }
    }
  }

  // LEG-004: el concepto exige respaldo y la fila no lo trae.
  for (const r of eligible) {
    if (r.concept.requiresSupport && !r.supportRef) {
      out.add("LEG-004", { rowNumber: r.rowNumber, field: "support_ref", value: null, params: { conceptCode: r.conceptCode } });
    }
  }
}
