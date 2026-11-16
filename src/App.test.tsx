import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

// The app bootstraps an authenticated session and a router; an unauthenticated visit
// is redirected to the sign-in screen.
beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, "", "/");
});

test("renders the sign-in screen for anonymous visitors", async () => {
  render(<App />);
  expect(await screen.findByText(/welcome back/i)).toBeInTheDocument();
});
