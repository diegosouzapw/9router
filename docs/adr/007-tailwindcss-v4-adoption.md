# ADR-007: Tailwind CSS v4 Adoption

## Status

Accepted

## Context

The dashboard needed a CSS solution. Options considered:

- **Vanilla CSS** — full control, but verbose and inconsistent
- **CSS Modules** — scoped styles, but still manual authoring
- **Styled Components** — JS-in-CSS, but runtime overhead
- **Tailwind CSS v3** — utility-first, but config-heavy
- **Tailwind CSS v4** — new engine, CSS-native config, zero-config PostCSS

## Decision

Use **Tailwind CSS v4** with the `@tailwindcss/postcss` plugin.

## Consequences

### Positive

- **Zero config** — no `tailwind.config.js` needed; all customization via CSS
- **CSS-native** — `@theme` directive for design tokens in `globals.css`
- **Smaller bundle** — v4 engine produces smaller output than v3
- **Consistency** — utility classes enforce design system constraints
- **Dark mode** — built-in `dark:` variant with CSS custom properties

### Negative

- **Learning curve** — v4 syntax differs from v3 documentation/tutorials
- **Inline styles remain** — some dynamic styles (computed values) still need `style={{}}`
- **Bundle size** — utility CSS can be large if not tree-shaken (mitigated by v4 engine)
