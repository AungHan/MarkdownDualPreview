const FEEDBACK_MS = 1500;

/**
 * Attach a hover-reveal "Copy" button to every fenced code block inside
 * {@link contentEl}. Call after each `updateContent` (innerHTML swap destroys
 * previous buttons).
 *
 * @param postCopy  Fallback: post the text to the host for clipboard access
 *                  when `navigator.clipboard` is unavailable or denied.
 */
export function decorateCodeBlocks(
  contentEl: HTMLElement,
  postCopy: (text: string) => void
): void {
  contentEl.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code) {
      return;
    }

    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.type = 'button';
    btn.title = 'Copy code';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = code.textContent ?? '';
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(
          () => showFeedback(btn),
          () => {
            postCopy(text);
            showFeedback(btn);
          }
        );
      } else {
        postCopy(text);
        showFeedback(btn);
      }
    });

    pre.appendChild(btn);
  });
}

function showFeedback(btn: HTMLElement): void {
  const original = btn.textContent;
  btn.textContent = 'Copied!';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('copied');
  }, FEEDBACK_MS);
}
