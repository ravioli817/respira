// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
import { describe, it, expect } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useErrorPopoverState } from "./useErrorPopoverState";

describe("useErrorPopoverState", () => {
  const hasError = (error: number | undefined) =>
    error !== undefined && error !== 0;

  it("should start with popover closed", () => {
    const { result } = renderHook(() =>
      useErrorPopoverState({
        machineError: undefined,
        machineErrorMessage: null,
        pyodideError: null,
        hasError,
      }),
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.wasManuallyDismissed).toBe(false);
    expect(result.current.dismissedErrorCode).toBeNull();
  });

  it("should auto-open when machine error appears", () => {
    const { result, rerender } = renderHook(
      ({ machineError }) =>
        useErrorPopoverState({
          machineError,
          machineErrorMessage: null,
          pyodideError: null,
          hasError,
        }),
      { initialProps: { machineError: undefined as number | undefined } },
    );

    expect(result.current.isOpen).toBe(false);

    // Error appears
    rerender({ machineError: 1 as number | undefined });
    expect(result.current.isOpen).toBe(true);
  });

  it("should auto-open when machine error message appears", () => {
    const { result, rerender } = renderHook(
      ({ machineErrorMessage }) =>
        useErrorPopoverState({
          machineError: undefined,
          machineErrorMessage,
          pyodideError: null,
          hasError,
        }),
      { initialProps: { machineErrorMessage: null as string | null } },
    );

    expect(result.current.isOpen).toBe(false);

    rerender({ machineErrorMessage: "Error occurred" as string | null });
    expect(result.current.isOpen).toBe(true);
  });

  it("should auto-open when pyodide error appears", () => {
    const { result, rerender } = renderHook(
      ({ pyodideError }) =>
        useErrorPopoverState({
          machineError: undefined,
          machineErrorMessage: null,
          pyodideError,
          hasError,
        }),
      { initialProps: { pyodideError: null as string | null } },
    );

    expect(result.current.isOpen).toBe(false);

    rerender({ pyodideError: "Pyodide error" as string | null });
    expect(result.current.isOpen).toBe(true);
  });

  it("should auto-close when all errors are cleared", () => {
    const { result, rerender } = renderHook(
      ({ machineError }) =>
        useErrorPopoverState({
          machineError,
          machineErrorMessage: null,
          pyodideError: null,
          hasError,
        }),
      { initialProps: { machineError: 1 } },
    );

    expect(result.current.isOpen).toBe(true);

    // Clear error
    rerender({ machineError: 0 });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.wasManuallyDismissed).toBe(false);
    expect(result.current.dismissedErrorCode).toBeNull();
  });

  it("should track manual dismissal", async () => {
    const { result } = renderHook(
      ({ machineError }) =>
        useErrorPopoverState({
          machineError,
          machineErrorMessage: null,
          pyodideError: null,
          hasError,
        }),
      { initialProps: { machineError: 1 } },
    );

    expect(result.current.isOpen).toBe(true);

    // Manually dismiss
    act(() => {
      result.current.handleOpenChange(false);
    });

    await waitFor(() => {
      expect(result.current.isOpen).toBe(false);
    });
    expect(result.current.wasManuallyDismissed).toBe(true);
    expect(result.current.dismissedErrorCode).toBe(1);
  });

  it("should not auto-reopen after manual dismissal", async () => {
    const { result, rerender } = renderHook(
      ({ machineError }) =>
        useErrorPopoverState({
          machineError,
          machineErrorMessage: null,
          pyodideError: null,
          hasError,
        }),
      { initialProps: { machineError: 1 } },
    );

    // Manually dismiss
    act(() => {
      result.current.handleOpenChange(false);
    });

    await waitFor(() => {
      expect(result.current.wasManuallyDismissed).toBe(true);
    });

    // Try to reopen by changing error (but same error code)
    rerender({ machineError: 1 });
    expect(result.current.isOpen).toBe(false);
  });

  it("should auto-open for new error after manual dismissal and error clear", async () => {
    const { result, rerender } = renderHook(
      ({ machineError }) =>
        useErrorPopoverState({
          machineError,
          machineErrorMessage: null,
          pyodideError: null,
          hasError,
        }),
      { initialProps: { machineError: 1 } },
    );

    // Manually dismiss error 1
    act(() => {
      result.current.handleOpenChange(false);
    });

    await waitFor(() => {
      expect(result.current.dismissedErrorCode).toBe(1);
    });

    // Clear all errors first (this resets wasManuallyDismissed)
    rerender({ machineError: 0 });

    await waitFor(() => {
      expect(result.current.wasManuallyDismissed).toBe(false);
    });

    // New error appears (error 2)
    rerender({ machineError: 2 });

    // Should auto-open since manual dismissal was reset
    await waitFor(() => {
      expect(result.current.isOpen).toBe(true);
    });
  });

  it("should reset dismissal tracking when all errors clear", async () => {
    const { result, rerender } = renderHook(
      ({ machineError }) =>
        useErrorPopoverState({
          machineError,
          machineErrorMessage: null,
          pyodideError: null,
          hasError,
        }),
      { initialProps: { machineError: 1 } },
    );

    // Manually dismiss
    act(() => {
      result.current.handleOpenChange(false);
    });

    await waitFor(() => {
      expect(result.current.wasManuallyDismissed).toBe(true);
    });

    // Clear error
    rerender({ machineError: 0 });

    await waitFor(() => {
      expect(result.current.wasManuallyDismissed).toBe(false);
    });
    expect(result.current.dismissedErrorCode).toBeNull();
  });

  it("should handle multiple error sources", () => {
    const { result, rerender } = renderHook(
      ({
        machineError,
        machineErrorMessage,
        pyodideError,
      }: {
        machineError: number | undefined;
        machineErrorMessage: string | null;
        pyodideError: string | null;
      }) =>
        useErrorPopoverState({
          machineError,
          machineErrorMessage,
          pyodideError,
          hasError,
        }),
      {
        initialProps: {
          machineError: undefined as number | undefined,
          machineErrorMessage: null as string | null,
          pyodideError: null as string | null,
        },
      },
    );

    expect(result.current.isOpen).toBe(false);

    // Machine error appears
    rerender({
      machineError: 1 as number | undefined,
      machineErrorMessage: null as string | null,
      pyodideError: null as string | null,
    });
    expect(result.current.isOpen).toBe(true);

    // Additional pyodide error
    rerender({
      machineError: 1 as number | undefined,
      machineErrorMessage: null as string | null,
      pyodideError: "Pyodide error" as string | null,
    });
    expect(result.current.isOpen).toBe(true);

    // Clear machine error but pyodide error remains
    rerender({
      machineError: 0 as number | undefined,
      machineErrorMessage: null as string | null,
      pyodideError: "Pyodide error" as string | null,
    });
    // Should stay open because pyodide error still exists
    expect(result.current.isOpen).toBe(true);

    // Clear all errors
    rerender({
      machineError: 0 as number | undefined,
      machineErrorMessage: null as string | null,
      pyodideError: null as string | null,
    });
    expect(result.current.isOpen).toBe(false);
  });
});

it("keeps inline Stitch errors from auto-opening a second overlay, while allowing manual details", () => {
  const hasError = (code: number | undefined) =>
    code !== undefined && code !== 0;
  const { result, rerender } = renderHook(
    ({ autoOpen, machineError }) =>
      useErrorPopoverState({
        autoOpen,
        machineError,
        machineErrorMessage: null,
        pyodideError: null,
        hasError,
      }),
    { initialProps: { autoOpen: false, machineError: 0 } },
  );
  rerender({ autoOpen: false, machineError: 1 });
  expect(result.current.isOpen).toBe(false);
  act(() => result.current.handleOpenChange(true));
  expect(result.current.isOpen).toBe(true);
  rerender({ autoOpen: false, machineError: 0 });
  expect(result.current.isOpen).toBe(false);
  rerender({ autoOpen: true, machineError: 2 });
  expect(result.current.isOpen).toBe(true);
  rerender({ autoOpen: false, machineError: 2 });
  expect(result.current.isOpen).toBe(false);
});
