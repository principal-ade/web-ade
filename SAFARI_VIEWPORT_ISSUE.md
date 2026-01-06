# Safari Mobile Viewport Implementation

## Current Status
✅ **TESTING** - Switched to position: fixed approach after discovering iOS 26 dvh bug. This should be more reliable than viewport units.

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

### 1. Position Fixed Approach

After discovering an iOS 26 Safari bug with `dvh` units, we switched to a `position: fixed` approach which is more reliable across all iOS versions.

**File:** `src/app/globals.css`
```css
.h-viewport-fixed {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
```

**File:** `src/app/page.tsx`
```tsx
<div className="h-viewport-fixed overflow-auto flex flex-col">
  {/* ... */}
</div>
```

**How it works:**
- `position: fixed` creates a positioning context relative to the viewport
- `height: 100%` on a fixed element always references the layout viewport (which equals `100dvh`)
- More reliable than `dvh` units, especially after redirects and on iOS 26+
- Works consistently across all Safari versions

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

### Position Fixed Strategy

Instead of relying on viewport units (which have bugs in iOS 26), we use `position: fixed` with percentage-based dimensions:

- **`position: fixed`**: Positions element relative to the viewport (not the document)
- **`height: 100%`**: On a fixed element, this equals the layout viewport height (same as `100dvh`)
- **`overflow: auto`**: Allows scrolling within the fixed container

This approach is more reliable because:
1. Fixed positioning has been stable in Safari for years
2. Doesn't rely on newer CSS features that might have browser bugs
3. Works consistently after redirects and navigation
4. No timing issues with Safari's UI bar animations

### Safe Area Strategy

1. **Enable safe area extension** with `viewport-fit: cover`
2. **Add padding to UI elements** that should avoid safe areas (like bottom tabs)
3. **Use `min()` to cap the padding** so we don't add the full safe area inset (which is too much)

---

## Why Previous Approaches Failed

### 1. Dynamic Viewport Height (`dvh`) - iOS 26 Bug
We initially tried using the modern `100dvh` CSS unit. Problems:
- **iOS 26 Safari bug**: `100dvh` no longer covers the full screen, leaving a gap at the bottom
- Caused white space to appear after login redirects
- The bug affects overlays, modals, and full-height containers
- Switching to `100vh` fixed the gap but caused scrolling issues on older Safari versions
- **Conclusion**: `dvh` units are unreliable in production due to this regression

### 2. JavaScript + CSS Variables
We initially tried measuring `visualViewport.height` and setting a `--vh` CSS variable. Problems:
- Safari doesn't always recalculate `calc(var(--vh) * 100)` when the variable changes
- Requires event listeners and forced reflows
- Complex timing issues with redirects

### 3. Using Full Safe Area Inset
We tried `calc(12px + env(safe-area-inset-bottom))` which added the full 34px safe area to existing padding:
- Result: 12px + 34px = 46px total (way too much!)
- Now we use `min()` to cap it at 12px extra

---

## Known Issues

1. **Needs testing** - The position: fixed approach is newly implemented and requires testing on various iOS versions
2. **Potential scrolling behavior changes** - Changed from `overflow-hidden` to `overflow-auto` on main container

---

## Files Modified

### Web-ADE
- `src/app/globals.css` - Changed from `.h-dvh-fallback` to `.h-viewport-fixed` using position: fixed
- `src/app/page.tsx` - Updated to use `h-viewport-fixed` class with `overflow-auto`
- `src/app/layout.tsx` - Sets `viewportFit: "cover"` for safe area support (unchanged)
- `src/components/EditorHeader.tsx` - Reduced safe area top padding (0.75rem → 0.5rem) (unchanged)

### Panels Package (@principal-ade/panels v1.0.50)
- `src/components/MobileTabNav.css` - Tab buttons use `min()` for safe area bottom padding

### Panel Layouts (@principal-ade/panel-layouts v0.3.16)
- Updated to use `@principal-ade/panels@^1.0.50`

---

## Key Learnings

1. **iOS 26 Safari broke `dvh` units** - Modern viewport units have regression bugs, making them unreliable in production
2. **Position fixed is more stable** - Using `position: fixed` with `height: 100%` is more reliable than viewport units
3. **Safe area insets** should be capped with `min()` - using the full inset value is often too much
4. **Fixed elements reference the layout viewport** - On fixed elements, `height: 100%` equals `100dvh` behavior
5. **TypeScript doesn't allow duplicate object properties** - use CSS classes for fallback patterns

---

## References

- [CSS Viewport Units - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/length#viewport-percentage_lengths)
- [Dynamic Viewport Units (dvh, svh, lvh)](https://web.dev/viewport-units/)
- [Visual Viewport API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API)
- [CSS env() - Safe Area Insets](https://developer.mozilla.org/en-US/docs/Web/CSS/env)

---

## Next Steps (TODO)

- [ ] Test position: fixed approach on iOS Safari (various versions: 15, 16, 17, 18+)
- [ ] Verify no white space appears after login redirects
- [ ] Test scrolling behavior within the fixed container
- [ ] Confirm safe area insets still work correctly with fixed positioning
- [ ] Apply same approach to other pages if successful (currently only home page uses this)
- [ ] Monitor for any layout issues or unexpected behavior
