'use client';

import { useState, useRef, type ChangeEvent, type DragEvent } from 'react';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { Button, CeviLogo, cn } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';

interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  hint?: string;
  aspectRatio?: 'square' | 'banner';
  showCeviFallback?: boolean;
  disabled?: boolean;
  className?: string;
}

export function ImageUpload({
  value,
  onChange,
  label,
  hint = 'PNG, JPG, WebP oder SVG (max. 6 MB)',
  aspectRatio = 'square',
  showCeviFallback = true,
  disabled = false,
  className,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Bitte wähle eine gültige Bilddatei aus (PNG, JPG, SVG, WebP).');
      return;
    }

    if (file.size > 6 * 1024 * 1024) {
      setError('Das Bild ist zu gross. Maximal 6 MB erlaubt.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const base64 = await readFileAsBase64(file);
      const res = await api<{ url: string }>('/api/uploads', {
        method: 'POST',
        json: {
          filename: file.name,
          mimeType: file.type,
          base64,
        },
      });

      onChange(res.url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const hasImage = Boolean(value && value.trim().length > 0);

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-[13px] font-semibold text-fg">{label}</label>
          {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/gif"
        className="sr-only"
        onChange={onFileInputChange}
        disabled={disabled || uploading}
      />

      {hasImage ? (
        <div className="flex items-center gap-4 rounded-field border border-line bg-surface-2 p-3">
          {aspectRatio === 'square' ? (
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-tile border border-line bg-surface-1 p-1 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value!} alt="Vorschau" className="size-full object-contain" />
            </div>
          ) : (
            <div className="relative aspect-[16/9] w-36 shrink-0 overflow-hidden rounded-tile border border-line bg-surface-1 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value!} alt="Banner-Vorschau" className="size-full object-cover" />
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-xs font-medium text-fg">Bild erfolgreich hochgeladen</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Wird hochgeladen…
                  </>
                ) : (
                  <>
                    <Upload className="size-3.5" /> Anderes Bild wählen
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || uploading}
                onClick={() => onChange(null)}
                className="text-danger hover:text-danger-ink"
              >
                <X className="size-3.5" /> Entfernen
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled && !uploading) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => {
            if (!disabled && !uploading) fileInputRef.current?.click();
          }}
          className={cn(
            'group relative flex cursor-pointer flex-col items-center justify-center rounded-field border-2 border-dashed p-4 text-center transition',
            dragOver
              ? 'border-accent bg-accent/10'
              : 'border-line-strong hover:border-accent hover:bg-surface-2',
            disabled && 'pointer-events-none opacity-60'
          )}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="size-6 animate-spin text-accent-ink" />
              <span className="text-xs font-medium text-fg-muted">Wird hochgeladen…</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-1">
              {showCeviFallback ? (
                <div className="flex size-10 items-center justify-center rounded-tile border border-line bg-surface-2 p-1.5 shadow-sm">
                  <CeviLogo className="size-full" alt="Cevi Standard" />
                </div>
              ) : (
                <div className="flex size-10 items-center justify-center rounded-tile border border-line bg-surface-2 text-fg-subtle">
                  <ImageIcon className="size-5" />
                </div>
              )}
              <div className="text-left">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-fg group-hover:text-accent-ink">
                  <Upload className="size-3.5" /> Bild hochladen
                </span>
                <span className="text-[11px] text-fg-subtle">Klicken oder Datei hierher ziehen</span>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = () => {
      reject(new Error('Fehler beim Lesen der Datei'));
    };
    reader.readAsDataURL(file);
  });
}
