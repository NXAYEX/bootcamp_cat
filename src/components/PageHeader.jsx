import { usePageTitle } from "../hooks/usePageTitle";

export default function PageHeader({ title, subtitle, actions }) {
  usePageTitle(title);
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-bold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-niebla">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
