import { SkeletonRows } from "@/components/states";

export default function Loading() {
  return (
    <div>
      <div className="skeleton" style={{ height: 26, width: 220, marginBottom: 18 }} />
      <div className="tiles" style={{ marginBottom: 18 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="tile" key={i}>
            <div className="skeleton" style={{ height: 12, width: 90, marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 28, width: 120 }} />
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="skeleton" style={{ height: 14, width: 160, marginBottom: 14 }} />
        <SkeletonRows rows={6} cols={6} />
      </div>
    </div>
  );
}
