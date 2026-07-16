import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectDetail, TaskWorkspace, TaskWorkspaceDetail, TaskWorkspacePlan, TaskWorkspaceExecution, TaskWorkspaceOutcome, TaskStrategy } from "../lib/types";
import * as api from "../lib/tauri";
import { Modal } from "./ui/primitives";
import { OperationConfirmDialog } from "./OperationConfirmDialog";

interface TaskWorkspaceDialogProps {
  open: boolean;
  projects: ProjectDetail[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function TaskWorkspaceDialog({ open, projects, onClose, onSuccess, onError }: TaskWorkspaceDialogProps) {
  const [workspaces, setWorkspaces] = useState<TaskWorkspace[]>([]);
  const [selected, setSelected] = useState<TaskWorkspaceDetail | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectIds, setProjectIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [plan, setPlan] = useState<TaskWorkspacePlan | null>(null);
  const [execution, setExecution] = useState<TaskWorkspaceExecution | null>(null);
  const [outcomes, setOutcomes] = useState<TaskWorkspaceOutcome[]>([]);
  const [confirmExecute, setConfirmExecute] = useState(false);

  const load = useCallback(async () => {
    try { setWorkspaces(await api.listTaskWorkspaces(showArchived)); }
    catch (error) { onError(String(error)); }
  }, [onError, showArchived]);

  useEffect(() => { if (open) { setSelected(null); load(); } }, [open, load]);

  const toggleProject = (id: string) => setProjectIds((current) => {
    const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const create = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const detail = await api.createTaskWorkspace({ name: name.trim(), description: description.trim() || null, project_ids: [...projectIds] });
      setSelected(detail); setName(""); setDescription(""); setProjectIds(new Set()); await load();
      onSuccess(`Created task workspace "${detail.workspace.name}"`);
    } catch (error) { onError(String(error)); } finally { setLoading(false); }
  };

  const openWorkspace = async (id: string) => {
    setLoading(true);
    try { setPlan(null); const detail = await api.getTaskWorkspace(id); setSelected(detail); setOutcomes(await api.listTaskWorkspaceOutcomes(id)); } catch (error) { onError(String(error)); } finally { setLoading(false); }
  };

  const archive = async () => {
    if (!selected) return;
    setLoading(true);
    try { await api.archiveTaskWorkspace(selected.workspace.id); setSelected(null); await load(); onSuccess("Task workspace archived"); }
    catch (error) { onError(String(error)); } finally { setLoading(false); }
  };

  const activeProjects = useMemo(() => projects.filter((project) => !selected?.entries.some((entry) => entry.project.id === project.project.id)), [projects, selected]);

  return <Modal open={open} onClose={onClose} title="Task Workspaces" maxWidth="max-w-2xl">
    <div className="px-6 py-5 space-y-4">
      {selected ? <>
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="font-semibold text-gray-900 dark:text-gray-100">{selected.workspace.name}</h3><p className="text-xs text-gray-500">{selected.workspace.description || "No description"}</p></div>
          <div className="flex gap-2"><button onClick={() => { setPlan(null); setSelected(null); }} className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700">All tasks</button><button onClick={async () => { try { setLoading(true); setPlan(await api.preflightTaskWorkspace(selected.workspace.id)); } catch (error) { onError(String(error)); } finally { setLoading(false); } }} disabled={loading} className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">Preflight</button><button onClick={() => setConfirmExecute(true)} disabled={loading || !plan || plan.entries.some((item) => item.status === "blocked" || item.status === "unavailable" || item.status === "needs_decision")} className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 disabled:opacity-50">Execute plan</button><button onClick={archive} disabled={loading} className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">Archive</button></div>
        </div>
        {(execution || outcomes.length > 0) && <div className="rounded border border-[var(--border-color)] p-2 space-y-1"><p className="text-xs font-semibold">Execution outcomes</p>{(execution?.outcomes || outcomes).map((item) => <p key={item.id} className="text-xs"><span className="font-medium">{item.state}</span> — {item.message}</p>)}</div>}
        {plan && <div className="rounded border border-[var(--border-color)] p-2 space-y-2"><p className="text-xs font-semibold">Read-only preflight</p>{plan.entries.map((item) => <div key={item.entry.entry.id} className="text-xs"><span className="font-medium">{item.entry.project.name}</span><span className="ml-2 rounded px-1 bg-gray-100 dark:bg-gray-700">{item.status}</span>{item.reasons.map((reason) => <p key={reason} className="text-amber-600 dark:text-amber-400">{reason}</p>)}</div>)}</div>}
        <div className="space-y-2">
          {selected.entries.map(({ entry, project }) => <div key={entry.id} className="rounded border border-[var(--border-color)] p-2 space-y-2 text-sm"><div className="flex justify-between"><span>{project.name}<span className="ml-2 font-mono text-xs text-gray-500">{project.path}</span></span><span className="flex gap-2"><button onClick={async () => { const ids = selected.entries.map((item) => item.entry.id); const index = ids.indexOf(entry.id); if (index < 1) return; [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; try { setSelected(await api.reorderTaskWorkspaceEntries(selected.workspace.id, ids)); } catch (error) { onError(String(error)); } }} className="text-xs">↑</button><button onClick={async () => { const ids = selected.entries.map((item) => item.entry.id); const index = ids.indexOf(entry.id); if (index === -1 || index >= ids.length - 1) return; [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]; try { setSelected(await api.reorderTaskWorkspaceEntries(selected.workspace.id, ids)); } catch (error) { onError(String(error)); } }} className="text-xs">↓</button><button onClick={async () => { try { setSelected(await api.removeTaskWorkspaceProject(selected.workspace.id, entry.id)); } catch (error) { onError(String(error)); } }} className="text-xs text-red-600">Remove</button></span></div><div className="grid grid-cols-3 gap-2"><select value={entry.strategy} onChange={async (event) => { try { setSelected(await api.updateTaskWorkspaceEntry(selected.workspace.id, entry.id, { strategy: event.target.value as TaskStrategy, target_branch: entry.target_branch, base_branch: entry.base_branch, worktree_path: entry.worktree_path, sort_order: entry.sort_order })); } catch (error) { onError(String(error)); } }} className="text-xs rounded border border-[var(--border-color)] bg-[var(--surface-1)]"><option value="retain_current">retain current</option><option value="switch_existing">switch branch</option><option value="create_branch">create branch</option><option value="create_worktree">create worktree</option><option value="reuse_worktree">reuse worktree</option></select><input value={entry.target_branch || ""} placeholder="target branch" onBlur={async (event) => { try { setSelected(await api.updateTaskWorkspaceEntry(selected.workspace.id, entry.id, { strategy: entry.strategy, target_branch: event.target.value, base_branch: entry.base_branch, worktree_path: entry.worktree_path, sort_order: entry.sort_order })); } catch (error) { onError(String(error)); } }} className="text-xs px-1 rounded border border-[var(--border-color)] bg-[var(--surface-1)]"/><input value={entry.worktree_path || ""} placeholder="worktree path" onBlur={async (event) => { try { setSelected(await api.updateTaskWorkspaceEntry(selected.workspace.id, entry.id, { strategy: entry.strategy, target_branch: entry.target_branch, base_branch: entry.base_branch, worktree_path: event.target.value, sort_order: entry.sort_order })); } catch (error) { onError(String(error)); } }} className="text-xs px-1 rounded border border-[var(--border-color)] bg-[var(--surface-1)]"/></div></div>)}
          {selected.entries.length === 0 && <p className="text-sm text-gray-500">No repositories in this task yet.</p>}
        </div>
        {activeProjects.length > 0 && <div className="border-t border-[var(--border-color)] pt-3"><p className="text-xs font-medium mb-2">Add registered repository</p><div className="flex flex-wrap gap-2">{activeProjects.map(({ project }) => <button key={project.id} onClick={async () => { try { setSelected(await api.addTaskWorkspaceProject(selected.workspace.id, project.id)); } catch (error) { onError(String(error)); } }} className="px-2 py-1 text-xs rounded bg-[var(--surface-2)] border border-[var(--border-color)]">+ {project.name}</button>)}</div></div>}
      </> : <>
        <div className="rounded-lg border border-[var(--border-color)] p-3 space-y-2">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Task name (for example PAY-482)" className="w-full px-3 py-2 rounded border border-[var(--border-color)] bg-[var(--surface-1)] text-sm" />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional task description" className="w-full px-3 py-2 rounded border border-[var(--border-color)] bg-[var(--surface-1)] text-sm" rows={2} />
          <div className="max-h-28 overflow-y-auto grid grid-cols-2 gap-1">{projects.map(({ project }) => <label key={project.id} className="text-xs flex gap-2 p-1"><input type="checkbox" checked={projectIds.has(project.id)} onChange={() => toggleProject(project.id)} />{project.name}</label>)}</div>
          <button onClick={create} disabled={loading || !name.trim()} className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-sm disabled:opacity-50">Create task workspace</button>
        </div>
        <label className="text-xs flex gap-2"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Show archived</label>
        <div className="space-y-2">{workspaces.map((workspace) => <button key={workspace.id} onClick={() => openWorkspace(workspace.id)} className="w-full text-left rounded border border-[var(--border-color)] p-3 hover:bg-[var(--surface-2)]"><div className="flex justify-between"><span className="font-medium">{workspace.name}</span><span className="text-xs text-gray-500">{workspace.status}</span></div><p className="text-xs text-gray-500 truncate">{workspace.description || "No description"}</p></button>)}{workspaces.length === 0 && <p className="text-sm text-gray-500">Create a task to coordinate work across repositories.</p>}</div>
      </>}
    </div>
    {confirmExecute && plan && <OperationConfirmDialog open operation="task_workspace_execute" targets={plan.entries.map((item) => ({ path: item.entry.project.path, label: item.entry.project.name }))} onConfirm={async () => { try { setLoading(true); setExecution({ workspace_id: plan.workspace_id, executed_at: new Date().toISOString(), outcomes: plan.entries.map((item) => ({ id: `pending-${item.entry.entry.id}`, workspace_id: plan.workspace_id, entry_id: item.entry.entry.id, state: "pending", message: `Waiting to execute ${item.entry.project.name}`, start_branch: item.observed_branch, start_head: item.observed_head, result_branch: null, worktree_path: item.entry.entry.worktree_path, created_at: new Date().toISOString() })) }); const result = await api.executeTaskWorkspacePlan(plan); setExecution(result); setOutcomes(result.outcomes); } catch (error) { onError(String(error)); } finally { setLoading(false); setConfirmExecute(false); } }} onCancel={() => setConfirmExecute(false)} />}
  </Modal>;
}
