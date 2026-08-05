const maximumChunkLength = 900;
const longParagraphStep = 800;

export function chunkText(content: string): string[] {
  const paragraphs = content
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/^#{1,6}\s+/gm, '').trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maximumChunkLength) {
      chunks.push(current);
      current = '';
    }

    if (paragraph.length > maximumChunkLength) {
      if (current) chunks.push(current);
      for (let start = 0; start < paragraph.length; start += longParagraphStep) {
        chunks.push(paragraph.slice(start, start + maximumChunkLength));
      }
      current = '';
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
