import ApprovalsPanel from "../components/ApprovalsPanel";

/** Standalone page — redirects prefer Settings; kept for deep links. */
export default function Approvals() {
  return (
    <section className="h-full overflow-y-auto custom-scrollbar relative px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <ApprovalsPanel />
    </section>
  );
}
