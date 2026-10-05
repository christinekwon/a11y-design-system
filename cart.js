/**
 * cart — accessible Shopify cart behaviour. No dependencies.
 *
 * Two custom elements:
 *   <cart-root>   cart updates, focus management, announcements
 *   <cart-drawer> modal <dialog> plumbing
 *
 * The server renders every state. This module never builds cart markup: each
 * Cart API call asks for the re-rendered section and one node is swapped in.
 */

const PARSER = new DOMParser();
const DEBOUNCE_MS = 300;
const LOADING_DELAY_MS = 500;

/** Interpolate {token} placeholders. Liquid's `t` filter leaves these alone. */
function fill(template, values) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );
}

class CartRoot extends HTMLElement {
  #queue = Promise.resolve();
  #timers = new Map();
  #strings = {};

  connectedCallback() {
    this.#strings = this.#readStrings();

    this.addEventListener("click", this.#onClick);
    this.addEventListener("change", this.#onChange);
    document.addEventListener("cart:refresh", this.refresh);
  }

  disconnectedCallback() {
    document.removeEventListener("cart:refresh", this.refresh);
    this.#timers.forEach(clearTimeout);
  }

  get sectionId() {
    return this.dataset.sectionId;
  }

  get contents() {
    return this.querySelector("[data-cart-contents]");
  }

  // ---------- Public API ----------

  /** Announce a message in the persistent status region. */
  announce = (message) => {
    const region = this.querySelector("[data-cart-status]");
    if (!region || !message) return;

    // Clearing first makes an identical repeated message announce again.
    region.textContent = "";
    requestAnimationFrame(() => {
      region.textContent = message;
    });
  };

  /**
   * POST to a Cart API route with bundled section rendering, then swap in the
   * response markup. Requests are serialised so two quick edits cannot land
   * out of order.
   */
  request = (route, body) =>
    (this.#queue = this.#queue
      .then(() => this.#perform(route, body))
      .catch(() => {}));

  /** Re-fetch and swap the cart section, e.g. after an add-to-cart elsewhere. */
  refresh = () =>
    (this.#queue = this.#queue
      .then(async () => {
        const url = `${window.location.pathname}?section_id=${encodeURIComponent(this.sectionId)}`;
        const response = await fetch(url);
        if (!response.ok) return;
        this.#swap(await response.text());
      })
      .catch(() => {}));

  // ---------- Events ----------

  #onClick = (event) => {
    const remove = event.target.closest("[data-cart-remove]");
    if (remove) {
      event.preventDefault();
      const key = this.#keyFor(remove);
      const title = this.#titleFor(remove);
      this.#change(key, 0, { title, removed: true });
      return;
    }

    const step = event.target.closest("[data-cart-step]");
    if (step) this.#step(step);
  };

  #onChange = (event) => {
    const input = event.target.closest(
      '[data-cart-item] input[name^="updates["]',
    );
    if (!input) return;

    this.#change(this.#keyFor(input), input.value, {
      title: this.#titleFor(input),
    });
  };

  /**
   * Nudge the input immediately so the control feels instant, then send one
   * debounced request. The input is the single source of truth for the value,
   * which keeps repeated clicks consistent.
   */
  #step(button) {
    const input = button.parentElement.querySelector('input[name^="updates["]');
    if (!input) return;

    const increment = Number(input.step) || 1;
    const direction = Number(button.dataset.cartStep);
    const min = input.min === "" ? 1 : Number(input.min);
    const max = input.max === "" ? Infinity : Number(input.max);
    const next = Math.min(
      max,
      Math.max(min, Number(input.value) + increment * direction),
    );

    if (next === Number(input.value)) return;
    input.value = String(next);

    const key = this.#keyFor(input);
    clearTimeout(this.#timers.get(key));
    this.#timers.set(
      key,
      setTimeout(() => {
        this.#timers.delete(key);
        this.#change(key, input.value, { title: this.#titleFor(input) });
      }, DEBOUNCE_MS),
    );
  }

  #change(key, quantity, { title = "", removed = false } = {}) {
    if (!key) return;

    this.request("change", { id: key, quantity: Number(quantity) }).then(
      (cart) => {
        if (!cart) return;

        const subtotal =
          this.querySelector("[data-cart-subtotal]")?.textContent.trim() ??
          "";
        this.announce(
          removed
            ? fill(this.#strings.removed, { title, subtotal })
            : fill(this.#strings.updated, { title, quantity, subtotal }),
        );
      },
    );
  }

  // ---------- Request ----------

  async #perform(route, body) {
    const root = window.Shopify?.routes?.root ?? "/";
    const contents = this.contents;
    const focus = this.#captureFocus();

    contents?.setAttribute("aria-busy", "true");
    const slow = setTimeout(
      () => this.announce(this.#strings.loading),
      LOADING_DELAY_MS,
    );

    try {
      const response = await fetch(`${root}cart/${route}.js`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          ...body,
          sections: this.sectionId,
          sections_url: window.location.pathname,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        // 422 means the cart rejected the change (stock, quantity rule, …).
        // The cart is unchanged, so revert the input rather than re-render.
        clearTimeout(slow);
        this.#showError(
          body.id,
          data?.description || data?.message || this.#strings.error,
        );
        return null;
      }

      const html = data?.sections?.[this.sectionId];
      if (html) this.#swap(html, focus);

      this.#syncCount(data.item_count);
      this.dispatchEvent(
        new CustomEvent("cart:updated", {
          bubbles: true,
          detail: { cart: data },
        }),
      );

      return data;
    } finally {
      clearTimeout(slow);
      this.contents?.removeAttribute("aria-busy");
    }
  }

  #swap(html, focus = this.#captureFocus()) {
    const incoming = PARSER.parseFromString(html, "text/html").querySelector(
      "[data-cart-contents]",
    );
    if (!incoming) return;

    this.contents.replaceWith(incoming);
    this.#restoreFocus(focus);
  }

  #showError(key, message) {
    const item = this.querySelector(
      `[data-cart-item][data-key="${CSS.escape(key)}"]`,
    );
    const error = item?.querySelector("[data-cart-error]");
    const input = item?.querySelector('input[name^="updates["]');

    if (input) input.value = input.defaultValue;
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }

    this.announce(message);
  }

  // ---------- Focus ----------

  /**
   * Record what had focus. Line keys are stable across re-renders; indexes are
   * not, so the key is the primary handle and the row index is only the
   * fallback used when that line no longer exists.
   */
  #captureFocus() {
    const active = document.activeElement;
    if (!active || !this.contains(active)) return null;

    const holder = active.closest("[data-focus-id]");
    const row = active.closest("[data-cart-item]");
    const rows = [...this.querySelectorAll("[data-cart-item]")];

    return {
      id: holder?.dataset.focusId ?? null,
      index: row ? rows.indexOf(row) : -1,
    };
  }

  /** Exact control → same line's quantity input → next line → previous line → title. */
  #restoreFocus(focus) {
    if (!focus) return;

    if (focus.id) {
      const exact = this.querySelector(
        `[data-focus-id="${CSS.escape(focus.id)}"]`,
      );
      // A step button can come back disabled at a quantity bound, and focusing
      // a disabled element silently drops focus to <body>.
      if (exact && !exact.disabled) return exact.focus();

      const key = focus.id.slice(0, focus.id.lastIndexOf(":"));
      const sibling = this.querySelector(
        `[data-focus-id="${CSS.escape(`${key}:qty`)}"]`,
      );
      if (sibling) return sibling.focus();
    }

    if (focus.index > -1) {
      const links = [
        ...this.querySelectorAll(
          "[data-cart-item] [data-cart-item-link]",
        ),
      ];
      const next = links[focus.index] ?? links[focus.index - 1];
      if (next) return next.focus();
    }

    this.querySelector("[data-cart-title]")?.focus();
  }

  // ---------- Helpers ----------

  #syncCount(count) {
    if (typeof count !== "number") return;

    const label =
      count === 1 ? this.#strings.count_one : this.#strings.count_other;
    document.querySelectorAll("[data-cart-count]").forEach((element) => {
      element.textContent = fill(label, { count });
    });
  }

  #keyFor(element) {
    return element.closest("[data-cart-item]")?.dataset.key ?? "";
  }

  #titleFor(element) {
    return (
      element
        .closest("[data-cart-item]")
        ?.querySelector("[data-cart-item-link]")
        ?.textContent.trim() ?? ""
    );
  }

  #readStrings() {
    try {
      return JSON.parse(
        this.querySelector("[data-cart-strings]")?.textContent ?? "{}",
      );
    } catch {
      return {};
    }
  }
}

class CartDrawer extends HTMLElement {
  #trigger = null;

  connectedCallback() {
    this.dialog = this.querySelector("dialog");
    if (!this.dialog) return;

    document.addEventListener("click", this.#onDocumentClick);
    window.addEventListener("hashchange", this.#onHashChange);
    this.dialog.addEventListener("click", this.#onDialogClick);
    this.dialog.addEventListener("close", this.#onClose);
    this.addEventListener("click", this.#onCloseClick);

    if (window.location.hash === "#cart") this.open();
  }

  disconnectedCallback() {
    document.removeEventListener("click", this.#onDocumentClick);
    window.removeEventListener("hashchange", this.#onHashChange);
  }

  /**
   * Focus the cart title rather than the close button: a screen reader user
   * then hears "Your cart, 3 items" instead of "Close, button".
   */
  open(trigger = document.activeElement) {
    this.#trigger = trigger;
    this.dialog.showModal();
    document.documentElement.classList.add("cart-open");
    this.querySelector("[data-cart-title]")?.focus();
  }

  close() {
    this.dialog.close();
  }

  #onDocumentClick = (event) => {
    // The trigger is a real link to /cart, so it still works with no JS.
    const trigger = event.target.closest("[data-cart-open]");
    if (!trigger) return;

    event.preventDefault();
    this.open(trigger);
  };

  #onCloseClick = (event) => {
    if (event.target.closest("[data-cart-close]")) this.close();
  };

  // A click on ::backdrop reports the dialog itself as its target.
  #onDialogClick = (event) => {
    if (event.target === this.dialog) this.close();
  };

  // Fires for the close button, Escape, and the backdrop alike.
  #onClose = () => {
    document.documentElement.classList.remove("cart-open");
    this.#trigger?.focus?.();
  };

  #onHashChange = () => {
    if (window.location.hash === "#cart") this.open();
  };
}

/**
 * A custom element name must contain a hyphen, so the cart root is <cart-root>.
 * `cart-drawer` is also the name Dawn and Horizon use: if the theme already
 * defines either, say so instead of failing silently.
 */
function define(name, constructor) {
  if (customElements.get(name)) {
    console.warn(
      `[cart] <${name}> is already defined by this theme. Rename this element and the markup that uses it, or the cart will not work.`
    );
    return;
  }
  customElements.define(name, constructor);
}

define("cart-root", CartRoot);
define("cart-drawer", CartDrawer);

export { CartRoot, CartDrawer };
