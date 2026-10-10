import { useEffect } from "react";

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Validador de Novedades` : "Validador de Novedades";
  }, [title]);
}
