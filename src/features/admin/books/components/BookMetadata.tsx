import type { AppLanguage } from '../../../../i18n/language';
import type { BooksCopy } from '../copy';
import { formatBookDate, formatBookLanguage } from '../format';
import type { Book } from '../types';

interface BookMetadataProps { book: Book; copy: BooksCopy; language: AppLanguage }

export function BookMetadata({ book, copy, language }: BookMetadataProps) {
  return (
    <div className="book-metadata">
      <header>
        <span>{copy.bookDetails}</span>
        <h2 dir="auto">{book.title}</h2>
        <p dir="auto">{book.authorOrOrganization ?? copy.noAuthor}</p>
      </header>
      <dl>
        <div><dt>{copy.bookLanguage}</dt><dd>{formatBookLanguage(book.language, language)} <code>{book.language}</code></dd></div>
        <div><dt>{copy.subject}</dt><dd dir="auto">{book.subject ?? copy.noSubject}</dd></div>
        <div><dt>{copy.createdAt}</dt><dd><time dateTime={book.createdAt}>{formatBookDate(book.createdAt, language)}</time></dd></div>
        <div><dt>{copy.updatedAt}</dt><dd><time dateTime={book.updatedAt}>{formatBookDate(book.updatedAt, language)}</time></dd></div>
      </dl>
    </div>
  );
}
