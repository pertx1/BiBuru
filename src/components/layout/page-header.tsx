import { SearchButton } from "@/components/search/search-button";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[2.125rem] font-bold leading-tight tracking-[-0.02em] md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      <SearchButton />
    </header>
  );
}
