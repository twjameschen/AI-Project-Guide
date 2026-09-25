import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { safeMarkdownUrl } from '../domain/links';

/**
 * 安全的 Markdown 預覽：
 * - skipHtml：原始 HTML 一律不渲染。
 * - 連結只允許 http(s)／mailto；其他協定（javascript:、data: 等）與相對路徑不產生連結。
 * - 不載入圖片（避免預覽時對外連線）。
 */
export function MarkdownPreview({ source }: { source: string }) {
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => safeMarkdownUrl(url) ?? ''}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => <span className="muted">[圖片未載入：{alt || '無說明'}]</span>,
        }}
      >
        {source}
      </Markdown>
    </div>
  );
}
