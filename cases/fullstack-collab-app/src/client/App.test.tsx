import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("fullstack collaboration app", () => {
  it("registers a user, opens the kanban board, and persists card reorder", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.type(screen.getByLabelText("Email"), "builder@example.com");
    await user.type(screen.getByLabelText("Password"), "dragonboat");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Launch Board")).toBeInTheDocument();
    expect(screen.getByText("Backlog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Move API contract to Doing" }));

    await waitFor(() => {
      const doing = screen.getByRole("region", { name: "Doing" });
      expect(doing).toHaveTextContent("API contract");
    });
  });
});
