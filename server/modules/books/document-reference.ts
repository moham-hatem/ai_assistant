const prefix = 'document:';

export function createDocumentReference(documentId: string): string {
  return `${prefix}${documentId}`;
}

export function parseDocumentReference(reference: string): string | undefined {
  return reference.startsWith(prefix) ? reference.slice(prefix.length) : undefined;
}
