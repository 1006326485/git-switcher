import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialsSettings } from "./CredentialsSettings";
import * as api from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  getGitCredentials: vi.fn(),
  upsertGitCredential: vi.fn(),
  deleteGitCredential: vi.fn(),
}));

const sample = {
  id: "c1",
  project_path: "",
  remote_url: "https://github.com/acme/web.git",
  username: "alice",
  secret: "s3cr3t",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CredentialsSettings", () => {
  it("lists credentials with the secret masked", async () => {
    vi.mocked(api.getGitCredentials).mockResolvedValue([sample]);
    render(<CredentialsSettings onError={() => {}} />);

    expect(await screen.findByText("https://github.com/acme/web.git")).toBeTruthy();
    expect(screen.getByText((t) => t.includes("alice"))).toBeTruthy();
    // Secret must never be rendered in plaintext.
    expect(screen.queryByText("s3cr3t")).toBeNull();
    expect(screen.getAllByText("••••••••").length).toBeGreaterThan(0);
  });

  it("saves a new credential through the upsert wrapper", async () => {
    vi.mocked(api.getGitCredentials).mockResolvedValue([]);
    vi.mocked(api.upsertGitCredential).mockResolvedValue(undefined);
    render(<CredentialsSettings onError={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("https://github.com/acme/web.git"), {
      target: { value: "https://github.com/acme/web.git" },
    });
    fireEvent.change(screen.getByPlaceholderText("git username"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByPlaceholderText("token or password"), {
      target: { value: "tok" },
    });
    fireEvent.click(screen.getByText("Add"));

    await waitFor(() =>
      expect(api.upsertGitCredential).toHaveBeenCalledWith(
        expect.objectContaining({
          remote_url: "https://github.com/acme/web.git",
          username: "alice",
          secret: "tok",
        })
      )
    );
  });

  it("reports load failures via onError", async () => {
    vi.mocked(api.getGitCredentials).mockRejectedValue(new Error("boom"));
    const onError = vi.fn();
    render(<CredentialsSettings onError={onError} />);

    await waitFor(() => expect(onError).toHaveBeenCalled());
  });
});
