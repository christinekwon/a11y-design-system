# Accessible Shopify cart

A bare-bones Shopify cart template built to WCAG 2.2 AA, where every CSS rule names the
success criterion it satisfies. `cart-agent-guide.md` is written for an agent: what the
template prioritizes, and how to audit an existing theme's cart and migrate it onto this
one. Run `python3 -m http.server` and open `demo.html` to tab through the drawer against a
stubbed Cart API — focus restoration, screen-reader announcements and the 422 error path
included.

- `cart.liquid` → `snippets/`
- `cart.css` (required), `cart-theme.css` (optional layout), `cart.js` → `assets/`
