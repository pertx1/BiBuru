"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Vista previa de Markdown. Seguro: sin HTML en bruto, sin imágenes remotas, enlaces en pestaña nueva. */
export function Markdown({ children }: { children: string }) {
  if (!children.trim()) return <p className="text-sm text-muted">Nada que mostrar todavía.</p>;
  return (
    <div className="prose-note text-sm leading-relaxed [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_hr]:my-4 [&_hr]:border-border [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-2 [&_pre]:p-3 [&_table]:my-2 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_ul]:list-disc [&_ul]:pl-5 [&_input]:mr-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={["img", "iframe", "script"]}
        unwrapDisallowed
        components={{ a: ({ children: c, href }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{c}</a> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
