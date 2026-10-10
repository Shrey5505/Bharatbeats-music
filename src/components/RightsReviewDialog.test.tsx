import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RightsReviewDialog } from "./RightsReviewDialog";

const record = {
  id: "record-1",
  title: "Open recording",
  creator: "Artist",
  album: "Album",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
};

describe("rights review dialog", () => {
  it("blocks playback confirmation until the listener verifies the source rights", () => {
    const onConfirm = vi.fn();
    render(<RightsReviewDialog record={record} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const confirmButton = screen.getByRole("button", { name: "Verify file & play" });
    expect(confirmButton).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("links directly to the source item and its declared license", () => {
    render(<RightsReviewDialog record={record} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Review Archive item/ })).toHaveAttribute(
      "href",
      "https://archive.org/details/record-1",
    );
    expect(screen.getByRole("link", { name: /Declared license: CC BY 4.0/ })).toHaveAttribute(
      "href",
      record.licenseUrl,
    );
  });
});
