"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/states";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div style={{ paddingTop: 24 }}>
      <EmptyState
        icon="⚠️"
        title="Something went wrong loading this page"
        hint={error.message || "An unexpected error occurred. Your data is safe."}
        action={
          <button className="btn pri" onClick={reset}>
            Try again
          </button>
        }
      />
    </div>
  );
}
