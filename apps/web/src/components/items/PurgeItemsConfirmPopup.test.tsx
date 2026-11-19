import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import PurgeItemsConfirmPopup from "./PurgeItemsConfirmPopup";

const t = (key: string) => key;

describe("PurgeItemsConfirmPopup", () => {
  it("renders single permanent-delete copy and confirms", () => {
    const onConfirm = vi.fn();
    render(
      <PurgeItemsConfirmPopup open mode="single" t={t} onClose={() => undefined} onConfirm={onConfirm} />,
    );

    expect(screen.getByText("web.purgeItemsConfirmPopup.titleSingle")).toBeInTheDocument();
    expect(screen.getByText("web.purgeItemsConfirmPopup.descriptionSingle")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "web.purgeItemsConfirmPopup.deletePermanently" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders empty-trash copy", () => {
    render(
      <PurgeItemsConfirmPopup
        open
        mode="emptyTrash"
        t={t}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(screen.getByText("web.purgeItemsConfirmPopup.emptyTrashTitle")).toBeInTheDocument();
    expect(screen.getByText("web.purgeItemsConfirmPopup.emptyTrashDescription")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "web.purgeItemsConfirmPopup.emptyTrashConfirm" }),
    ).toBeInTheDocument();
  });

  it("hides when closed", () => {
    const { container } = render(
      <PurgeItemsConfirmPopup
        open={false}
        mode="single"
        t={t}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
