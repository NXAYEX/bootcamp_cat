// Registro de algoritmos de identificador nacional. El país elige el algoritmo por dato
// (countries.national_id_validator), nunca por código de país.

function rutDv(body) {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}

const VALIDATORS = {
  rut_mod11: {
    normalize(value) {
      const s = String(value).replace(/[.\s]/g, "").toUpperCase();
      if (!s) return "";
      if (s.includes("-")) return s;
      return s.length >= 2 ? `${s.slice(0, -1)}-${s.slice(-1)}` : s;
    },
    validate(normalized) {
      const m = normalized.match(/^(\d{7,8})-([\dK])$/);
      return Boolean(m) && rutDv(m[1]) === m[2];
    },
  },
  regex: {
    normalize(value) {
      return String(value).replace(/\s/g, "").toUpperCase();
    },
    validate(normalized, { regex } = {}) {
      if (!regex) return normalized.length > 0;
      try {
        return new RegExp(regex).test(normalized);
      } catch {
        return false;
      }
    },
  },
};

export const NATIONAL_ID_VALIDATORS = Object.keys(VALIDATORS);

export function normalizeNationalId(value, validator = "rut_mod11") {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const v = VALIDATORS[validator] ?? VALIDATORS.regex;
  return v.normalize(String(value).trim());
}

export function isValidNationalId(value, validator = "rut_mod11", regex = null) {
  const normalized = normalizeNationalId(value, validator);
  if (!normalized) return false;
  const v = VALIDATORS[validator];
  if (!v) return false;
  return v.validate(normalized, { regex });
}

/** Enmascara: 2 primeros caracteres + ".***.***-" + último ("12.***.***-K"). */
export function maskNationalId(value, validator = "rut_mod11") {
  const normalized = normalizeNationalId(value, validator);
  if (!normalized) return null;
  const compact = normalized.replace(/-/g, "");
  if (compact.length < 3) return "***";
  return `${compact.slice(0, 2)}.***.***-${compact.slice(-1)}`;
}
