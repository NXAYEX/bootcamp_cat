import { Loader2 } from "lucide-react";

export default function FullPageStatus({ message }) {
  return (
    <div role="status" className="flex min-h-screen items-center justify-center gap-2 text-sm text-niebla">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {message}
    </div>
  );
}
