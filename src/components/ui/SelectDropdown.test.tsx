import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SelectDropdown, type SelectOption } from "./SelectDropdown";

/**
 * Requirement: whatever the search query — typing, clearing, replacing, or
 * an async list that changes under the query — the highlight is the FIRST
 * match, so Enter always runs the top of the CURRENT result set.
 */

const options: SelectOption[] = [
  { value: "main", label: "main" },
  { value: "feature/a", label: "feature/a" },
  { value: "feature/b", label: "feature/b" },
  { value: "release", label: "release" },
  { value: "hotfix", label: "hotfix" },
  { value: "docs", label: "docs" },
];

function highlighted(listbox: HTMLElement): string | null {
  // aria-selected marks the committed value; the highlight (what Enter runs)
  // is the row carrying the active background class.
  const selected = Array.from(listbox.querySelectorAll('[role="option"]')).find((el) =>
    el.className.includes("bg-gray-100")
  );
  return selected?.textContent ?? null;
}

describe("SelectDropdown search highlight", () => {
  beforeEach(() => {
    class ObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView = vi.fn();
  });

  function renderDropdown(onChange = vi.fn()) {
    render(
      <SelectDropdown
        options={options}
        value=""
        onChange={onChange}
        ariaLabel="Picker"
        preferredValue="feature/b"
      />
    );
    return onChange;
  }

  it("highlights the preferred value on open, then the first match on search", async () => {
    renderDropdown();
    fireEvent.click(screen.getByRole("button", { name: "Picker" }));
    const listbox = await screen.findByRole("listbox");

    // Open (no query): the caller's preferred highlight still wins.
    await waitFor(() => expect(highlighted(listbox)).toBe("feature/b"));

    const search = screen.getByRole("textbox", { name: "Search options" });
    fireEvent.change(search, { target: { value: "f" } });
    // Two matches, neither at the preferred index: the FIRST one wins.
    await waitFor(() => expect(highlighted(listbox)).toBe("feature/a"));
  });

  it("re-highlights the first match on every keystroke, including clearing", async () => {
    renderDropdown();
    fireEvent.click(screen.getByRole("button", { name: "Picker" }));
    const listbox = await screen.findByRole("listbox");
    const search = await screen.findByRole("textbox", { name: "Search options" });

    // "ture" matches "feature" at the same position and equally tightly in
    // both labels, so ranking keeps the source order (release is excluded).
    fireEvent.change(search, { target: { value: "ture" } });
    await waitFor(() => expect(highlighted(listbox)).toBe("feature/a"));

    // Arrow moves away from the first match…
    fireEvent.keyDown(search, { key: "ArrowDown" });
    await waitFor(() => expect(highlighted(listbox)).not.toBe("feature/a"));

    // …then the next keystroke puts it back on the first match.
    fireEvent.change(search, { target: { value: "fea" } });
    await waitFor(() => expect(highlighted(listbox)).toBe("feature/a"));

    fireEvent.change(search, { target: { value: "rel" } });
    await waitFor(() => expect(highlighted(listbox)).toBe("release"));
  });

  it("Enter after a search runs the first match, not an old index", async () => {
    const onChange = renderDropdown();
    fireEvent.click(screen.getByRole("button", { name: "Picker" }));
    await screen.findByRole("listbox");
    const search = await screen.findByRole("textbox", { name: "Search options" });

    // Only labels are searched, so "o" matches hotfix and docs. Both contain
    // it mid-word, and the shorter label is the closer fit: docs comes first.
    fireEvent.change(search, { target: { value: "o" } });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("docs"));
  });

  it("Enter runs an initials match that the plain substring misses", async () => {
    const onChange = renderDropdown();
    fireEvent.click(screen.getByRole("button", { name: "Picker" }));
    await screen.findByRole("listbox");
    const search = await screen.findByRole("textbox", { name: "Search options" });

    // Nothing contains "hfi" literally; its letters start hotfix's words.
    fireEvent.change(search, { target: { value: "hfi" } });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("hotfix"));
  });

  it("keeps the search field while the result list shrinks below the threshold", async () => {
    renderDropdown();
    fireEvent.click(screen.getByRole("button", { name: "Picker" }));
    await screen.findByRole("listbox");
    const search = await screen.findByRole("textbox", { name: "Search options" });
    fireEvent.change(search, { target: { value: "docs" } });
    // One result left: the field must stay, or the query would be lost.
    expect(screen.getByRole("textbox", { name: "Search options" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });
});

describe("SelectDropdown fuzzy search", () => {
  beforeEach(() => {
    class ObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView = vi.fn();
  });

  // More than the five-option threshold, so the search field is rendered.
  const projects: SelectOption[] = [
    { value: "gcf-something-else", label: "gcf-something-else" },
    { value: "gcf-player", label: "gcf-player" },
    { value: "backend", label: "backend" },
    { value: "frontend", label: "frontend" },
    { value: "docs", label: "docs" },
    { value: "infra", label: "infra" },
  ];

  function renderProjects(onChange = vi.fn()) {
    render(<SelectDropdown options={projects} value="" onChange={onChange} ariaLabel="Projects" />);
    return onChange;
  }

  it("finds a hyphenated option from its initials", async () => {
    renderProjects();
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    await screen.findByRole("listbox");
    const search = await screen.findByRole("textbox", { name: "Search options" });

    fireEvent.change(search, { target: { value: "gcfp" } });
    // Only the letters g-c-f-p in order match: gcf-player.
    await waitFor(() =>
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["gcf-player"])
    );
  });

  it("ranks the tightest match first so Enter runs it", async () => {
    const onChange = renderProjects();
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    await screen.findByRole("listbox");
    const search = await screen.findByRole("textbox", { name: "Search options" });

    fireEvent.change(search, { target: { value: "gcf" } });
    // Both start with "gcf"; the compact candidate outranks the longer one.
    await waitFor(() =>
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
        "gcf-player",
        "gcf-something-else",
      ])
    );
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("gcf-player"));
  });
});
