import { useQuery } from "@tanstack/react-query";

async function fetchHealth(): Promise<{ ok: boolean }> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return res.json();
}

export default function App() {
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth, retry: false });

  return (
    <div className="p-6">
      <p>Repsy Coach - setup OK</p>
      {health.data?.ok && <p>Server: OK</p>}
    </div>
  );
}
