import { Loader2 } from "lucide-react";

const VARIANTS = {
  primary: "bg-petroleo text-white hover:bg-petroleo-hover",
  secondary: "bg-superficie text-pizarra border border-linea hover:border-pizarra/40 hover:bg-papel",
  danger: "bg-bloqueado text-white hover:bg-[#861C15]",
  ghost: "text-petroleo hover:bg-petroleo-suave",
};

// Botón con estados completos: hover, foco visible, deshabilitado y cargando.
export default function Button({ variant = "primary", loading = false, loadingText, icon: Icon, children, className = "", disabled, type = "button", ...props }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}
