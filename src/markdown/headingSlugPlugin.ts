import GithubSlugger from 'github-slugger';
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { inlineText } from './toc';

/**
 * markdown-it plugin that assigns a GitHub-style `id` slug to every heading so
 * the navigation pane can link to sections and the browser can jump to them.
 *
 * A FRESH {@link GithubSlugger} is created on every parse. The slugger is
 * stateful (it remembers prior slugs to append `-1`, `-2`, ... on collisions);
 * reusing one instance across live-update re-renders would make duplicate
 * suffixes grow without bound.
 */
export function headingSlugPlugin(md: MarkdownIt): void {
  md.core.ruler.push('heading_slug', (state) => {
    const slugger = new GithubSlugger();
    const tokens = state.tokens as Token[];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type !== 'heading_open') {
        continue;
      }
      const text = inlineText(tokens[i + 1]);
      const slug = slugger.slug(text);
      token.attrSet('id', slug);
    }
    return true;
  });
}
