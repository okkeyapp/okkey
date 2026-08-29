import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "../../../locale/LocaleContext";
import ToolsPage from "./ToolsPage";

function renderToolsPage(path = "/tools/generator") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocaleProvider>
        <Routes>
          <Route path="/tools/:sectionSlug" element={<ToolsPage workspaceName="Okkey team" />} />
        </Routes>
      </LocaleProvider>
    </MemoryRouter>,
  );
}

describe("ToolsPage", () => {
  it("renders settings-like breadcrumbs, sidebar, and a stub for the active tool", () => {
    renderToolsPage("/tools/generator");

    expect(screen.getByRole("navigation", { name: "Tools navigation" })).toHaveTextContent("Okkey team");
    expect(screen.getByRole("navigation", { name: "Tools navigation" })).toHaveTextContent("Tools");
    expect(screen.getByRole("navigation", { name: "Tools navigation" })).toHaveTextContent("Generator");

    const sidebar = screen.getByRole("navigation", { name: "Tools sections" });
    expect(sidebar).toHaveTextContent("Generator");
    expect(sidebar).toHaveTextContent("Import");
    expect(sidebar).toHaveTextContent("Export");
    expect(screen.getByRole("link", { name: "Import" })).toHaveAttribute("href", "/tools/import");
    expect(screen.getByRole("link", { name: "Export" })).toHaveAttribute("href", "/tools/export");

    expect(screen.getByRole("heading", { name: "Generator" })).toBeInTheDocument();
    expect(screen.getByText("This tool is coming soon.")).toBeInTheDocument();
  });

  it("shows the import stub when that section is active", () => {
    renderToolsPage("/tools/import");

    expect(screen.getByRole("heading", { name: "Import" })).toBeInTheDocument();
    const sidebar = screen.getByRole("navigation", { name: "Tools sections" });
    expect(sidebar.querySelector('[aria-current="page"]')).toHaveAttribute("href", "/tools/import");
  });
});
