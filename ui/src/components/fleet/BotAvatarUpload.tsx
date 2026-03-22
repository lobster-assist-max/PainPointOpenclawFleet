/**
 * BotAvatarUpload — Square avatar display with click-to-upload.
 *
 * Per Bot Card Spec: square avatar, maximum size display.
 * Supports upload via file picker, displays preview instantly,
 * and persists to server via fleet-monitor API.
 */

import { useRef, useState, useCallback } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fleetMonitorApi } from "@/api/fleet-monitor";

const ACCEPTED_TYPES = "image/png,image/jpeg,image/jpg,image/webp,image/gif";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface BotAvatarUploadProps {
  botId: string;
  currentAvatar: string | null;
  emoji: string;
  name: string;
  /** Size variant */
  size?: "sm" | "md" | "lg" | "xl";
  /** Whether the upload button is shown (false = display only) */
  editable?: boolean;
  /** Called after successful upload with the new avatar URL */
  onAvatarChange?: (avatar: string | null) => void;
  className?: string;
}

const SIZE_CLASSES = {
  sm: "h-14 w-14",
  md: "h-20 w-20",
  lg: "h-32 w-32",
  xl: "h-48 w-48",
} as const;

const EMOJI_SIZES = {
  sm: "text-2xl",
  md: "text-4xl",
  lg: "text-6xl",
  xl: "text-8xl",
} as const;

export function BotAvatarUpload({
  botId,
  currentAvatar,
  emoji,
  name,
  size = "lg",
  editable = true,
  onAvatarChange,
  className,
}: BotAvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const displayUrl = previewUrl ?? currentAvatar;
  const sizeClass = SIZE_CLASSES[size];
  const emojiSize = EMOJI_SIZES[size];

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);

      if (file.size > MAX_FILE_SIZE) {
        setError("Image must be under 5MB");
        return;
      }

      // Show instant preview
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);

      // Upload to server
      setUploading(true);
      try {
        const result = await fleetMonitorApi.uploadAvatar(botId, file);
        setPreviewUrl(result.avatar);
        onAvatarChange?.(result.avatar);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setPreviewUrl(null);
      } finally {
        setUploading(false);
        // Reset input so re-selecting the same file works
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [botId, onAvatarChange],
  );

  const handleRemove = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setError(null);
      setUploading(true);
      try {
        await fleetMonitorApi.removeAvatar(botId);
        setPreviewUrl(null);
        onAvatarChange?.(null);
      } catch {
        setError("Failed to remove avatar");
      } finally {
        setUploading(false);
      }
    },
    [botId, onAvatarChange],
  );

  return (
    <div className={cn("relative group shrink-0", className)}>
      {/* Hidden file input */}
      {editable && (
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={handleFileSelect}
        />
      )}

      {/* Avatar display */}
      <div
        className={cn(
          "relative rounded-xl overflow-hidden shadow-md",
          sizeClass,
          editable && "cursor-pointer",
        )}
        onClick={editable ? () => fileInputRef.current?.click() : undefined}
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="h-full w-full flex items-center justify-center"
            style={{ backgroundColor: "#D4A37315" }}
          >
            <span className={emojiSize}>{emoji || "\u{1F916}"}</span>
          </div>
        )}

        {/* Upload overlay (shown on hover when editable) */}
        {editable && !uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="h-6 w-6 text-white" />
          </div>
        )}

        {/* Loading overlay */}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40" role="status" aria-label="Uploading">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Remove button (shown when avatar exists and editable) */}
      {editable && displayUrl && !uploading && (
        <button
          onClick={handleRemove}
          className="absolute -top-1.5 -right-1.5 z-10 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600"
          aria-label={`Remove ${name} avatar`}
          title="Remove avatar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Error message */}
      {error && (
        <p className="absolute -bottom-5 left-0 right-0 text-[10px] text-red-500 text-center truncate">
          {error}
        </p>
      )}
    </div>
  );
}
