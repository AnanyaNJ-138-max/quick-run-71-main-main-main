import { createFileRoute, redirect } from "@tanstack/react-router";

// Cash Flow moved into Financial Reports as the "Cash Flow" tab. The old
// standalone page now lands there with that tab pre-selected.
export const Route = createFileRoute("/budgets")({
  beforeLoad: () => {
    throw redirect({ to: "/reports", search: { tab: "cash-flow" }, replace: true });
  },
});
