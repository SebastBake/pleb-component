import morph from "morphdom";

type Constructor<E> = {
  new (): E;
  prototype: E;
};

type Rendered = Node | Node[] | null | undefined;
type Attrs<ATTRS extends string[]> = {
  [key in ATTRS extends Array<infer T> ? T : never]: string;
};

type RenderArgs<ATTRS extends string[]> = {
  attrs: Attrs<ATTRS>;
  readonly instanceSymbol: unique symbol;
  readonly componentSymbol: unique symbol;
};

type AddEventListenerFn = <K extends keyof HTMLElementEventMap>(
  type: K,
  listener: (this: ShadowRoot, ev: HTMLElementEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions
) => void;

type ConnectedCallback<ATTRS extends string[]> = (
  middlewareConfig: {
    render(): void;
    element: HTMLElement;
    addEventListener: AddEventListenerFn;
  } & RenderArgs<ATTRS>
) => void | (() => void) | (() => void)[];

type ElementConf<ATTRS extends string[], E extends HTMLElement> = Readonly<{
  name: string;
  attrs?: ATTRS;
  style?: string;
  element?: Constructor<E>;
  onConnected?: ConnectedCallback<ATTRS>;
  render?(args: RenderArgs<ATTRS>): Rendered | Promise<Rendered>;
}>;

type WebComponentFn<ATTRS extends string[]> = (
  ...args: ATTRS extends never[]
    ? [children?: Node[], _?: undefined]
    : [attrs: Attrs<ATTRS>, children?: Node[]]
) => Node;

/**
 *
 * @param conf
 */
function make<ATTRS extends string = never, E extends HTMLElement = HTMLElement>(
  conf: ElementConf<ATTRS[], E>
): WebComponentFn<ATTRS[]> {
  registerWebComponent(conf);

  const create = (arg1: any, arg2: any) => {
    const element = document.createElement(conf.name);
    if (!Array.isArray(arg1) && conf.attrs && arg1)
      for (const attrName of conf.attrs) {
        const value: string | undefined = arg1[attrName];
        if (value) element.setAttribute(attrName, value);
      }

    const childNodes = Array.isArray(arg1) ? arg1 : Array.isArray(arg2) ? arg2 : undefined;

    if (childNodes) for (const childNode of childNodes) element.appendChild(childNode);

    return element;
  };

  //@ts-expect-error
  return create;
}

/**
 *
 * @param conf
 */
function registerWebComponent<ATTRS extends string[], E extends HTMLElement>(
  conf: ElementConf<ATTRS, E>
) {
  class CustomElement extends (conf.element || HTMLElement) {
    public static readonly componentSymbol: unique symbol = Symbol("[component]" + conf.name);
    // @ts-ignore
    public readonly instanceSymbol: unique symbol = Symbol("[instance]" + conf.name);
    private cleanupfns = new Set<() => void>();

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
    }

    public attributeChangedCallback() {
      this.render();
    }

    public connectedCallback() {
      if (!this.shadowRoot) return;
      if (conf.onConnected) {
        const cleanup = conf.onConnected({
          ...this.makeRenderArgs(),
          render: () => this.render(),
          addEventListener: (...args) => this._addEventListener(...args),
          element: this,
        });
        if (typeof cleanup === "function") {
          this.cleanupfns.add(cleanup);
        } else if (Array.isArray(cleanup)) {
          cleanup.forEach((cb) => this.cleanupfns.add(cb));
        }
      }

      this.render();
    }

    public disconnectedCallback() {
      this.cleanupfns.forEach((cb) => cb());
      this.cleanupfns.clear();
    }

    private async render() {
      if (!this.shadowRoot || !conf.render) return;
      const rendered = await conf.render(this.makeRenderArgs());
      const fragment = document.createDocumentFragment();
      const styleElement = document.createElement("style");
      styleElement.textContent = conf.style || "";
      fragment.appendChild(styleElement);
      appendChildren(fragment, rendered);
      if (!this.shadowRoot || !this.isConnected) return;
      morph(this.shadowRoot, fragment);
    }

    private makeRenderArgs(): RenderArgs<ATTRS> {
      const attrs = getAttrsFromEl(this);
      return {
        attrs,
        // @ts-ignore
        componentSymbol: CustomElement.componentSymbol,
        // @ts-ignore
        instanceSymbol: this.instanceSymbol,
      };
    }

    private _addEventListener<K extends keyof HTMLElementEventMap>(
      type: K,
      callback: (this: ShadowRoot, ev: HTMLElementEventMap[K]) => any,
      options?: boolean | AddEventListenerOptions
    ) {
      // @ts-expect-error
      this.shadowRoot.addEventListener(type, callback, options);
      this.cleanupfns.add(() =>
        // @ts-expect-error
        this.removeEventListener(type, callback)
      );
    }
  }

  window.customElements.define(conf.name, CustomElement, {
    extends: conf.element?.name.slice(4, -7).toLowerCase() || undefined,
  });
}

/**
 *
 * @param el
 * @param names
 */
function getAttrsFromEl(el: Element): Attrs<string[]> {
  const attrs: any = {};
  const names = el.getAttributeNames();
  for (const attrName of names) attrs[attrName] = el.attributes.getNamedItem(attrName)?.value;
  return attrs;
}

export default { make };

/**
 *
 * @param nodes
 */
function appendChildren(parent: Node, nodes: Node | Node[] | null | undefined) {
  if (Array.isArray(nodes)) {
    for (const child of nodes) {
      parent.appendChild(child);
    }
  } else if (nodes) {
    parent.appendChild(nodes);
  }
}
