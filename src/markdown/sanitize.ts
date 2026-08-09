import sanitizeHtml from 'sanitize-html';

/** Maps a raw `src` attribute to the value the webview should load. */
export type ResourceRewriter = (src: string) => string;

/**
 * Tags our own renderer or a README author may reasonably produce. Deliberately
 * excludes anything that can execute script, submit data, or re-target the
 * document (`script`, `style`, `iframe`, `form`, `base`, ...) — see the
 * contract's security-contract section for the full rationale per tag.
 */
const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br',
  'caption', 'code', 'col', 'colgroup',
  'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt',
  'em',
  'figcaption', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
  'i', 'img', 'input', 'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p', 'picture', 'pre',
  'q',
  's', 'samp', 'small', 'span', 'strong', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
  'u', 'ul',
  'var'
];

/**
 * `style` is intentionally omitted everywhere — it is the CSS-exfiltration and
 * layout-hijack surface, and no README needs it for legibility.
 */
const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  '*': ['data-line', 'id', 'class', 'title', 'align', 'dir', 'lang'],
  a: ['href', 'name', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'align', 'loading'],
  td: ['colspan', 'rowspan', 'align', 'valign'],
  th: ['colspan', 'rowspan', 'align', 'valign'],
  input: ['type', 'checked', 'disabled'],
  ol: ['start'],
  details: ['open']
};

/**
 * Allowlist-sanitize rendered document HTML and rewrite every `<img src>`
 * through `rewriteSrc`. Preserves the attributes emitted by our own renderer
 * (`data-line`, heading `id`, highlight.js classes).
 *
 * `<source>` is deliberately absent from {@link ALLOWED_TAGS}: a `<picture>`
 * with an un-rewritten local `srcset` candidate would be selected by the
 * browser and fail to load, so the plain `<img>` fallback is dropped instead
 * of half-supporting `srcset`.
 */
export function sanitizeDocumentHtml(html: string, rewriteSrc: ResourceRewriter): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: false,
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'template'],
    transformTags: {
      img: (tagName, attribs) => {
        if (!attribs.src) {
          return { tagName, attribs };
        }
        return { tagName, attribs: { ...attribs, src: rewriteSrc(attribs.src) } };
      },
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' })
    }
  });
}
