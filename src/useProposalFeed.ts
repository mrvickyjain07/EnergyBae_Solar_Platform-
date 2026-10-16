// src/useProposalFeed.ts
// One shared read of GET /api/proposals for the app shell — the header bell
// and the sidebar's review badge both use it (App.tsx calls it once and
// passes it down), so they never disagree. Refreshes every minute and when
// the tab regains focus; failures keep the last good list.
import { useCallback, useEffect, useState } from "react";
import type { FeedProposal } from "./notifications";

const POLL_MS = 60_000;

export function useProposalFeed(enabled: boolean) {
  const [proposals, setProposals] = useState<FeedProposal[] | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/proposals")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setProposals(d.proposals ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const t = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [enabled, refresh]);

  return { proposals, refresh };
}
