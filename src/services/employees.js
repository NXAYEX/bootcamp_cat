import { run } from "./client";

// Cruce contra el maestro: solo devuelve empleados cuyos RUT o códigos ya vienen en el archivo.
export const matchEmployees = (countryCode, nationalIds, employeeCodes) =>
  run((sb) =>
    sb.rpc("match_employees", {
      p_country_code: countryCode,
      p_national_ids: nationalIds,
      p_employee_codes: employeeCodes,
    })
  );

export const listSiteEmployees = (siteId) =>
  run((sb) =>
    sb
      .from("employees_directory")
      .select("id, employee_code, national_id_masked, first_name, last_name, site_code, hire_date, termination_date, leave_balance_days, weekly_hours, active")
      .eq("site_id", siteId)
      .order("last_name")
      .limit(5000)
  );

export const getEmployeeHistoryStats = (siteCode) =>
  run((sb) => sb.from("employee_history_stats").select("employee_code, site_code, category, mean, sd, n").eq("site_code", siteCode));

export const getSiteHistoryStats = (siteCode) =>
  run((sb) => sb.from("site_history_stats").select("site_code, category, mean, sd, n").eq("site_code", siteCode));
