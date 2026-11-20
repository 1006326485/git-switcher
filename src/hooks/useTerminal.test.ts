import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTerminal } from "./useTerminal";
import * as api from "../lib/tauri";

/**
 * The hook talks to a real xterm in the app; here it talks to a stand-in that
 * keeps the `BufferService` semantics the viewport fix depends on (see
 * `src/lib/terminalViewport.test.ts`).
 */
const { terminals, FakeTerminal } = vi.hoisted(() => {
  const created: FakeTerminal[] = [];
  class FakeTerminal {
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};
    ydisp = 0;
    baseY = 0;
    isUserScrolling = false;
    scrollAmounts: number[] = [];
    scrollEvents: number[] = [];
    selection = "";
    selectedAll = false;
    cleared = false;
    onDataHandler: ((data: string) => void) | null = null;
    onTitleChangeHandler: ((title: string) => void) | null = null;
    constructor() {
      created.push(this);
    }
    get buffer() {
      return { active: { viewportY: this.ydisp, baseY: this.baseY } };
    }
    loadAddon() {}
    open() {}
    focus() {}
    dispose() {}
    onData(handler: (data: string) => void) {
      this.onDataHandler = handler;
      return { dispose() {} };
    }
    onTitleChange(handler: (title: string) => void) {
      this.onTitleChangeHandler = handler;
      return { dispose() {} };
    }
    /** Stands in for the shell writing OSC 0/2. */
    emitTitle(title: string) {
      this.onTitleChangeHandler?.(title);
    }
    getSelection() {
      return this.selection;
    }
    selectAll() {
      this.selectedAll = true;
    }
    clear() {
      this.cleared = true;
    }
    write(_data: unknown, callback?: () => void) {
      callback?.();
    }
    scrollLines(amount: number) {
      this.scrollAmounts.push(amount);
      if (amount < 0) {
        if (this.ydisp === 0) return;
        this.isUserScrolling = true;
      } else if (amount + this.ydisp >= this.baseY) {
        this.isUserScrolling = false;
      }
      const next = Math.max(Math.min(this.ydisp + amount, this.baseY), 0);
      if (next !== this.ydisp) {
        this.ydisp = next;
        this.scrollEvents.push(next);
      }
    }
  }
  return { terminals: created, FakeTerminal };
});

vi.mock("@xterm/xterm", () => ({ Terminal: FakeTerminal }));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("../lib/tauri", () => ({
  terminalList: vi.fn(() => Promise.resolve([])),
  terminalOpen: vi.fn(() => Promise.resolve({ id: "t1", cwd: "/tmp", title: "zsh" })),
  terminalWrite: vi.fn(() => Promise.resolve()),
  terminalResize: vi.fn(() => Promise.resolve()),
  terminalClose: vi.fn(() => Promise.resolve()),
  terminalReorder: vi.fn(() => Promise.resolve()),
  terminalSetTitle: vi.fn(() => Promise.resolve()),
}));

describe("useTerminal viewport resync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    terminals.length = 0;
  });

  it("re-aligns the viewport when a session becomes visible again", async () => {
    const { result } = renderHook(() => useTerminal());
    await act(async () => {});

    act(() => {
      result.current.attachTerminal("t1", document.createElement("div"));
    });
    const term = terminals[0];

    // What the terminal looks like after its container was `display:none` for
    // a while: the buffer still says "at the tail", but xterm's own scroll
    // area is stale and the viewport revolted into user-scrolling, so new
    // output lands below the fold until the user scrolls down by hand.
    term.baseY = 577;
    term.ydisp = 577;
    term.isUserScrolling = true;

    act(() => {
      result.current.fitTerminal("t1");
    });

    expect(term.scrollEvents.length).toBeGreaterThan(0);
    expect(term.buffer.active.viewportY).toBe(577);
    expect(term.isUserScrolling).toBe(false);
  });

  it("does not disturb a session that has no scrollback yet", async () => {
    const { result } = renderHook(() => useTerminal());
    await act(async () => {});

    act(() => {
      result.current.attachTerminal("t1", document.createElement("div"));
    });
    const term = terminals[0];

    act(() => {
      result.current.fitTerminal("t1");
    });

    expect(term.scrollAmounts).toEqual([]);
  });

  it("ignores a session that was never attached", async () => {
    const { result } = renderHook(() => useTerminal());
    await act(async () => {});

    expect(() => {
      act(() => {
        result.current.fitTerminal("missing");
      });
    }).not.toThrow();
  });
});

describe("useTerminal canvas handles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    terminals.length = 0;
  });

  it("reads the selection, selects all and clears through the xterm instance", async () => {
    const { result } = renderHook(() => useTerminal());
    await act(async () => {});
    act(() => {
      result.current.attachTerminal("t1", document.createElement("div"));
    });
    const term = terminals[0];
    term.selection = "hello world";

    expect(result.current.getSelection("t1")).toBe("hello world");

    act(() => {
      result.current.selectAll("t1");
      result.current.clearScreen("t1");
    });
    expect(term.selectedAll).toBe(true);
    expect(term.cleared).toBe(true);
  });

  it("sends pasted input down the same pty path as typing", async () => {
    const { result } = renderHook(() => useTerminal());
    await act(async () => {});
    act(() => {
      result.current.attachTerminal("t1", document.createElement("div"));
    });
    const term = terminals[0];

    act(() => {
      result.current.sendInput("t1", "echo hi\r");
    });
    expect(api.terminalWrite).toHaveBeenCalledWith("t1", "echo hi\r");

    // The typing path must reach the backend identically.
    act(() => {
      term.onDataHandler?.("ls\r");
    });
    expect(api.terminalWrite).toHaveBeenCalledWith("t1", "ls\r");
  });

  it("no-ops every handle for a session that was never attached", async () => {
    const { result } = renderHook(() => useTerminal());
    await act(async () => {});

    expect(result.current.getSelection("missing")).toBe("");
    expect(() => {
      act(() => {
        result.current.selectAll("missing");
        result.current.clearScreen("missing");
        result.current.sendInput("missing", "x");
      });
    }).not.toThrow();
    expect(api.terminalWrite).not.toHaveBeenCalled();
  });
});

describe("useTerminal reordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    terminals.length = 0;
  });

  const sessions = [
    { id: "a", cwd: "/tmp/p", title: "zsh", projectTitle: "p", projectKey: "/tmp/p", exited: false },
    { id: "b", cwd: "/tmp/p", title: "node", projectTitle: "p", projectKey: "/tmp/p", exited: false },
  ];
  const ids = (list: { id: string }[]) => list.map((s) => s.id);

  it("shows the new order at once and mirrors it to the backend", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(sessions);
    const { result } = renderHook(() => useTerminal());
    await act(async () => {});
    expect(ids(result.current.sessions)).toEqual(["a", "b"]);

    await act(async () => {
      result.current.reorderSessions(["b", "a"]);
    });
    expect(ids(result.current.sessions)).toEqual(["b", "a"]);
    expect(api.terminalReorder).toHaveBeenCalledWith(["b", "a"]);
  });

  it("re-reads the backend order when the reorder is refused", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(sessions);
    vi.mocked(api.terminalReorder).mockRejectedValueOnce(new Error("reorder expected 2 sessions, got 1"));
    const { result } = renderHook(() => useTerminal());
    await act(async () => {});

    await act(async () => {
      result.current.reorderSessions(["b", "a"]);
    });
    // A drop that lost a race with another window must not leave this one
    // showing an order the backend does not have.
    expect(api.terminalList).toHaveBeenCalledTimes(2);
    expect(ids(result.current.sessions)).toEqual(["a", "b"]);
  });
});

describe("useTerminal tab titles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    terminals.length = 0;
  });

  it("forwards the shell's own title report, once per change", async () => {
    const { result } = renderHook(() => useTerminal());
    await act(async () => {});
    act(() => {
      result.current.attachTerminal("t1", document.createElement("div"));
    });
    const term = terminals[0];

    act(() => {
      term.emitTitle("  ~/projects/git-switcher  ");
    });
    expect(api.terminalSetTitle).toHaveBeenCalledWith("t1", "~/projects/git-switcher");

    // A prompt re-reports the same title every time it draws: only a real
    // change is worth a round trip, and an empty report never blanks a tab.
    act(() => {
      term.emitTitle("~/projects/git-switcher");
      term.emitTitle("   ");
    });
    expect(api.terminalSetTitle).toHaveBeenCalledTimes(1);

    act(() => {
      term.emitTitle("vim src/App.tsx");
    });
    expect(api.terminalSetTitle).toHaveBeenLastCalledWith("t1", "vim src/App.tsx");
  });
});

