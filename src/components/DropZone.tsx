import { useRef, useState, type DragEvent } from 'react';

interface Props {
  onFile: (file: File) => void;
  busy?: boolean;
  error?: string | null;
}

export function DropZone({ onFile, busy, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a PDF file.');
      return;
    }
    onFile(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="dropzone__inner">
        <h1>PDF Editor</h1>
        <p>{busy ? 'Loading…' : 'Drop a PDF here or click to choose a file'}</p>
        {error && <p className="dropzone__error">{error}</p>}
      </div>
    </div>
  );
}
