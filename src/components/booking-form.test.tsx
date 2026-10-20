import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BookingFormState } from "@/app/[org]/events/[event]/actions";
import type { SeatMap } from "@/server/repositories/events";
import { BookingForm } from "./booking-form";

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

function renderForm(action = jest.fn(async (): Promise<BookingFormState> => ({ status: "idle" })), maxSeats = 6) {
  render(<BookingForm action={action} sections={sections} currency="JPY" maxSeats={maxSeats} />);
  return { action, user: userEvent.setup() };
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
    expect(screen.getByRole("button", { name: "Book 2 seats · ¥13,000" })).toBeEnabled();
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
    await act(() => user.click(screen.getByRole("button", { name: /Book 2 seats/ })));

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
    await act(() => user.click(screen.getByRole("button", { name: /Book 1 seat/ })));

    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(seat("Floor, row A, seat 1")).toBeChecked();
    const submitted = action.mock.calls[0] as unknown as [BookingFormState, FormData];
    expect(submitted[1].getAll("seatIds")).toEqual(["f-a1"]);
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
