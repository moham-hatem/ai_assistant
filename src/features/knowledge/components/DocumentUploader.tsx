import { useRef, useState, type FormEvent } from 'react';
import { FileUp } from 'lucide-react';
import { MAX_DOCUMENT_SIZE_MB } from '../../../../shared/document-limits';
import type { KnowledgeCopy } from '../copy';

interface DocumentUploaderProps {
  busy: boolean;
  copy: KnowledgeCopy;
  errorMessage: string | null;
  onUpload: (file: File) => Promise<boolean>;
}

export function DocumentUploader({ busy, copy, errorMessage, onUpload }: DocumentUploaderProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    if (await onUpload(file)) {
      formRef.current?.reset();
      setFile(null);
    }
  }

  return (
    <form className="upload-card" onSubmit={handleSubmit} ref={formRef}>
      <div>
        <h2>{copy.title}</h2>
        <p>{copy.supported(MAX_DOCUMENT_SIZE_MB)}</p>
      </div>
      <label className="file-picker">
        <FileUp size={20} />
        <span dir="auto">{file?.name ?? copy.chooseFile}</span>
        <input
          accept=".txt,.md,.pdf,.docx"
          disabled={busy}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          type="file"
        />
      </label>
      <button className="primary-button" disabled={!file || busy} type="submit">
        {busy ? copy.extracting : copy.add}
      </button>
      {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
    </form>
  );
}
