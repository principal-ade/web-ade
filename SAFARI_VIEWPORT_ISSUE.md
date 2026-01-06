# Safari Mobile Viewport Implementation

## Current Status
⚠️ **PARTIAL SOLUTION** - Using position: relative with height: 100vh. Works but has minor bottom spacing issue related to top safe area inset. Further research needed on -webkit-fill-available.

**Last Updated:** 2026-01-06

---

## The Problem

When the web app loads in Safari mobile (especially after login redirects), white space can appear at the bottom of the viewport. Safari's address bar and toolbar dynamically show/hide, causing the viewport height to change.

### What Happens
1. User logs in → Safari shows address bar and toolbar
2. Page redirects back → Container renders at correct height initially
3. **Safari recalculates safe areas** → Container shrinks by ~34px (safe-area-inset-bottom)
4. Layout has gap at bottom that persists until device rotation forces recalculation

---

## Current Implementation

### 1. Position Relative Approach

After extensive debugging, we discovered that `position: fixed` has a critical Safari bug where it shrinks after redirects. We switched to `position: relative` which inherits the body's stability.

**File:** `src/app/globals.css`
```css
.h-viewport-fixed {
  position: relative;
  height: 100vh;
  width: 100%;
}
```

**File:** `src/app/page.tsx`
```tsx
<div className="h-viewport-fixed overflow-hidden flex flex-col">
  <EditorHeader />
  <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
    <div className="absolute inset-0">
      <ResponsiveConfigurablePanelLayout />
    </div>
  </div>
</div>
```

**How it works:**
- `position: relative` like the body element (which works perfectly)
- `height: 100vh` provides stable height that doesn't recalculate
- Flex layout with `flex: 1` child fills remaining space after header
- Absolute wrapper (`inset-0`) provides explicit height for ResponsiveConfigurablePanelLayout

### 2. Safe Area Insets

**File:** `src/components/EditorHeader.tsx`
```tsx
paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)'
```
- Adds ~44px on iPhone with notch
- This padding at the top is KEY to understanding the bottom spacing issue

**File:** `@principal-ade/panels/src/components/MobileTabNav.css`
```css
.mobile-tab-button {
  padding: 14px 8px;
  padding-bottom: calc(16px + min(12px, env(safe-area-inset-bottom, 0px)));
}
```

**File:** `src/app/layout.tsx`
```tsx
export const viewport: Viewport = {
  viewportFit: "cover",  // Allows content to extend into safe areas
  // ...
};
```

---

## Why Previous Approaches Failed

### 1. Dynamic Viewport Height (`dvh`) - iOS 26 Bug
**Tried:** `height: 100dvh`

**Problems:**
- **iOS 26 Safari bug**: `100dvh` no longer covers the full screen, leaving a gap at the bottom
- Confirmed regression in Safari iOS 26
- The bug affects overlays, modals, and full-height containers
- **Conclusion**: `dvh` units are unreliable in production

**References:**
- [Safari iOS 26 viewport bug - Apple Community](https://discussions.apple.com/thread/256138682)
- [New IOS Safari CSS Issue with DVH - Apple Developer Forums](https://developer.apple.com/forums/thread/803987)

### 2. Position Fixed - Shrinks After Redirect
**Tried:** `position: fixed; top: 0; left: 0; right: 0; bottom: 0;`

**Problems:**
- Container renders correctly on initial load
- **After redirect, shrinks by exactly 34px** (safe-area-inset-bottom size)
- Safari recalculates what `bottom: 0` means based on safe areas
- Device rotation fixes it (forces recalculation), but not reliable
- Using `!important`, `min-height: 100vh`, negative margins all failed
- **Conclusion**: `position: fixed` is viewport-relative, Safari recalculates it unpredictably

### 3. JavaScript + CSS Variables
**Tried:** Measuring `visualViewport.height` and setting a `--vh` CSS variable

**Problems:**
- Safari doesn't always recalculate `calc(var(--vh) * 100)` when the variable changes
- Requires event listeners and forced reflows
- Complex timing issues with redirects

---

## Critical Discovery: The -webkit-fill-available Solution

### What We Found

When debugging why the body element (`position: relative`, `min-height: 100vh`) works perfectly but our container doesn't, we discovered Safari has a **known bug with flex containers and viewport height**.

**The Issue:**
- Safari treats `height: 100vh` as `auto` on flex containers
- Our container has `className="flex flex-col"` making it a flex container
- This is why the same CSS that works for body doesn't work for our container

**The Solution:**
```css
.h-viewport-fixed {
  position: relative;
  height: 100vh; /* Fallback for non-webkit browsers */
  height: -webkit-fill-available; /* Safari/WebKit specific fix */
  width: 100%;
}
```

**Results:**
- ✅ **Safari**: Works perfectly! Container fills entire viewport, no shrinking
- ❌ **Chrome**: Breaks the layout (Chrome also uses WebKit but handles it differently)

**References:**
- [Add -webkit-fill-available for 100vh - Tailwind Discussion](https://github.com/tailwindlabs/tailwindcss/discussions/4515)
- [Fluid Flexbox height Safari - CSS-Tricks](https://css-tricks.com/forums/topic/fluid-flexbox-height-safari/)
- [100vh problem with iOS Safari - DEV Community](https://dev.to/maciejtrzcinski/100vh-problem-with-ios-safari-3ge9)
- [Flexbox Relative Height Issue in iOS 10](https://www.damirscorner.com/blog/posts/20180209-FlexboxRelativeHeightIssueInIos10.html)

---

## Key Insight: Bottom Spacing is Related to Top Safe Area

### The Revelation

After extensive debugging with colored layers (red body, blue container, green flex child, yellow wrapper), we discovered:

**The bottom spacing (~34px gap) is NOT because the container is too short.**

**It's because the EditorHeader adds top safe area padding:**
```tsx
paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)'  // ~44px on iPhone
```

This extra padding at the top pushes content down, and the flex-1 child doesn't account for it properly, leaving space at the bottom.

### The Layout Chain

```
Container: height: 100vh (e.g., 844px on iPhone 14)
├── EditorHeader: base height + 44px (safe-area-inset-top) + 0.5rem
└── Flex child (flex: 1): Gets remaining space
    └── But doesn't fill it properly due to Safari flex bug
```

The container IS the right height, but the children inside don't fill it correctly.

---

## Why the Absolute Wrapper Layer is Needed

```tsx
<div style={{ flex: 1, ... }}>
  <div className="absolute inset-0">  {/* ← CRITICAL */}
    <ResponsiveConfigurablePanelLayout />
  </div>
</div>
```

**The ResponsiveConfigurablePanelLayout uses `height: 100%` in its CSS.**

**Problem:** CSS percentage heights only work when the parent has an explicit height value. But `flex: 1` is a *computed* height, not an explicit one.

**Solution:** The absolute positioned wrapper with `inset-0` creates an explicit box that fills the flex parent, giving the panel layout a proper height reference.

**From research:** Safari considers height undefined in flex children and treats it as auto, but the absolute wrapper provides the explicit sizing needed.

---

## Safari's Flex Container Bug

**Core Issue:** Safari treats `height: 100vh` differently on flex containers than on normal elements.

**Why body works but our container doesn't:**
- Body: `position: relative` + `min-height: 100vh` → Works perfectly
- Container: `position: relative` + `height: 100vh` + `flex flex-col` → Doesn't fill properly

**The difference:** The `display: flex` on the container triggers Safari's flexbox height calculation bug.

**Fix attempts:**
- `height: 0` on flex child → Didn't help
- `minHeight: 0` on flex child → Required but not sufficient alone
- `-webkit-fill-available` → **Works perfectly but breaks Chrome**

---

## Known Issues

### Current Issues
1. **~34px gap at bottom on Safari mobile** - Minor spacing issue remains
2. **Related to top safe area inset** - EditorHeader's top padding affects bottom spacing
3. **Not a show-stopper** - App is functional, layout mostly correct

### The -webkit-fill-available Dilemma
- **Need browser detection** to apply `-webkit-fill-available` only to Safari, not Chrome
- **Both use WebKit** but handle it differently
- **Potential solution:** User agent detection or feature detection
- **Requires more research**

---

## Files Modified

### Web-ADE
- `src/app/globals.css` - Changed to `.h-viewport-fixed` using position: relative + height: 100vh
- `src/app/page.tsx` - Flex layout with absolute wrapper for panel layout
- `src/app/layout.tsx` - Sets `viewportFit: "cover"` for safe area support
- `src/components/EditorHeader.tsx` - Has top safe area padding (causes bottom spacing)

### Panels Package (@principal-ade/panels v1.0.50)
- `src/components/MobileTabNav.css` - Tab buttons use `min()` for safe area bottom padding

### Panel Layouts (@principal-ade/panel-layouts v0.3.16)
- Updated to use `@principal-ade/panels@^1.0.50`

---

## Key Learnings

1. **iOS 26 Safari broke `dvh` units** - Modern viewport units have regression bugs
2. **Position fixed shrinks after redirects** - Safari recalculates viewport-relative positioning unpredictably
3. **Position relative is more stable** - Inherits body's stability, doesn't get recalculated
4. **Safari has a flex container height bug** - Treats `100vh` as `auto` on flex containers
5. **-webkit-fill-available solves Safari but breaks Chrome** - Need browser detection
6. **Bottom spacing is caused by top safe area inset** - EditorHeader's top padding affects layout
7. **Absolute wrapper is critical** - Provides explicit height for percentage-based children
8. **Body element proves the solution** - `position: relative` + `min-height: 100vh` works perfectly
9. **Colored debug layers are invaluable** - Red/blue/green/yellow helped identify which layer was short
10. **TypeScript doesn't allow duplicate object properties** - Use CSS classes for fallback patterns

---

## References

### Safari Viewport Issues
- [CSS fix for 100vh in mobile WebKit - Matt Smith](https://allthingssmitty.com/2020/05/11/css-fix-for-100vh-in-mobile-webkit/)
- [100vh problem with iOS Safari - DEV Community](https://dev.to/maciejtrzcinski/100vh-problem-with-ios-safari-3ge9)
- [Safari iOS 26 viewport bug - Apple Community](https://discussions.apple.com/thread/256138682)
- [Does Safari 15 finally fix viewport height?](https://lukechannings.com/blog/2021-06-09-does-safari-15-fix-the-vh-bug/)

### Flexbox and Height Issues
- [Add -webkit-fill-available for 100vh classes - Tailwind](https://github.com/tailwindlabs/tailwindcss/discussions/4515)
- [Fluid Flexbox height Safari - CSS-Tricks](https://css-tricks.com/forums/topic/fluid-flexbox-height-safari/)
- [Flexbox Relative Height Issue in iOS 10](https://www.damirscorner.com/blog/posts/20180209-FlexboxRelativeHeightIssueInIos10.html)
- [100% height doesn't work within flex item child](https://github.com/philipwalton/flexbugs/issues/197)

### Viewport Units
- [CSS Viewport Units - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/length#viewport-percentage_lengths)
- [Dynamic Viewport Units (dvh, svh, lvh)](https://web.dev/viewport-units/)
- [Understanding Mobile Viewport Units - Medium](https://medium.com/@tharunbalaji110/understanding-mobile-viewport-units-a-complete-guide-to-svh-lvh-and-dvh-0c905d96e21a)

### Safe Areas
- [CSS env() - Safe Area Insets - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- [Designing Websites for iPhone X - WebKit](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)

---

## Next Steps (TODO)

### Immediate Research Needed
- [ ] Research browser detection for -webkit-fill-available
  - User agent detection vs feature detection
  - Apply `-webkit-fill-available` only to Safari, not Chrome
  - Test on Safari iOS, Safari macOS, Chrome desktop, Chrome mobile

### Alternative Solutions to Explore
- [ ] Try using `@supports` to detect -webkit-fill-available support differently on Safari vs Chrome
- [ ] Investigate if newer viewport units (svh, lvh) work better than 100vh
- [ ] Research if there's a way to make flex containers respect 100vh on Safari without -webkit-fill-available
- [ ] Consider if adjusting EditorHeader's top safe area padding would help bottom spacing

### Testing
- [ ] Test current implementation on various iOS versions (15, 16, 17, 18+)
- [ ] Verify behavior after login redirects on real devices
- [ ] Test on different iPhone models (with/without notch, different safe areas)
- [ ] Measure exact bottom gap size on different devices

### Implementation Ideas
- [ ] Create a Safari-specific CSS class that applies -webkit-fill-available
- [ ] Use JavaScript to detect Safari and apply class dynamically
- [ ] Consider using CSS Grid instead of Flexbox (might avoid the flex height bug)
- [ ] Apply same approach to other pages (currently only home page uses this)

### Documentation
- [ ] Document browser detection approach once implemented
- [ ] Create test matrix for different devices and browsers
- [ ] Add screenshots showing the issue and the fix

---

## Debug Technique Used

During this investigation, we used colored background layers to identify exactly which layer was stopping short:

```css
body { background: red; }
.h-viewport-fixed { background: blue; }
.flex-child { background: green; }
.absolute-wrapper { background: yellow; }
```

This visual debugging revealed:
1. Red showing = body visible (container too short)
2. Blue showing = container visible but children too short
3. Green showing = flex child visible but wrapper too short
4. Panel content covering all = working correctly

**Key moment:** When we saw "red → white → panel content" (no blue), we knew the container's theme background was overriding the CSS debug color, confirming the container existed but was short.

