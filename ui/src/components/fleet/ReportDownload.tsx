/**
 * ReportDownload — Fleet report generation UI with month picker and format selection.
 */

import { useState } from "react";
import { Download, FileSpreadsheet, FileJson, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportDownloadProps {
  companyId: string;
  className?: string;
}

export function ReportDownload({ companyId, className }: ReportDownloadProps) {
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Default to current month
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const monthLabel = new Date(year, month).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const url = `/api/fleet-report?from=${from}&to=${to}&format=${format}&companyId=${encodeURIComponent(companyId)}`;
      const response = await fetch(url);

      if (!response.ok) throw new Error(`Download failed (${response.status})`);

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `fleet-report-${from}-to-${to}.${format}`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const canGoNext = !(year === now.getFullYear() && month === now.getMonth());

  return (
    <div className={cn("rounded-xl border p-4 space-y-4", className)}>
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Download className="h-4 w-4 text-primary" />
        Fleet Reports
      </h3>

      {/* Month selector */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (month === 0) { setMonth(11); setYear(year - 1); }
            else setMonth(month - 1);
          }}
          aria-label="Previous month"
          className="rounded-lg border px-2 py-1 text-xs hover:bg-accent"
        >
          ←
        </button>
        <span className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</span>
        <button
          type="button"
          onClick={() => {
            if (canGoNext) {
              if (month === 11) { setMonth(0); setYear(year + 1); }
              else setMonth(month + 1);
            }
          }}
          disabled={!canGoNext}
          aria-label="Next month"
          className={cn(
            "rounded-lg border px-2 py-1 text-xs",
            canGoNext ? "hover:bg-accent" : "opacity-30 cursor-not-allowed",
          )}
        >
          →
        </button>
      </div>

      {/* Format selector */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFormat("csv")}
          aria-pressed={format === "csv"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors",
            format === "csv" ? "bg-primary text-primary-foreground" : "hover:bg-accent",
          )}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          CSV
        </button>
        <button
          type="button"
          onClick={() => setFormat("json")}
          aria-pressed={format === "json"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors",
            format === "json" ? "bg-primary text-primary-foreground" : "hover:bg-accent",
          )}
        >
          <FileJson className="h-3.5 w-3.5" />
          JSON
        </button>
      </div>

      {/* Error message */}
      {downloadError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-500">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {downloadError}
        </div>
      )}

      {/* Download button */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        {downloading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Download Report
          </>
        )}
      </button>
    </div>
  );
}
