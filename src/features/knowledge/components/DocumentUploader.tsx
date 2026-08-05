import { FormEvent, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { MAX_DOCUMENT_SIZE_MB } from '../../../../shared/document-limits';

interface DocumentUploaderProps {
  busy: boolean;
  errorMessage: string | null;
  onUpload: (file: File) => Promise<boolean>;
}

export function DocumentUploader({ busy, errorMessage, onUpload }: DocumentUploaderProps) {
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
        <h2>إضافة كتاب</h2>
        <p>يدعم TXT وMarkdown وPDF وWord حتى {MAX_DOCUMENT_SIZE_MB} ميجابايت.</p>
      </div>
      <label className="file-picker">
        <FileUp size={20} />
        <span>{file?.name ?? 'اختر ملفًا من الجهاز'}</span>
        <input
          accept=".txt,.md,.pdf,.docx"
          disabled={busy}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          type="file"
        />
      </label>
      <button className="primary-button" disabled={!file || busy} type="submit">
        {busy ? 'جارٍ الاستخراج…' : 'إضافة إلى المعرفة'}
      </button>
      {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
    </form>
  );
}
