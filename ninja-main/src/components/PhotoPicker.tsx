import React, { useState } from 'react';
import { Camera, Trash2, X } from 'lucide-react';

// Photos are stored inline in the record, so shrink them to a JPEG of at most 1280px first.
// shortcut: data URLs in jsonb; move to file storage if photos get heavy.
async function photoToDataUrl(file: File, max = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}

export const PhotoPicker: React.FC<{
  photos: string[];
  onChange: (photos: string[]) => void;
  label: string;
  max?: number;
}> = ({ photos, onChange, label, max = 4 }) => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = React.useId();

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const added = await Promise.all([...files].slice(0, max - photos.length).map((f) => photoToDataUrl(f)));
      onChange([...photos, ...added]);
    } catch {
      setError('Тази снимка не може да се отвори. Пробвай JPG или PNG.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {photos.map((src, i) => (
          <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-line">
            <img src={src} alt={`Снимка ${i + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, j) => j !== i))}
              aria-label={`Махни снимка ${i + 1}`}
              className="absolute top-0.5 right-0.5 w-5 h-5 grid place-items-center rounded-full bg-ink/70 text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <label
            htmlFor={inputId}
            className="w-20 h-20 rounded-lg border border-dashed border-rule hover:border-ochre flex flex-col items-center justify-center gap-1 text-[10px] text-mute cursor-pointer text-center px-1"
          >
            <Camera className="w-5 h-5 text-ochre" />
            {busy ? 'Зарежда…' : label}
          </label>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p role="alert" className="text-[11px] text-red">{error}</p>}
    </div>
  );
};

// Two-step delete: the first click asks, the second deletes. No browser confirm dialog.
export const DeleteButton: React.FC<{ onDelete: () => void; label?: string; className?: string }> = ({
  onDelete,
  label = 'Изтрий',
  className = '',
}) => {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => (armed ? onDelete() : setArmed(true))}
      onBlur={() => setArmed(false)}
      className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
        armed ? 'bg-red text-white border-red' : 'text-red border-red/40 hover:bg-red/10'
      } ${className}`}
    >
      <Trash2 className="w-3.5 h-3.5" />
      {armed ? 'Сигурен ли си? Изтрий' : label}
    </button>
  );
};
