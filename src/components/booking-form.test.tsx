import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BookingFormState } from "@/app/[org]/events/[event]/actions";
import type { SeatMap } from "@/server/repositories/events";
import { BookingForm } from "./booking-form";
import { POLL_INTERVAL_MS } from "./use-live-taken-seats";

const sections: SeatMap = [
  {
    id: "floor",
    name: "Floor",
    priceMinor: 8000,
    seats: [
      { id: "f-a1", row: "A", number: 1, taken: false },
      { id: "f-a2", row: "A", number: 2, taken: true },
      { id: "f-a3", row: "A", number: 3, taken: false },
    ],
  },
  {
    id: "balcony",
    name: "Balcony",
    priceMinor: 5000,
    seats: [{ id: "b-a1", row: "A", number: 1, taken: false }],
  },
];

function renderForm(
  action = jest.fn(async (): Promise<BookingFormState> => ({ status: "idle" })),
  maxSeats = 6,
  userOptions: Parameters<typeof userEvent.setup>[0] = {},
) {
  render(
    <BookingForm
      action={action}
      sections={sections}
      currency="JPY"
      maxSeats={maxSeats}
      idempotencyKey="form-key"
      availabilityUrl="/api/v1/organizations/harbor-hall/events/test"
    />,
  );
  return { action, user: userEvent.setup(userOptions) };
}

const seat = (name: string) => screen.getByRole("checkbox", { name });

describe("BookingForm", () => {
  it("shows taken seats as disabled", () => {
    renderForm();

    expect(seat("Floor, row A, seat 2, taken")).toBeDisabled();
    expect(seat("Floor, row A, seat 1")).toBeEnabled();
  });

  it("adds selected seats to the summary and total", async () => {
    const { user } = renderForm();

    await user.click(seat("Floor, row A, seat 1"));
    await user.click(seat("Balcony, row A, seat 1"));

    const summary = screen.getByRole("region", { name: "Your selection" });
    expect(within(summary).getByText("Floor · Row A · Seat 1")).toBeInTheDocument();
    expect(within(summary).getByText("Balcony · Row A · Seat 1")).toBeInTheDocument();
    expect(screen.getByTestId("booking-total")).toHaveTextContent("¥13,000");
    expect(screen.getByRole("button", { name: "Continue to payment · 2 seats · ¥13,000" })).toBeEnabled();
  });

  it("books free seats directly instead of continuing to payment", async () => {
    const free: SeatMap = [
      { id: "hall", name: "Hall", priceMinor: 0, seats: [{ id: "h-a1", row: "A", number: 1, taken: false }] },
    ];
    render(
      <BookingForm
        action={jest.fn()}
        sections={free}
        currency="JPY"
        maxSeats={6}
        idempotencyKey="k"
        availabilityUrl="/api/v1/organizations/kyoto-chamber/events/open-rehearsal"
      />,
    );

    await userEvent.setup().click(seat("Hall, row A, seat 1"));

    expect(screen.getByText("Hall")).toHaveTextContent("Hall · Free");
    expect(screen.getByRole("button", { name: "Book 1 seat" })).toBeEnabled();
  });

  it("removes a seat when it is clicked again", async () => {
    const { user } = renderForm();

    await user.click(seat("Floor, row A, seat 1"));
    await user.click(seat("Floor, row A, seat 1"));

    expect(screen.getByText("No seats selected yet.")).toBeInTheDocument();
    expect(screen.getByTestId("booking-total")).toHaveTextContent("¥0");
  });

  it("disables the remaining seats once the limit is reached", async () => {
    const { user } = renderForm(undefined, 1);

    await user.click(seat("Floor, row A, seat 1"));

    expect(seat("Floor, row A, seat 3")).toBeDisabled();
    // The selected seat itself stays enabled so it can be deselected.
    expect(seat("Floor, row A, seat 1")).toBeEnabled();
  });

  it("marks seats lost to another customer and keeps the entered values", async () => {
    const action = jest.fn(async (): Promise<BookingFormState> => ({
      status: "error",
      message: "Sorry, one of your seats was just booked by someone else. Choose another seat.",
      takenSeatIds: ["f-a1"],
      values: { customerName: "Aiko Tanaka", customerEmail: "aiko@example.com" },
    }));
    const { user } = renderForm(action);

    await user.click(seat("Floor, row A, seat 1"));
    await user.click(seat("Floor, row A, seat 3"));
    await user.type(screen.getByLabelText("Full name"), "Aiko Tanaka");
    await user.type(screen.getByLabelText("Email"), "aiko@example.com");
    await act(() => user.click(screen.getByRole("button", { name: /Continue to payment · 2 seats/ })));

    expect(await screen.findByRole("alert")).toHaveTextContent("just booked by someone else");
    expect(seat("Floor, row A, seat 1, taken")).toBeDisabled();
    // Seat 3 is still selected; seat 1 dropped out of the total.
    expect(screen.getByTestId("booking-total")).toHaveTextContent("¥8,000");
    expect(screen.getByLabelText("Full name")).toHaveValue("Aiko Tanaka");
    expect(screen.getByLabelText("Email")).toHaveValue("aiko@example.com");
  });

  // Regression: React's automatic form reset unchecked the seat checkboxes after a
  // failed submit, while the summary still listed them as selected.
  it("keeps the seat checkboxes checked after a failed submit", async () => {
    const action = jest.fn(async (): Promise<BookingFormState> => ({
      status: "error",
      fieldErrors: { customerName: "Enter your name." },
    }));
    const { user } = renderForm(action);

    await user.click(seat("Floor, row A, seat 1"));
    await act(() => user.click(screen.getByRole("button", { name: /Continue to payment · 1 seat/ })));

    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(seat("Floor, row A, seat 1")).toBeChecked();
    const submitted = action.mock.calls[0] as unknown as [BookingFormState, FormData];
    expect(submitted[1].getAll("seatIds")).toEqual(["f-a1"]);
  });

  it("submits the idempotency key of this form, so a resubmit cannot book twice", async () => {
    const action = jest.fn(async (): Promise<BookingFormState> => ({ status: "error", message: "Try again." }));
    const { user } = renderForm(action);

    await user.click(seat("Floor, row A, seat 1"));
    await act(() => user.click(screen.getByRole("button", { name: /Continue to payment · 1 seat/ })));
    await act(() => user.click(screen.getByRole("button", { name: /Continue to payment · 1 seat/ })));

    const keys = action.mock.calls.map((call) =>
      (call as unknown as [BookingFormState, FormData])[1].get("idempotencyKey"),
    );
    expect(keys).toEqual(["form-key", "form-key"]);
  });

  it("connects field errors to their inputs", async () => {
    const action = jest.fn(async (): Promise<BookingFormState> => ({
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: { customerEmail: "Enter a valid email address, like name@example.com." },
      values: { customerName: "Aiko", customerEmail: "aiko@" },
    }));
    const { user } = renderForm(action);

    await act(() => user.click(screen.getByRole("button", { name: "Book seats" })));

    const email = await screen.findByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription(
      "Needed to manage or cancel your booking. Enter a valid email address, like name@example.com.",
    );
  });
});

describe("BookingForm live seat map", () => {
  // The API answer for the seat map above, with the given seats taken.
  function apiResponse(takenIds: string[]) {
    const body = {
      data: {
        sections: sections.map((section) => ({
          name: section.name,
          priceMinor: section.priceMinor,
          seats: section.seats.map(({ id, row, number }) => ({ id, row, number, available: !takenIds.includes(id) })),
        })),
      },
    };
    return { ok: true, json: async () => body } as Response;
  }

  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const nextPoll = () => act(() => jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
  // user-event waits between steps with setTimeout, which is fake in these tests.
  const withFakeTimers = { advanceTimers: (ms: number) => jest.advanceTimersByTimeAsync(ms) };

  it("removes a selected seat that someone else just booked, and says so", async () => {
    const { user } = renderForm(undefined, 6, withFakeTimers);
    await user.click(seat("Floor, row A, seat 1"));
    await user.click(seat("Floor, row A, seat 3"));

    fetchMock.mockResolvedValue(apiResponse(["f-a2", "f-a1"]));
    await nextPoll();

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/organizations/harbor-hall/events/test", expect.anything());
    expect(seat("Floor, row A, seat 1, taken")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Floor · Row A · Seat 1 was just booked by someone else and was removed from your selection.",
    );
    expect(screen.getByTestId("booking-total")).toHaveTextContent("¥8,000");
  });

  it("frees a seat that was released by a cancellation", async () => {
    renderForm();
    expect(seat("Floor, row A, seat 2, taken")).toBeDisabled();

    fetchMock.mockResolvedValue(apiResponse([]));
    await nextPoll();

    expect(seat("Floor, row A, seat 2")).toBeEnabled();
  });

  it("keeps the last known map when a poll fails, and tries again", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    renderForm();

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await nextPoll();
    expect(seat("Floor, row A, seat 2, taken")).toBeDisabled();

    fetchMock.mockResolvedValue(apiResponse(["f-a3"]));
    await nextPoll();
    expect(seat("Floor, row A, seat 3, taken")).toBeDisabled();
    warn.mockRestore();
  });

  it("stops polling while the tab is hidden and catches up when it is visible again", async () => {
    let visibility: DocumentVisibilityState = "visible";
    jest.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    fetchMock.mockResolvedValue(apiResponse(["f-a2"]));
    renderForm();

    visibility = "hidden";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(() => jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5));
    expect(fetchMock).not.toHaveBeenCalled();

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
