import { useCallback, useEffect, useState } from "react";

// Ejecuta una función de servicio ({ data, error }) y expone loading/error/reload.
export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps);

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const res = await load();
    setState({ data: res?.data ?? null, error: res?.error ?? null, loading: false });
  }, [load]);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then((res) => {
      if (active) setState({ data: res?.data ?? null, error: res?.error ?? null, loading: false });
    });
    return () => {
      active = false;
    };
  }, [load]);

  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}
