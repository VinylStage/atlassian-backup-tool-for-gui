import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';

interface Props {
  content: string;
}

export default function MarkdownRenderer({ content }: Props) {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none p-6 bg-[var(--color-bg-secondary)] rounded-lg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
