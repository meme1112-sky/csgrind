"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HiArrowUpTray, HiDocumentArrowUp } from "react-icons/hi2";
import { extractValveShareCode } from "@/lib/valveShareCode";
import { uploadValveDemo } from "@/lib/valveDemoUpload";

const ACCENT = "#edae5f";
const ACCEPT_EXT = /\.(dem|dem\.bz2|bz2|gz|zst)$/i;

function isDemoFile(file: File): boolean {
  if (ACCEPT_EXT.test(file.name)) return true;
  // Some browsers give empty/octet-stream for .dem — still allow.
  return file.type === "" || file.type === "application/octet-stream";
}

type Props = {
  steamId: string;
  /** Prefill from `?share=` when opening from a locked match. */
  initialShareCode?: string;
};

export function ValveDemoUploadForm({ steamId, initialShareCode = "" }: Props) {
  const router = useRouter();
  const fileInputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadShare, setUploadShare] = useState(initialShareCode);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadOk, setUploadOk] = useState<string | null>(null);

  useEffect(() => {
    if (!initialShareCode) return;
    setUploadShare(initialShareCode);
  }, [initialShareCode]);

  const pickFile = (file: File | null | undefined) => {
    setUploadError(null);
    setUploadOk(null);
    if (!file) {
      setUploadFile(null);
      return;
    }
    if (!isDemoFile(file)) {
      setUploadError("Choose a demo file (.dem / .dem.bz2)");
      setUploadFile(null);
      return;
    }
    setUploadFile(file);
  };

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setUploadError(null);
        setUploadOk(null);
        if (!steamId) return;
        if (uploadShare.trim() && !extractValveShareCode(uploadShare)) {
          setUploadError(
            "No CSGO share code found — paste the full Steam share link or CSGO-xxxxx-… code"
          );
          return;
        }
        if (!uploadFile) {
          setUploadError("Drop or choose a demo file first");
          return;
        }
        setUploading(true);
        setUploadProgress("Starting upload…");
        try {
          const data = await uploadValveDemo(steamId, uploadShare, uploadFile, (p) => {
            if (p.phase === "init") {
              setUploadProgress("Preparing upload…");
              return;
            }
            if (p.phase === "chunks") {
              const pct = Math.round((p.sentBytes / p.totalBytes) * 100);
              setUploadProgress(
                `Uploading… ${pct}% (${p.chunkIndex}/${p.totalChunks} chunks)`
              );
              return;
            }
            setUploadProgress("Finishing — starting parse…");
          });
          const code = data.share_code || extractValveShareCode(uploadShare) || "";
          if (data.share_code && !uploadShare.trim()) {
            setUploadShare(data.share_code);
          }
          const state = data.job?.state || data.status || "queued";
          setUploadProgress(null);
          setUploadOk(
            state === "done" || data.status === "parsed"
              ? "Parsed. Opening match…"
              : "Upload received — parsing in the background…"
          );
          if (code) {
            setTimeout(() => {
              router.push(
                `/profile/${steamId}/match/${encodeURIComponent(code)}?platform=premier`
              );
            }, state === "done" || data.status === "parsed" ? 600 : 1800);
          }
        } catch (err) {
          setUploadProgress(null);
          setUploadError(err instanceof Error ? err.message : "Upload failed");
        } finally {
          setUploading(false);
        }
      }}
    >
      {/* Drop zone first — primary action */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Demo file</label>
        <input
          ref={inputRef}
          id={fileInputId}
          type="file"
          accept=".dem,.bz2,.gz,.zst,application/octet-stream"
          className="sr-only"
          disabled={uploading}
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!uploading) setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!uploading) setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
            if (uploading) return;
            pickFile(e.dataTransfer.files?.[0] ?? null);
          }}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors disabled:opacity-60 ${
            dragOver
              ? "border-accent bg-accent/10"
              : uploadFile
                ? "border-accent/50 bg-accent/5"
                : "border-border bg-muted/15 hover:border-accent/40 hover:bg-muted/25"
          }`}
          aria-describedby={`${fileInputId}-hint`}
        >
          <HiDocumentArrowUp
            className={`size-10 ${dragOver || uploadFile ? "text-accent" : "text-muted-foreground"}`}
            aria-hidden
          />
          {uploadFile ? (
            <>
              <p className="text-sm font-medium text-foreground">{uploadFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(uploadFile.size / (1024 * 1024)).toFixed(1)} MB — drop another file to replace
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">
                {dragOver ? "Drop demo here" : "Drag & drop your .dem here"}
              </p>
              <p id={`${fileInputId}-hint`} className="text-xs text-muted-foreground">
                or click to browse · .dem / .dem.bz2 · max 400 MB
              </p>
            </>
          )}
        </button>
      </div>

      <div className="space-y-2">
        <label htmlFor="upload-share" className="text-sm font-medium text-foreground">
          Match share code{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id="upload-share"
          type="text"
          value={uploadShare}
          onChange={(e) => {
            const raw = e.target.value;
            setUploadShare(extractValveShareCode(raw) ?? raw);
          }}
          placeholder="CSGO-XXXXX-… (auto from Valve filename when possible)"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          disabled={uploading}
        />
        <p className="text-xs text-muted-foreground">
          Skip this only if the file still has Valve&apos;s name (
          <span className="font-mono">match730_&lt;id&gt;_&lt;id&gt;_&lt;port&gt;.dem</span>
          ). Renamed files like <span className="font-mono">3OCT26PERSIAN.dem</span> need a
          pasted CSGO-… code.
        </p>
      </div>

      {uploadProgress ? (
        <p className="text-sm text-muted-foreground" role="status">
          {uploadProgress}
        </p>
      ) : null}
      {uploadError ? (
        <p className="text-sm text-rose-500" role="alert">
          {uploadError}
        </p>
      ) : null}
      {uploadOk ? (
        <p className="text-sm text-emerald-500" role="status">
          {uploadOk}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={uploading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-60"
        style={{ backgroundColor: ACCENT }}
      >
        <HiArrowUpTray className="size-5" aria-hidden />
        {uploading ? uploadProgress || "Uploading…" : "Upload demo"}
      </button>
    </form>
  );
}
