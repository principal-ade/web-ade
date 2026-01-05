# Safari Mobile Viewport Implementation

## Current Status
⚠️ **IN PROGRESS** - Implementation uses modern CSS viewport units and safe area handling. Better than before, but still has minor issues after login redirects.

**Last Updated:** 2026-01-05

---

## The Problem

When the web app loads in Safari mobile (especially after login redirects), white space can appear at the bottom of the viewport. Safari's address bar and toolbar dynamically show/hide, causing the viewport height to change, but traditional `100vh` doesn't adjust dynamically.

### What Happens
1. User logs in → Safari shows address bar and toolbar
2. Page redirects back → Viewport is initially small (bars visible)
3. Safari hides UI bars → Viewport expands
4. Layout doesn't always adjust → White space appears at bottom

---

## Current Implementation

### 1. Dynamic Viewport Height (`dvh`)

We use the modern `dvh` (dynamic viewport height) unit which automatically adjusts when Safari's UI bars show/hide.

**File:** `src/app/globals.css`
```css
.h-dvh-fallback {
  height: 100vh;  /* Fallback for older browsers */
  height: 100dvh; /* Dynamic viewport - adjusts when Safari bars show/hide */
}
```

**File:** `src/app/page.tsx`
```tsx
<div className="w-screen overflow-hidden flex flex-col h-dvh-fallback">
  {/* ... */}
</div>
```

**Browser Support:**
- Safari 15.4+ (March 2022): Uses `100dvh` (dynamic)
- Older browsers: Falls back to `100vh` (static)

### 2. Safe Area Insets

We handle iOS safe areas (notch, home indicator) in the mobile tab navigation.

**File:** `@principal-ade/panels/src/components/MobileTabNav.css`
```css
.mobile-tab-button {
  padding: 14px 8px;
  padding-bottom: calc(16px + min(12px, env(safe-area-inset-bottom, 0px)));
}
```

**How it works:**
- Desktop: 14px top, 16px bottom
- iPhone: 14px top, 28px bottom (16px + 12px extra for home indicator)
- The `min()` ensures we add at most 12px, not the full 34px safe area

**File:** `src/app/layout.tsx`
```tsx
export const viewport: Viewport = {
  viewportFit: "cover",  // Allows content to extend into safe areas
  // ...
};
```

---

## How It Works

### Viewport Height Strategy

Instead of trying to measure and track viewport changes with JavaScript, we use CSS viewport units that Safari natively understands:

- **`100vh`**: Static viewport height (doesn't change when bars show/hide)
- **`100dvh`**: Dynamic viewport height (automatically adjusts)

When Safari's address bar hides after a redirect, `100dvh` automatically expands the container to fill the space.

### Safe Area Strategy

1. **Enable safe area extension** with `viewport-fit: cover`
2. **Add padding to UI elements** that should avoid safe areas (like bottom tabs)
3. **Use `min()` to cap the padding** so we don't add the full safe area inset (which is too much)

---

## Why Previous Approaches Failed

### JavaScript + CSS Variables
We initially tried measuring `visualViewport.height` and setting a `--vh` CSS variable. Problems:
- Safari doesn't always recalculate `calc(var(--vh) * 100)` when the variable changes
- Requires event listeners and forced reflows
- Complex timing issues with redirects

### Using Full Safe Area Inset
We tried `calc(12px + env(safe-area-inset-bottom))` which added the full 34px safe area to existing padding:
- Result: 12px + 34px = 46px total (way too much!)
- Now we use `min()` to cap it at 12px extra

---

## Known Issues

1. **Still has white space after login redirects** - Though improved, there are still cases where white space appears
2. **Timing dependent** - The issue seems related to when Safari's bars animate vs when the page renders

---

## Files Modified

### Web-ADE
- `src/app/globals.css` - Added `.h-dvh-fallback` utility class
- `src/app/page.tsx` - Uses `h-dvh-fallback` class instead of `h-screen`
- `src/app/layout.tsx` - Sets `viewportFit: "cover"` for safe area support
- `src/components/EditorHeader.tsx` - Reduced safe area top padding (0.75rem → 0.5rem)

### Panels Package (@principal-ade/panels v1.0.50)
- `src/components/MobileTabNav.css` - Tab buttons use `min()` for safe area bottom padding

### Panel Layouts (@principal-ade/panel-layouts v0.3.16)
- Updated to use `@principal-ade/panels@^1.0.50`

---

## Key Learnings

1. **Modern CSS viewport units** (`dvh`, `svh`, `lvh`) are designed for this exact problem
2. **Safe area insets** should be capped with `min()` - using the full inset value is often too much
3. **Static `100vh` doesn't adjust** when Safari's dynamic UI bars show/hide
4. **TypeScript doesn't allow duplicate object properties** - use CSS classes for fallback patterns

---

## References

- [CSS Viewport Units - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/length#viewport-percentage_lengths)
- [Dynamic Viewport Units (dvh, svh, lvh)](https://web.dev/viewport-units/)
- [Visual Viewport API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API)
- [CSS env() - Safe Area Insets](https://developer.mozilla.org/en-US/docs/Web/CSS/env)

---

## Next Steps (TODO)

- [ ] Investigate why `dvh` doesn't fully solve the post-redirect white space
- [ ] Consider if `position: fixed` approach would be more reliable
- [ ] Test on various iOS versions and devices
- [ ] Apply same approach to other pages (currently only home page uses `dvh`)
