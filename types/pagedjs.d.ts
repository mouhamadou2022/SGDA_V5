declare module 'pagedjs' {
  export class Previewer {
    constructor(html?: string);
    preview(
      content: string,
      stylesheets?: string[] | { href?: string; text?: string }[],
      renderTo?: HTMLElement | DocumentFragment,
    ): Promise<void>;
    setPageSize(pageSize?: { width?: string; height?: string } | string): void;
  }
}
