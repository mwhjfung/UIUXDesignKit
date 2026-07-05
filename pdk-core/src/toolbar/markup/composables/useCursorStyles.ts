export function useCursorStyles() {
  function injectCursorStyles() {
    const style = document.createElement('style')
    style.id = 'feedback-cursor-styles'
    style.textContent = `
      body * {
        cursor: crosshair !important;
      }
      body p, body span, body h1, body h2, body h3, body h4, body h5, body h6,
      body li, body td, body th, body label, body blockquote, body figcaption,
      body caption, body legend, body dt, body dd, body pre, body code,
      body em, body strong, body b, body i, body u, body s, body a,
      body time, body address, body cite, body q, body abbr, body dfn,
      body mark, body small, body sub, body sup, body [contenteditable],
      body p *, body span *, body h1 *, body h2 *, body h3 *, body h4 *,
      body h5 *, body h6 *, body li *, body a *, body label *, body pre *,
      body code *, body blockquote *, body [contenteditable] * {
        cursor: text !important;
      }
      [data-feedback-toolbar], [data-feedback-toolbar] * {
        cursor: default !important;
      }
      [data-feedback-toolbar] textarea,
      [data-feedback-toolbar] input[type="text"],
      [data-feedback-toolbar] input[type="url"] {
        cursor: text !important;
      }
      [data-feedback-toolbar] button,
      [data-feedback-toolbar] button *,
      [data-feedback-toolbar] label,
      [data-feedback-toolbar] label *,
      [data-feedback-toolbar] a,
      [data-feedback-toolbar] a *,
      [data-feedback-toolbar] [role="button"],
      [data-feedback-toolbar] [role="button"] * {
        cursor: pointer !important;
      }
      [data-annotation-marker], [data-annotation-marker] * {
        cursor: pointer !important;
      }
      html[data-drawing-hover], html[data-drawing-hover] * {
        cursor: pointer !important;
      }
    `
    document.head.appendChild(style)
  }

  function removeCursorStyles() {
    const existingStyle = document.getElementById('feedback-cursor-styles')
    if (existingStyle) existingStyle.remove()
  }

  function setDrawingHoverCursor(active: boolean) {
    if (active) {
      document.documentElement.setAttribute('data-drawing-hover', '')
    } else {
      document.documentElement.removeAttribute('data-drawing-hover')
    }
  }

  return {
    injectCursorStyles,
    removeCursorStyles,
    setDrawingHoverCursor,
  }
}
