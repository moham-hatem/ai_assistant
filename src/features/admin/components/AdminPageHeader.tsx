interface AdminPageHeaderProps {
  description: string;
  eyebrow: string;
  title: string;
}

export function AdminPageHeader({ description, eyebrow, title }: AdminPageHeaderProps) {
  return (
    <header className="admin-page-header">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
