import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeeConcessions } from "@/components/finance/FeeConcessions";
import { RecordPaymentContext, useRecordPayment } from "@/components/finance/RecordPaymentContext";
import { RecordPaymentProvider } from "@/components/finance/RecordPaymentProvider";
import { FinanceProvider, useFinance } from "@/finance/store";
import { markApplicationReviewed, recordDocumentVerification } from "@/finance/feeWorkflow";
import { formatDate, formatINR, TODAY } from "@/finance/logic";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useNavigate: () => vi.fn() };
});

beforeEach(() => {
  window.localStorage.removeItem("finance-concessions-v1");
});

function renderConcessions() {
  return render(
    <FinanceProvider>
      <RecordPaymentContext.Provider value={{ open: vi.fn() }}>
        <FeeConcessions />
      </RecordPaymentContext.Provider>
    </FinanceProvider>,
  );
}

describe("Fee Concessions UI", () => {
  it("moves each explicitly verified sample application into Billing once", async () => {
    function BillingLinkProbe() {
      const { feeWorkflow, students, updateFeeWorkflowPerson } = useFinance();
      const samples = ["APP2026-130", "APP2026-131"].map((applicationId) =>
        feeWorkflow.persons.find((person) => person.applicationId === applicationId)!,
      );
      const verify = (person: (typeof samples)[number]) => {
        let reviewed = person;
        for (const document of person.applicationDetails!.documents) {
          const result = recordDocumentVerification(reviewed, document, "Approved");
          if (result.ok) reviewed = result.person;
        }
        updateFeeWorkflowPerson(markApplicationReviewed(reviewed));
      };
      return (
        <>
          {samples.map((person) => (
            <button key={person.id} onClick={() => verify(person)}>
              Verify {person.applicationId}
            </button>
          ))}
          {samples.map((person) => (
            <output key={person.id} data-testid={person.applicationId}>
              {students.filter((student) => student.applicationId === person.applicationId).length}
            </output>
          ))}
        </>
      );
    }

    render(
      <FinanceProvider>
        <BillingLinkProbe />
      </FinanceProvider>,
    );
    expect(screen.getByTestId("APP2026-130")).toHaveTextContent("0");
    expect(screen.getByTestId("APP2026-131")).toHaveTextContent("0");
    fireEvent.click(screen.getByRole("button", { name: "Verify APP2026-130" }));
    fireEvent.click(screen.getByRole("button", { name: "Verify APP2026-131" }));
    await waitFor(() => {
      expect(screen.getByTestId("APP2026-130")).toHaveTextContent("1");
      expect(screen.getByTestId("APP2026-131")).toHaveTextContent("1");
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify APP2026-130" }));
    await waitFor(() => expect(screen.getByTestId("APP2026-130")).toHaveTextContent("1"));
  });

  it("forwards a concession without an Accounts Reviewer field and preserves its reason", async () => {
    renderConcessions();
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim()),
    ).toEqual([
      "Sl. No.",
      "Concession No.",
      "Application No.",
      "Student",
      "Course",
      "Requested Amt",
      "Status",
      "Details",
    ]);
    const row = within(table).getByText("FC-2026-001").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("Pending Accounts Review")).toBeInTheDocument();
    expect(within(row!).getAllByRole("cell")[5]).toHaveTextContent(/^₹[\d,]+$/);
    fireEvent.click(within(row!).getByRole("button", { name: "View Details" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Accounts Review & Forwarding")).toBeInTheDocument();
    expect(within(dialog).queryByText("Earlier Director Decision History")).toBeNull();
    expect(within(dialog).queryByLabelText("Accounts Reviewer")).toBeNull();
    expect(within(dialog).getByText("Review Date").parentElement).toHaveTextContent(
      formatDate(TODAY),
    );
    expect(within(dialog).getByText("Forwarded to Director")).toBeInTheDocument();
    expect(within(dialog).getByText("Forwarding Date").parentElement).toHaveTextContent("—");
    expect(within(dialog).getByRole("button", { name: "Send to Director" })).toBeEnabled();
    expect(within(dialog).getByText("Reason for Concession").parentElement).toHaveTextContent(
      "Sibling currently enrolled in the Data Science programme.",
    );
    expect(within(dialog).queryByLabelText("Reason for Concession")).toBeNull();
    expect(within(dialog).getByText("Director Response")).toBeInTheDocument();
    expect(within(dialog).queryByText("Financial Impact")).toBeNull();
    expect(within(dialog).getByText("Billing Information")).toBeInTheDocument();
    expect(within(dialog).getByText("Director Decision & Activity History")).toBeInTheDocument();

    const sectionNumbers = Array.from(dialog.querySelectorAll("section > h3 span"))
      .map((number) => number.textContent?.trim())
      .filter(Boolean);
    expect(sectionNumbers).toEqual(["01", "02", "03", "04", "05"]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Send to Director" }));
    await waitFor(() => {
      expect(within(dialog).getByText("Forwarding Date").parentElement).not.toHaveTextContent("—");
      expect(within(dialog).queryByRole("button", { name: "Send to Director" })).toBeNull();
      expect(within(dialog).getAllByText("Pending Director Decision").length).toBeGreaterThan(1);
    });
  }, 15000);

  it("keeps Director decisions read-only and displays only the decision and date", async () => {
    renderConcessions();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Decision History" }), {
      button: 0,
      ctrlKey: false,
    });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Decision History" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    const table = screen.getByRole("table");
    const row = within(table).getByText("FC-2026-007").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getAllByText("Rejected").length).toBeGreaterThan(0);
    fireEvent.click(within(row!).getByRole("button", { name: "View Details" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "03 Director Response" }),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText("Rejected").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("Decision Date").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("Director Remarks")).toBeNull();
    expect(within(dialog).queryByText("Response Source")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /approve|reject/i })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /clarification|return/i })).toBeNull();
  });

  it("persists the approved fee plan and installment breakdown across provider refresh", async () => {
    function PersistenceProbe() {
      const { concessions, students, applyConcession } = useFinance();
      const { open } = useRecordPayment();
      const request = concessions.find((item) => item.id === "FCR-SIM-5");
      const student = students.find((item) => item.id === request?.personId);
      return (
        <>
          <output data-testid="persisted-status">{request?.status}</output>
          <output data-testid="persisted-plan">
            {JSON.stringify(
              student?.installments.map((installment) => ({
                original: installment.originalAmount ?? installment.amount,
                concession: installment.concessionAmount ?? 0,
                revised: installment.amount,
              })),
            )}
          </output>
          <button onClick={() => applyConcession("FCR-SIM-5")}>
            Apply simulated approved request
          </button>
          {request && student && (
            <button onClick={() => open(request.personId)}>Open Payment Procedure</button>
          )}
        </>
      );
    }

    const first = render(
      <FinanceProvider>
        <RecordPaymentProvider>
          <PersistenceProbe />
        </RecordPaymentProvider>
      </FinanceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply simulated approved request" }));
    await waitFor(() =>
      expect(screen.getByTestId("persisted-status")).toHaveTextContent("Approved"),
    );
    const savedPlan = screen.getByTestId("persisted-plan").textContent;
    expect(savedPlan).toContain('"concession":');
    expect(savedPlan).not.toBeNull();
    const stored = JSON.parse(window.localStorage.getItem("finance-concessions-v1") ?? "[]") as {
      id: string;
      status: string;
      applied?: { planAfter: { originalAmount?: number; concessionAmount?: number }[] };
      history: { text: string }[];
    }[];
    const savedRequest = stored.find((item) => item.id === "FCR-SIM-5");
    expect(savedRequest?.status).toBe("Approved");
    expect(savedRequest?.applied?.planAfter.some((item) => (item.concessionAmount ?? 0) > 0)).toBe(
      true,
    );
    expect(savedRequest?.history.some((entry) => entry.text.includes("applied by Accounts"))).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Payment Procedure" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Original amount")).toBeInTheDocument();
    expect(within(dialog).getByText("Fee Concession")).toBeInTheDocument();
    expect(within(dialog).getByText("Revised payable")).toBeInTheDocument();
    expect(within(dialog).getByText("Outstanding", { selector: "th" })).toBeInTheDocument();
    const concessionTotal = (savedRequest?.applied?.planAfter ?? []).reduce(
      (total, installment) => total + (installment.concessionAmount ?? 0),
      0,
    );
    const schedule = within(dialog).getAllByRole("table")[0]!;
    expect(within(schedule).getAllByText(formatINR(concessionTotal)).length).toBeGreaterThan(0);
    const admissionFeeRow = within(schedule).getByText("Admission Fee").closest("tr");
    expect(admissionFeeRow?.cells[3]?.textContent).toBe(formatINR(0));
    expect(within(dialog).getByText("Payment History")).toBeInTheDocument();
    first.unmount();

    render(
      <FinanceProvider>
        <RecordPaymentProvider>
          <PersistenceProbe />
        </RecordPaymentProvider>
      </FinanceProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("persisted-status")).toHaveTextContent("Approved"),
    );
    expect(screen.getByTestId("persisted-plan").textContent).toBe(savedPlan);
    fireEvent.click(screen.getByRole("button", { name: "Open Payment Procedure" }));
    const reopenedDialog = await screen.findByRole("dialog");
    expect(within(reopenedDialog).getByText("Original amount")).toBeInTheDocument();
    expect(
      within(within(reopenedDialog).getAllByRole("table")[0]!).getAllByText(
        formatINR(concessionTotal),
      ).length,
    ).toBeGreaterThan(0);
  });
});
