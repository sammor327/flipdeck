import { ReleasesView } from "@/components/ReleasesView";

export default function ReleasesPage() {
  return (
    <>
      <h1>Releases &amp; News</h1>
      <div className="sub" style={{ marginBottom: 18 }}>
        Know when the market will shift — set releases, rotations, and ban lists — plus the community headlines driving prices.
      </div>
      <ReleasesView />
    </>
  );
}
