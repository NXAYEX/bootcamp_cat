import { isValidNationalId } from "./nationalId.js";

/**
 * IDN-001…006. Resuelve `r.employee`. Con identificador nacional válido se busca por él;
 * si solo viene el código, por código. Si vienen ambos y no coinciden → IDN-006.
 */
export function checkIdentity(rows, ctx, out) {
  for (const r of rows) {
    const hasId = Boolean(r.nationalId);
    const code = r.employeeCodeRaw;
    if (!hasId && !code) continue;

    let employee = null;
    if (hasId) {
      if (!isValidNationalId(r.nationalId, ctx.validator, ctx.idRegex)) {
        r.flags.add("IDN-001");
        out.add("IDN-001", { rowNumber: r.rowNumber, field: "national_id", value: r.nationalIdMasked });
        continue;
      }
      employee = ctx.byNationalId.get(r.nationalId) || null;
      if (!employee) {
        r.flags.add("IDN-002");
        out.add("IDN-002", { rowNumber: r.rowNumber, field: "national_id", value: r.nationalIdMasked });
        continue;
      }
    } else {
      employee = ctx.byCode.get(code) || null;
      if (!employee) {
        r.flags.add("IDN-002");
        out.add("IDN-002", { rowNumber: r.rowNumber, field: "employee_code", value: code });
        continue;
      }
    }
    r.employee = employee;
    const employeeCode = employee.employeeCode;

    if (hasId && code && code !== String(employeeCode).toUpperCase()) {
      out.add("IDN-006", {
        rowNumber: r.rowNumber,
        field: "employee_code",
        value: code,
        params: { employeeCode: code, nationalIdMasked: r.nationalIdMasked },
      });
    }
    if (ctx.siteCode && employee.siteCode && employee.siteCode !== ctx.siteCode) {
      out.add("IDN-003", {
        rowNumber: r.rowNumber,
        field: "national_id",
        value: employeeCode,
        params: { employeeCode, employeeSite: employee.siteCode },
      });
    }
    if (r.date && employee.terminationDate && r.date > employee.terminationDate) {
      out.add("IDN-004", {
        rowNumber: r.rowNumber,
        field: "date",
        value: r.date,
        params: { employeeCode, terminationDate: employee.terminationDate, date: r.date },
      });
    }
    if (r.date && employee.hireDate && r.date < employee.hireDate) {
      out.add("IDN-005", {
        rowNumber: r.rowNumber,
        field: "date",
        value: r.date,
        params: { employeeCode, hireDate: employee.hireDate, date: r.date },
      });
    }
  }
}
