import { run } from "./client";

export const getCountries = () =>
  run((sb) => sb.from("countries").select("id, code, name, national_id_label, national_id_validator, national_id_regex, active").order("code"));

export const getSites = () => run((sb) => sb.from("sites").select("id, code, name, country_code, active").order("code"));

export const getPeriods = (countryCode) =>
  run((sb) => {
    let q = sb.from("payroll_periods").select("id, country_code, period, status, cutoff_date").order("period", { ascending: false });
    if (countryCode) q = q.eq("country_code", countryCode);
    return q;
  });

export const getConcepts = (countryCode) =>
  run((sb) => {
    let q = sb.from("concepts").select("id, country_code, code, name, unit, category, requires_support, active").order("code");
    if (countryCode) q = q.eq("country_code", countryCode);
    return q;
  });

export const getCountryRules = (countryCode) =>
  run((sb) =>
    sb
      .from("country_rules")
      .select("id, country_code, rule_key, value_numeric, value_text, unit, description, legal_reference, procedure_keywords, valid_from, valid_to")
      .eq("country_code", countryCode)
      .order("rule_key")
      .order("valid_from")
  );

export const getValidationRules = (countryCode) =>
  run((sb) => {
    let q = sb.from("validation_rules").select("id, code, country_code, name, severity, owner, message_template, active").order("code");
    q = countryCode ? q.or(`country_code.is.null,country_code.eq.${countryCode}`) : q;
    return q;
  });

export const getColumnAliases = (countryCode) =>
  run((sb) =>
    sb
      .from("column_aliases")
      .select("id, country_code, field, alias")
      .or(countryCode ? `country_code.is.null,country_code.eq.${countryCode}` : "country_code.is.null")
  );

export const getChecklist = (countryCode) =>
  run((sb) =>
    sb
      .from("procedure_checklist_items")
      .select("id, country_code, code, title, description, weight, keywords, min_hits_full, min_hits_partial, uses_country_rules, question, suggested_text, sort_order, active")
      .or(countryCode ? `country_code.is.null,country_code.eq.${countryCode}` : "country_code.is.null")
      .order("sort_order")
  );
