import { type FormEvent, useRef, useState } from 'react';
import { CheckCircle2, FileUp } from 'lucide-react';
import { MAX_DOCUMENT_SIZE_MB } from '../../../../../shared/document-limits';
import type { BooksCopy } from '../copy';
import type { BookEditionUploadError, BookEditionUploadState } from '../types';

interface BookEditionUploaderProps extends BookEditionUploadState {
  bookTitle: string;
  copy: BooksCopy;
  onUpload: (file: File, version: string) => Promise<boolean>;
}

export function BookEditionUploader(props: BookEditionUploaderProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const busy = props.status === 'uploading';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !version.trim() || busy) return;
    if (await props.onUpload(file, version)) {
      formRef.current?.reset();
      setFile(null);
      setVersion('');
    }
  }

  return (
    <form className="book-edition-upload" onSubmit={submit} ref={formRef}>
      <header>
        <span className="linked-upload-badge">{props.copy.uploadBadge}</span>
        <h3>{props.copy.uploadTitle}</h3>
        <p>{props.copy.uploadBook(props.bookTitle)}</p>
        <small>{props.copy.uploadLifecycle}</small>
      </header>
      <label className="edition-version-field">
        <span>{props.copy.uploadVersion}</span>
        <input
          autoComplete="off"
          disabled={busy}
          maxLength={100}
          onChange={(event) => setVersion(event.target.value)}
          placeholder={props.copy.uploadVersionPlaceholder}
          required
          type="text"
          value={version}
        />
      </label>
      <label className="book-file-picker">
        <FileUp aria-hidden="true" size={20} />
        <span dir="auto">{file?.name ?? props.copy.uploadChooseFile}</span>
        <input
          accept=".txt,.md,.pdf,.docx"
          disabled={busy}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          required
          type="file"
        />
      </label>
      <button className="books-upload-button" disabled={!file || !version.trim() || busy} type="submit">
        {busy ? props.copy.uploading : props.copy.uploadAction}
      </button>
      <p className="book-upload-formats">{props.copy.uploadSupported(MAX_DOCUMENT_SIZE_MB)}</p>
      {busy && (
        <div className="book-upload-progress" role="status">
          <progress aria-label={props.copy.uploadProgress} max={100} value={props.progress} />
          <span>{props.copy.uploadProgressValue(props.progress)}</span>
        </div>
      )}
      {props.status === 'error' && props.error && (
        <p className="book-upload-message is-error" role="alert">
          {props.copy.uploadErrors[props.error as BookEditionUploadError]}
        </p>
      )}
      {props.status === 'success' && props.version && (
        <p className="book-upload-message is-success" role="status">
          <CheckCircle2 aria-hidden="true" size={17} />
          {props.copy.uploadSuccess(props.version)}
        </p>
      )}
    </form>
  );
}
