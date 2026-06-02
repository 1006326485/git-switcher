import { memo, useState } from "react";
import { Modal, Tabs } from "./ui/primitives";
import { LlmSettings } from "./LlmSettings";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onError: (msg: string) => void;
}

export const SettingsDialog = memo(function SettingsDialog({ open, onClose, onError }: SettingsDialogProps) {
  const [tab, setTab] = useState<"llm" | "about">("llm");

  return (
    <Modal open={open} onClose={onClose} title="Settings" maxWidth="max-w-lg">
      <Tabs
        tabs={[
          { value: "llm", label: "AI Review" },
          { value: "about", label: "About" },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="px-6 py-5">
        {tab === "llm" && <LlmSettings onError={onError} />}
        {tab === "about" && (
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Git Switcher v1.0.0</p>
            <p>Multi-repo Git management tool with AI-powered code review.</p>
            <div className="text-xs text-gray-400">
              <p>Built with Tauri v2 + React + TypeScript + Rust</p>
              <p>AI Review uses OpenAI-compatible API (GPT, Claude, Ollama, etc.)</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
});
