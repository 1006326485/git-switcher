import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageSettings } from "./LanguageSettings";
import { applyLanguageChoice } from "../lib/i18n";

function openDropdown() {
  fireEvent.click(screen.getByRole("button", { expanded: false }));
}

afterEach(() => {
  applyLanguageChoice("en");
});

describe("LanguageSettings", () => {
  it("offers following the system plus every language in its own script", async () => {
    render(<LanguageSettings onSelect={vi.fn()} />);
    openDropdown();

    expect(await screen.findByRole("option", { name: /Follow system/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /English/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /简体中文/ })).toBeInTheDocument();
  });

  it("reports the chosen language to the parent", async () => {
    const onSelect = vi.fn();
    render(<LanguageSettings onSelect={onSelect} />);
    openDropdown();

    fireEvent.click(await screen.findByRole("option", { name: /简体中文/ }));

    expect(onSelect).toHaveBeenCalledWith("zh-CN");
  });

  it("renders the stored preference as the selection", async () => {
    applyLanguageChoice("zh-CN");
    render(<LanguageSettings onSelect={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "界面语言" })).toHaveTextContent("简体中文");
  });

  it("translates its own labels when the interface language changes", async () => {
    render(<LanguageSettings onSelect={vi.fn()} />);

    expect(screen.getByText("Language")).toBeInTheDocument();
    applyLanguageChoice("zh-CN");

    expect(await screen.findByText("语言")).toBeInTheDocument();
  });
});
