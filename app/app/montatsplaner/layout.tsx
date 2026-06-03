import type { ReactNode } from 'react';

/** Route-only wrapper so globals / layout can target monthly planner for edge-to-edge table. */
export default function MontatsplanerLayout({ children }: { children: ReactNode }) {
  return <div className="planner-fullwidth w-full min-w-0 max-w-[100vw]">{children}</div>;
}
