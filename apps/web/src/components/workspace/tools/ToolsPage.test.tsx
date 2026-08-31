import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../../../locale/LocaleContext";
import ToolsPage from "./ToolsPage";

vi.mock("./import/ImportSection", () => ({
  default: () => <div data-testid="import-section">Import section</div>,
}));

function renderToolsPage(path = "/tools/generator") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocaleProvider>
        <Routes>
          <Route
            path="/tools/:sectionSlug"
            element={
              <ToolsPage workspaceName="Okkey team" vaults={[]} vaultsListReady />
            }
          />
        </Routes>
      </LocaleProvider>
    </MemoryRouter>,
  );
}

describe("ToolsPage", () => {
  it("renders settings-like breadcrumbs, sidebar, and the generator section", () => {
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
    expect(screen.getByRole("tab", { name: "Password" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Passphrase" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Username" })).toBeInTheDocument();
  });

  it("renders the import section when that route is active", () => {
    renderToolsPage("/tools/import");

    const sidebar = screen.getByRole("navigation", { name: "Tools sections" });
    expect(sidebar.querySelector('[aria-current="page"]')).toHaveAttribute("href", "/tools/import");
    expect(screen.getByTestId("import-section")).toBeInTheDocument();
    expect(screen.queryByText("This tool is coming soon.")).not.toBeInTheDocument();
  });
});
