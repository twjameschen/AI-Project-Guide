import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownPreview } from '../../src/components/MarkdownPreview';
import { isSafeHttpUrl, safeMarkdownUrl } from '../../src/domain/links';
import { generateDocs } from '../../src/generators/docs';
import { escapeText, safeLink } from '../../src/generators/md';
import { assertSafePath, buildZip, zipFileName } from '../../src/generators/zip';
import { filledProject, T1 } from './fixtures';

describe('不安全連結與內容', () => {
  it('只接受 http/https 連結', () => {
    expect(isSafeHttpUrl('https://example.com/a')).toBe(true);
    expect(isSafeHttpUrl('http://example.com')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'vbscript:x', '//evil.com', 'example.com', '']) {
      expect(isSafeHttpUrl(bad), bad).toBe(false);
    }
    expect(safeMarkdownUrl('mailto:a@b.co')).toBe('mailto:a@b.co');
    expect(safeMarkdownUrl('javascript:alert(1)')).toBeNull();
  });

  it('文件中的不安全連結不會變成可點擊連結', () => {
    expect(safeLink('javascript:alert(1)')).not.toMatch(/\]\(/);
    expect(safeLink('javascript:alert(1)')).toContain('已停用連結');
    const p = filledProject();
    p.basics.repoUrl = 'javascript:alert(document.cookie)';
    p.tech.references = [{ id: 'REF-001', url: 'data:text/html,hi', note: '惡意' }];
    const product = generateDocs({ project: p, briefs: [], exportedAt: T1 }).find((f) => f.path === 'docs/product.md')!.content;
    expect(product).not.toMatch(/\]\(<?javascript:/i);
    expect(product).not.toMatch(/\]\(<?data:/i);
  });

  it('使用者文字中的 HTML 與標題語法被中和，無法破壞合併標記', () => {
    expect(escapeText('<script>alert(1)</script>')).toBe('\\<script>alert(1)\\</script>');
    expect(escapeText('<!-- ai-project-guide:end -->')).toBe('<\\!-- ai-project-guide:end -->');
    expect(escapeText('# 假標題')).toBe('\\# 假標題');
    expect(escapeText('a < b')).toBe('a < b');
    const p = filledProject();
    p.basics.name = 'X <!-- ai-project-guide:end --> <img src=x onerror=alert(1)>';
    const agents = generateDocs({ project: p, briefs: [], exportedAt: T1 }).find((f) => f.path === 'AGENTS.md')!.content;
    expect(agents.match(/<!-- ai-project-guide:end -->/g)).toHaveLength(1);
    // 只允許跳脫後的 \\<img（純文字），不可出現未跳脫的 HTML 標籤
    expect(agents).not.toMatch(/(^|[^\\\\])<img/m);
  });

  it('Markdown 預覽不渲染原始 HTML、不產生危險連結、不載入圖片', () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownPreview, {
        source: '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[點我](javascript:alert(1))\n\n![圖](https://example.com/x.png)\n\n[正常](https://example.com)',
      }),
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('ZIP 路徑由程式控制，拒絕跳脫與絕對路徑', () => {
    for (const bad of ['../x.md', '/etc/passwd', 'a/../../b', 'docs//x', 'C:\\x', 'a b.md']) {
      expect(() => assertSafePath(bad), bad).toThrow();
    }
    expect(() => buildZip([{ path: '../evil.md', description: '', content: 'x' }], T1)).toThrow();
    expect(zipFileName('報價單 產生器', 'abcdef123456', 3)).toBe('ai-guide-project-abcdef12-r3.zip');
    expect(zipFileName('../../Quote Tool', 'id', 2)).toBe('ai-guide-quote-tool-r2.zip');
  });
});
