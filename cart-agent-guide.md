# Accessible cart — agent guide

You are migrating an existing Shopify theme's cart to this `cart` template, to
**WCAG 2.2 AA**. Attach this file plus `cart.liquid`, `cart.css`, and
`cart.js`, with the target theme open.

## Files

| File             | Installs to | Purpose                                                                                                                                                                                                                                                                                                      |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cart.liquid`    | `snippets/` | Renders every cart state — drawer or page.                                                                                                                                                                                                                                                                   |
| `cart.css`       | `assets/`   | **Required.** The accessibility layer: only rules that satisfy a WCAG 2.2 AA criterion, each naming the criterion it satisfies. Carries no spacing, colour, type or layout, so on its own the cart is correct but unstyled.                                                                                  |
| `cart-theme.css` | `assets/`   | **Optional.** The structure layer: spacing, alignment and hairlines, nothing else. Brand-neutral — borders derive from `currentColor`, so it inherits the theme's palette instead of fighting it. Override it, or delete it and style the classes yourself. Nothing in it is load-bearing for accessibility. |
| `cart.js`        | `assets/`   | Two custom elements, `<cart-root>` and `<cart-drawer>`. No dependencies.                                                                                                                                                                                                                                     |
| `demo.html`      | —           | Static review harness. Not installed. Serve over HTTP (`python3 -m http.server`); `file://` blocks ES modules.                                                                                                                                                                                               |

Install `cart.css` and `cart-theme.css` together to get a cart that looks finished. Install
`cart.css` alone when the theme already has cart styling you want to keep — the accessible
behaviour is identical either way.

```liquid
{{ 'cart.css' | asset_url | stylesheet_tag }}
{{ 'cart-theme.css' | asset_url | stylesheet_tag }}
<script src="{{ 'cart.js' | asset_url }}" type="module"></script>
```

`{% doc %}` needs a 2024-10 or newer theme. On older themes convert the block to
`{% comment %}` — it is documentation either way.

## Rules

1. Keep every existing feature, setting ID, and integration. A migration that drops
   an app's cart hooks or renames a setting is a regression, not a fix.
2. Prefer native HTML to ARIA. `<dialog>`, `<dl>`, `<ul>`, real labels, real buttons.
3. Report bugs that are not accessibility bugs. Do not silently fix them — they are
   someone else's decision, and a mixed diff is hard to review.

Add no dependencies. Ask before running CLI commands. Never push to a live theme.

## What the template prioritizes

Ranked by how often it is the thing that makes a cart unusable, and how hard it is to
retrofit later. If you can only fix part of a cart, fix in this order.

**1. Focus is never lost.** Every interactive element carries
`data-focus-id="{item.key}:{role}"`, and focus is restored after each re-render. Keys are
used rather than indexes because indexes shift exactly when the list changes, which is the
only time restoration matters. When the element is gone the fallback is deliberate: same
line's quantity input → next line → previous line → the cart title. A disabled stepper is
treated as gone, because focusing a disabled element silently drops focus to `<body>`.
_(2.4.3 — the failure that most often makes a cart impossible to operate by keyboard.)_

**2. Native semantics instead of ARIA.** The drawer is a `<dialog>` opened with
`showModal()`, which supplies focus containment, Escape to close, and an inert page with
no code of ours. Items are a real `<ul>`, totals a `<dl>`, every input has a real
`<label>`. Hand-rolled focus traps are the single largest source of cart bugs; the fix is
to stop hand-rolling them. _(4.1.2, 2.1.2)_

**3. One live region, correctly placed.** A single `role="status"` sits inside the dialog
and outside the swapped node. Inside, because content outside an open modal is inert and
would never announce. Outside the swapped node, because replacing a live region mid-update
cancels the announcement. _(4.1.3)_

**4. The server renders every state; JS never builds markup.** Each Cart API call passes
`sections` and `sections_url`, so the response carries re-rendered HTML and JS swaps one
node. Two renderers for one cart is how markup and accessibility drift apart — the Liquid
gets the labels and the JS forgets them.

**5. It works without JavaScript.** On `/cart`, quantity inputs (`updates[]`), "Update
cart", removal (`item.url_to_remove` is a GET URL), and checkout all function unenhanced.
JS-only controls stay hidden behind `cart-root:not(:defined)`, so nothing dead is ever
exposed.

**6. The criteria that live in CSS.** Visible `:focus-visible` indicators, 24px minimum
targets, reflow to 320px, forced-colors support, and motion behind
`prefers-reduced-motion: no-preference`. Each rule in `cart.css` names the criterion it
satisfies. These are last only because they are the cheapest to add — not optional.
_(2.4.7, 2.4.11, 2.5.8, 1.4.10, 1.4.1)_

## Template contract

**Params** — documented inline with LiquidDoc: `is_drawer`, `heading_level`,
`section_id`, `footnote`, `empty_heading`, `empty_message`, `empty_collections`,
`empty_cta_label`, `empty_cta_url`.

**DOM hooks** — JS depends on these; keep them if you re-skin the markup.

| Attribute                                                      | Meaning                                           |
| -------------------------------------------------------------- | ------------------------------------------------- |
| `data-cart-contents`                                           | The node replaced on every update.                |
| `data-cart-item` + `data-key`                                  | A line item, carrying its `item.key`.             |
| `data-focus-id="{key}:{qty\|minus\|plus\|remove}"`             | Focus restoration target.                         |
| `data-cart-step="1\|-1"`                                       | Quantity stepper.                                 |
| `data-cart-remove`                                             | Remove control.                                   |
| `data-cart-error`                                              | Per-line error, referenced by `aria-describedby`. |
| `data-cart-status`                                             | The persistent live region.                       |
| `data-cart-subtotal`, `data-cart-title`, `data-cart-item-link` | Read when announcing and restoring focus.         |
| `data-cart-open` / `data-cart-close`                           | Drawer trigger (a link to `/cart`) / close.       |
| `data-cart-count`                                              | Any element showing the count outside the cart.   |

**JS API** — on the `<cart-root>` element.

```js
const cart = document.querySelector("cart-root");
await cart.request("update", { note: "Leave at the door" }); // any /cart/*.js route
await cart.refresh(); // re-fetch the section
cart.announce("Gift wrap added."); // speak into role="status"
```

**Events** — `cart:updated` is dispatched after each successful update with
`detail.cart`. Dispatch `cart:refresh` on `document` from your add-to-cart code.

**CSS custom properties** — see Files above for what each stylesheet is for.

| Layer            | Tokens                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `cart.css`       | `--cart-focus`, `--cart-focus-width`, `--cart-focus-offset`, `--cart-target`, `--cart-error`, `--cart-surface`, `--cart-width` |
| `cart-theme.css` | `--cart-gap`, `--cart-radius`, `--cart-rule`                                                                                   |

All are declared at `:where(:root)` — zero specificity, so overriding them on `.cart` or
`.cart-dialog` always wins. They must not be scoped to `.cart`: the dialog is its parent
and would not inherit them.

**Locale** — merge into `locales/en.default.json`. The template renders
`Translation missing` without these. JS-facing strings use `{token}`, not Liquid's
`%{token}`, so `t` passes them through for JS to interpolate.

```json
{
  "cart": {
    "title": "Your cart",
    "item_count": { "one": "1 item", "other": "{{ count }} items" },
    "close": "Close",
    "continue_shopping": "Continue shopping",
    "price": "Price",
    "regular_price": "Regular price",
    "sale_price": "Sale price",
    "discount_amount": "−{{ amount }}",
    "subscription": "Subscription",
    "quantity_for": "Quantity, {{ title }}",
    "decrease_for": "Decrease quantity for {{ title }}",
    "increase_for": "Increase quantity for {{ title }}",
    "remove": "Remove",
    "remove_for": "Remove {{ title }}",
    "update": "Update cart",
    "original_total": "Original total",
    "subtotal": "Subtotal",
    "checkout": "Checkout",
    "count_one": "1 item",
    "count_other": "{count} items",
    "status": {
      "updated": "{title}, quantity {quantity}. Subtotal {subtotal}.",
      "removed": "Removed {title}. Subtotal {subtotal}.",
      "loading": "Updating cart",
      "error": "Your cart could not be updated."
    }
  }
}
```

## Migrating an existing cart

**1. Inventory.** Find the cart: `grep -rln "cart.item_count\|cart.items" sections snippets`.
List every feature and setting ID. Stop and report if the cart is rendered by an app or
the storefront is headless — the fix is not in the theme.

**2. Audit.** Work the checklist below against the files you found. Record file, line,
success criterion.

**3. Plan.** Default to **replace**: render `cart` and map each existing setting to a
param. Choose **retrofit** — applying the checklist fixes in place — for Dawn- or
Horizon-based themes, where the cart is already close, and for app-heavy carts whose
markup you do not control. Confirm the choice with the user before editing.

**4. Implement.** Keep the section's `{% schema %}` and setting IDs exactly as they are, so
merchant configuration survives. Map settings to params in the section, not the snippet.

**5. Verify.** All of these, and report what you could not run:

- `shopify theme check`
- Keyboard only: open, tab the whole cart, change a quantity, remove an item, remove the
  last item, Escape. Focus must be visible at all times and never land on `<body>`.
- Screen reader (VoiceOver or NVDA): the dialog announces its name on open; quantity
  inputs have names; updates and errors are announced once each, not twice.
- 400% zoom and a 320px viewport: no horizontal scrolling, nothing clipped.
- Forced colors, `prefers-reduced-motion: reduce`, and 4.5:1 text contrast.
- axe DevTools on the open cart, not just the closed page.
- `/cart` with JavaScript disabled: edit a quantity, remove an item, reach checkout.

**6. Report.** Per finding: file and line, success criterion, what changed. List non-a11y
bugs separately as "found, not fixed".

## Audit checklist

| Failure                                                 | Find it                                          | SC           | Fix                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------ |
| `aria-hidden` on a container holding focusable children | `grep -n "aria-hidden" `                         | 4.1.2        | Render one state or the other. Never hide a focusable subtree from assistive tech while leaving it tabbable. |
| `tabindex` toggled to fake inertness                    | `grep -n 'tabindex="{%'`                         | 2.4.3        | Delete it. Re-render instead of hiding.                                                                      |
| Icon button with no accessible name                     | `grep -n "icon-" \| grep button`                 | 4.1.2        | Visible glyph `aria-hidden="true"` plus a visually hidden text label.                                        |
| Drawer with no dialog semantics                         | `grep -rn "overlay\|drawer\|minicart"`           | 4.1.2, 2.1.2 | `<dialog>` + `showModal()`. A clickable overlay `<div>`/`<button>` is not a dialog.                          |
| `aria-labelledby` pointing at a whole region            | `grep -n "aria-labelledby"`                      | 2.4.6        | Point it at the heading element's id, not the container's.                                                   |
| Placeholder used as the label                           | `grep -n "placeholder"`                          | 3.3.2, 1.3.1 | A real `<label for>`. Keep the placeholder only as an example value.                                         |
| Update not announced                                    | no `role="status"` / `aria-live` near the cart   | 4.1.3        | One persistent polite live region inside the dialog.                                                         |
| Focus lost after re-render                              | `innerHTML =` / `replaceWith` with no `.focus()` | 2.4.3        | Capture a stable key before the swap, restore after. Fall back deliberately.                                 |
| `tabindex` greater than 0                               | `grep -nE 'tabindex="[1-9]'`                     | 2.4.3        | Fix the DOM order instead.                                                                                   |
| `outline: none`                                         | `grep -rn "outline: *none\|outline: *0" assets`  | 2.4.7        | Style `:focus-visible`; never remove the indicator.                                                          |
| State shown by colour alone                             | discount pills, error text, active dots          | 1.4.1        | Add text, weight, border, or an icon.                                                                        |
| Target under 24×24px                                    | steppers, remove, carousel dots                  | 2.5.8        | `min-width`/`min-height`, or enough spacing.                                                                 |
| Focused control under a sticky bar                      | sticky cart footers                              | 2.4.11       | `scroll-padding-block-end` on the scroll container.                                                          |
| Auto-rotating upsell carousel                           | `setInterval` near slider code                   | 2.2.2        | Remove the timer, or add a visible pause control.                                                            |
| Decorative image with filled `alt`                      | `grep -n "alt=" `                                | 1.1.1        | `alt=""` when the product title is adjacent — otherwise it is announced twice.                               |
| Redundant `aria-label` on a link                        | `aria-label="Link to …"`                         | 2.5.3        | Delete it. The visible text is the better name.                                                              |

## Extending the template

Both patterns use only the public API, so they survive a template update.

**Free-shipping progress.** A `<progress>` labelled by its own message — the element
carries the value, the text carries the meaning, and no live region is needed because the
whole cart re-renders and the message is read in place.

```liquid
{%- assign remaining = threshold | minus: cart.total_price -%}
<p id="ship-msg">
  {%- if remaining > 0 -%}
    {{ 'cart.free_shipping' | t: amount: remaining_money }}
  {%- else -%}
    {{ 'cart.free_shipping_reached' | t }}
  {%- endif -%}
</p>
<progress id="ship" max="{{ threshold }}" value="{{ cart.total_price }}"
  aria-labelledby="ship-msg"></progress>
```

Put this inside `[data-cart-contents]` so it re-renders with the cart. Thresholds are
in cents, like `cart.total_price`.

**Discount code.** An invalid code still returns HTTP 200, so check
`discount_codes[].applicable` rather than the status.

```js
const cart = document.querySelector("cart-root");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = form.elements.discount.value.trim();
  const data = await cart.request("update", { discount: code });
  const entry = data?.discount_codes?.find((d) => d.code === code);
  cart.announce(entry?.applicable ? strings.applied : strings.invalid);
});
```

Order note (`<details>` + `/cart/update.js` with `note`), gift wrap (a checkbox writing a
cart attribute), and upsells (a plain list; an APG carousel only if genuinely required)
follow the same shape: render server-side inside the contents node, call `request()`,
announce the outcome.
