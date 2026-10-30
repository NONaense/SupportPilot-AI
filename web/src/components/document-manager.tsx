"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { apiUrl, getSupabaseClient } from "@/lib/supabase";

type Workspace = { id: string; name: string; role: string };
type DocumentItem = {
  id: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  status: "processing" | "ready" | "error";
  processing_error: string | null;
  extracted_characters: number;
  chunk_count: number;
  indexing_status: "pending" | "indexing" | "indexed" | "error";
  indexing_error: string | null;
};

export function DocumentManager({ workspace }: { workspace: Workspace }) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [deletingId, setDeletingId] = useState<string>();
  const [reindexingId, setReindexingId] = useState<string>();
  const canManage = workspace.role === "owner" || workspace.role === "admin";

  async function sessionToken() {
    const {
      data: { session },
    } = await getSupabaseClient().auth.getSession();
    if (!session) throw new Error("Your session has ended. Please sign in again.");
    return session.access_token;
  }

  async function loadDocuments() {
    try {
      const token = await sessionToken();
      const response = await fetch(`${apiUrl}/api/v1/workspaces/${workspace.id}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error((await response.json()).detail ?? "Could not load documents.");
      setDocuments(await response.json());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load documents.");
    }
  }

  useEffect(() => {
    setDocuments([]);
    setError(undefined);
    void loadDocuments();
  }, [workspace.id]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(undefined);
    setUploading(true);
    setProgress(0);
    try {
      const token = await sessionToken();
      const document = await uploadWithProgress(
        `${apiUrl}/api/v1/workspaces/${workspace.id}/documents`,
        token,
        file,
        setProgress
      );
      setDocuments((current) => [document, ...current]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload the document.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function remove(document: DocumentItem) {
    if (!window.confirm(`Delete ${document.original_filename}? This removes its extracted chunks too.`))
      return;
    setError(undefined);
    setDeletingId(document.id);
    try {
      const token = await sessionToken();
      const response = await fetch(
        `${apiUrl}/api/v1/workspaces/${workspace.id}/documents/${document.id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error((await response.json()).detail ?? "Could not delete the document.");
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the document.");
    } finally {
      setDeletingId(undefined);
    }
  }

  async function reindex(document: DocumentItem) {
    setError(undefined);
    setReindexingId(document.id);
    try {
      const token = await sessionToken();
      const response = await fetch(
        `${apiUrl}/api/v1/workspaces/${workspace.id}/documents/${document.id}/reindex`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error((await response.json()).detail ?? "Could not re-index the document.");
      const updated: DocumentItem = await response.json();
      setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not re-index the document.");
    } finally {
      setReindexingId(undefined);
    }
  }

  return (
    <section className="mt-7 card p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="eyebrow">Knowledge base</p>
          <h2 className="mt-3 text-xl font-extrabold text-slate-900 dark:text-white">
            {workspace.name} documents
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Private files are processed on the server and never exposed by public URL.
          </p>
        </div>
        {canManage && (
          <label className="button-primary cursor-pointer !py-2.5">
            <input
              accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
              className="sr-only"
              disabled={uploading}
              onChange={upload}
              type="file"
            />
            {uploading ? "Uploading…" : "+ Upload document"}
          </label>
        )}
      </div>

      {uploading && (
        <div className="mt-5">
          <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>Uploading, processing, and indexing</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-teal-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="mt-5 divide-y divide-slate-100 dark:divide-slate-800">
        {documents.length === 0 ? (
          <p className="py-6 text-sm text-slate-500 dark:text-slate-400">
            No documents yet.{" "}
            {canManage
              ? "Upload a PDF, TXT, or Markdown file (up to 10 MB)."
              : "Ask a workspace owner to add documents."}
          </p>
        ) : (
          documents.map((document) => (
            <article className="flex gap-3 py-4" key={document.id}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400">
                ▤
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                    {document.original_filename}
                  </p>
                  <Status status={document.status} />
                  <IndexStatus status={document.indexing_status} />
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {formatBytes(document.byte_size)} · {document.chunk_count} searchable chunks ·{" "}
                  {document.extracted_characters.toLocaleString()} characters
                </p>
                {document.status === "error" && document.processing_error && (
                  <p className="mt-2 text-xs text-rose-700 dark:text-rose-400">{document.processing_error}</p>
                )}
                {document.indexing_status === "error" && document.indexing_error && (
                  <p className="mt-2 text-xs text-rose-700 dark:text-rose-400">{document.indexing_error}</p>
                )}
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-2">
                  {document.status === "ready" && (
                    <button
                      type="button"
                      className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                        document.indexing_status === "error"
                          ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
                          : "border-slate-200 bg-white text-teal-700 hover:bg-teal-50 hover:border-teal-300 dark:border-slate-700 dark:bg-slate-800 dark:text-teal-400 dark:hover:bg-slate-700"
                      } disabled:opacity-50`}
                      disabled={document.indexing_status === "indexing" || reindexingId === document.id}
                      onClick={() => void reindex(document)}
                    >
                      {reindexingId === document.id || document.indexing_status === "indexing"
                        ? "Indexing…"
                        : document.indexing_status === "error"
                        ? "Retry index"
                        : "Re-index"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 disabled:opacity-50"
                    disabled={deletingId === document.id}
                    onClick={() => void remove(document)}
                  >
                    {deletingId === document.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function Status({ status }: { status: DocumentItem["status"] }) {
  const styles = {
    ready: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400",
    processing: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
    error: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${styles[status]}`}>{status}</span>;
}

function IndexStatus({ status }: { status: DocumentItem["indexing_status"] }) {
  const styles = {
    indexed: "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400",
    indexing: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
    pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    error: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${styles[status]}`}>index: {status}</span>;
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function uploadWithProgress(
  url: string,
  token: string,
  file: File,
  setProgress: (value: number) => void
): Promise<DocumentItem> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("The upload could not reach the server."));
    request.onload = () => {
      let payload: { detail?: string } & Partial<DocumentItem> = {};
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        /* a non-JSON server error is intentionally hidden */
      }
      if (request.status >= 200 && request.status < 300) resolve(payload as DocumentItem);
      else reject(new Error(payload.detail ?? "The document could not be uploaded."));
    };
    const body = new FormData();
    body.append("file", file);
    request.send(body);
  });
}
