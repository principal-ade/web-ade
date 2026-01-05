# Safari Mobile Viewport White Space Issue

## Problem Summary

When the web app loads in Safari mobile (especially after login redirects), white space appears at the bottom of the viewport. The white space doesn't go away until the user scrolls down, at which point the page correctly fills the viewport.

## Original Issue

- App loads in a bookmarked Safari page
- Login redirect causes Safari's address bar to appear/disappear
- After the bars disappear, persistent white space remains at bottom
- Only goes away after user scrolls or rotates device

## Our Initial Understanding

We thought Safari's dynamic UI bars (address bar, toolbar) were causing viewport height miscalculations:

```
Login → Safari shows UI bars → Viewport shrinks → Page renders small →
Bars hide → Viewport grows → BUT page stays small → White space
```

## Attempted Solutions

### 1. First Approach: CSS Variable for Dynamic Height
**What we did:**
- Created ViewportHeightManager component
- Updates `--vh` CSS variable based on `window.innerHeight`
- Used `calc(var(--vh, 1vh) * 100)` for container heights
- Added multiple event listeners: resize, orientationchange, visualViewport resize/scroll, focus

**Result:** Partially worked, but white space still appeared after login redirects

### 2. Second Approach: Body Height Constraints
**What we did:**
- Changed body from `min-height` to fixed `height`
- Set `overflow: hidden` on html/body
- Forced reflow with `document.documentElement.offsetHeight`

**Result:** Created new issues - white space on initial page load

### 3. Third Approach: Safe Area Handling
**What we did:**
- Initially removed `paddingBottom: env(safe-area-inset-bottom)`
- Thought we were double-adding safe area padding
- Then realized this was wrong and reverted it

**Result:** Made things worse - safe areas are needed for notch/home indicator

### 4. Fourth Approach: visualViewport API
**What we did:**
- Switched from `window.innerHeight` to `window.visualViewport.height`
- Changed from h-screen-safe class to inline `calc(var(--vh) * 100)`
- Removed safe-area padding (then added back)

**Why:** `visualViewport.height` excludes safe areas, keyboard, and toolbars
**Result:** Better, but white space still persists after redirects

### 5. Fifth Approach: Extended Timing & pageshow Event
**What we did:**
- Extended timeouts from 500ms to 1500ms
- Added 8 staggered viewport checks: 0, 50, 100, 250, 500, 750, 1000, 1500ms
- Added `pageshow` event listener for post-navigation updates
- Wrapped measurements in `requestAnimationFrame`

**Why:** Thought Safari's animations took longer than we were checking
**Result:** Still didn't fix it

### 6. Sixth Approach: Aggressive Repaint Strategy
**What we did:**
- Double `requestAnimationFrame` for repaint
- Force reflow on both documentElement and body
- Only update when `--vh` value actually changes
- Added `visibilitychange` listener
- Removed scroll-based listeners

**Why:** User clarified that **scrolling triggers the fix**, suggesting a repaint issue
**Result:** Still not working

## Current Understanding

### The Real Problem

The issue is NOT about:
- ❌ Measuring viewport height at wrong time
- ❌ Safari's animation timing
- ❌ Missing safe area padding
- ❌ Wrong height calculation

The issue IS about:
- ✅ **Browser not recalculating layout when CSS variable changes**
- ✅ **Scrolling triggers natural browser repaint → fixes layout**
- ✅ **Need to force repaint/reflow more aggressively**

### What Happens

```
1. Login redirect occurs
2. ViewportHeightManager updates --vh = 8px ✅
3. Safari sees the CSS variable change ✅
4. Safari DOES NOT recalculate calc(var(--vh) * 100) expressions ❌
5. Layout stays at old height
6. White space appears (viewport is bigger than rendered content)
7. User scrolls → Browser repaints → Recalculates calc() → Fixed!
```

## Technical Details

### Safari's Visual Viewport API

```javascript
window.visualViewport.height  // Visible area (excludes notch, keyboard, bars)
window.innerHeight             // Full screen (includes everything)
```

On iPhone with notch:
- `innerHeight` might be 844px (full screen including safe areas)
- `visualViewport.height` might be 800px (actual visible content area)

### Current Implementation

**ViewportHeightManager.tsx:**
```typescript
const updateVH = () => {
  requestAnimationFrame(() => {
    const height = window.visualViewport?.height ?? window.innerHeight;
    const vh = height * 0.01;
    const newVh = `${vh}px`;

    if (currentVh !== newVh) {
      document.documentElement.style.setProperty('--vh', newVh);
      void document.documentElement.offsetHeight;  // Force reflow

      requestAnimationFrame(() => {
        void document.body.offsetHeight;  // Second reflow
      });
    }
  });
};
```

**Event Listeners:**
- `resize` - window resize
- `orientationchange` - device rotation
- `visualViewport.resize` - Safari UI bar changes
- `pageshow` - after navigation/redirects
- `visibilitychange` - page becomes visible
- **Timeouts:** 0, 50, 100, 250, 500, 750, 1000, 1500ms after mount

**Container Styles:**
```typescript
<div
  className="w-screen overflow-hidden"
  style={{
    height: 'calc(var(--vh, 1vh) * 100)'
  }}
>
```

## Known Issues

1. **Repaint not triggering** - Even with double requestAnimationFrame and forced reflows, Safari doesn't always recalculate calc() expressions when CSS variables change

2. **Redirect timing** - Something about the login redirect flow prevents proper layout calculation

3. **Scroll-dependent fix** - Currently relies on user scrolling to trigger repaint, which is unacceptable UX

## What Works

- ✅ Initial page load (before any navigation)
- ✅ Device rotation
- ✅ After user scrolls
- ✅ Viewport height measurement (always correct)
- ✅ CSS variable updates (--vh updates correctly)

## What Doesn't Work

- ❌ After login redirect (white space persists)
- ❌ Automatic repaint when --vh changes
- ❌ Layout recalculation without user interaction

## Potential Next Steps

### Option 1: Force Layout with Dimension Change
Instead of just reading offsetHeight, actually change a dimension:
```typescript
document.body.style.height = '99.99%';
void document.body.offsetHeight;
document.body.style.height = '';
```

### Option 2: Use ResizeObserver on Root
Watch for when the root element size changes:
```typescript
const observer = new ResizeObserver(() => {
  // Force repaint when size changes detected
});
observer.observe(document.documentElement);
```

### Option 3: React State-Driven Height
Instead of CSS variables, use React state to trigger re-renders:
```typescript
const [vh, setVh] = useState(window.innerHeight * 0.01);
// Update vh in state → Forces React re-render → New styles applied
```

### Option 4: Transform Instead of Height
Use transform instead of height (bypasses layout):
```typescript
transform: `scaleY(${actualHeight / 100})`
```

### Option 5: Fixed Positioning
Use position: fixed which forces new stacking context:
```typescript
position: fixed;
top: 0;
left: 0;
right: 0;
bottom: 0;
```

### Option 6: Intersection Observer Hack
Force layout by observing intersection:
```typescript
const observer = new IntersectionObserver(() => {});
observer.observe(rootElement);
// Change intersection → triggers layout
```

## Files Modified

- `src/components/ViewportHeightManager.tsx` - Dynamic viewport manager
- `src/components/Providers.tsx` - Added ViewportHeightManager
- `src/app/globals.css` - Added --vh variable, body/html styles, .h-screen-safe utility
- `src/app/page.tsx` - Changed to calc(var(--vh) * 100)
- `src/app/repos/page.tsx` - Changed to calc(var(--vh) * 100)
- `src/app/[owner]/page.tsx` - Changed to calc(var(--vh) * 100)
- `src/app/[owner]/[repo]/page.tsx` - Changed to calc(var(--vh) * 100)
- `src/app/activity/page.tsx` - Changed to calc(var(--vh) * 100)
- `src/app/repos/[username]/page.tsx` - Changed to calc(var(--vh) * 100)

## Commit History

1. `3e02f86` - Initial viewport height fix with CSS variables
2. `6ffb196` - Prevent white space on initial load
3. `d4369af` - Remove safe-area-inset-bottom (WRONG - reverted)
4. `d9220c4` - Revert safe area removal
5. `111530c` - Use visualViewport.height for safe areas
6. `18f7dab` - Extend timing to 1500ms, add pageshow
7. `0f8a77f` - Aggressive repaint with double rAF

## Key Learnings

1. **CSS variable changes don't always trigger layout recalculation** in Safari mobile
2. **Scroll events trigger natural browser repaint** which recalculates everything
3. **visualViewport.height** is the correct metric (excludes safe areas)
4. **Force reflow** (reading offsetHeight) is not enough to recalculate calc() expressions
5. **Safe area insets** are necessary and correct - don't remove them
6. **h-screen (100vh)** includes safe areas on iOS, need dynamic calculation

## References

- [Visual Viewport API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API)
- [CSS env() - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- [Understanding 100vh on iOS Safari](https://allthingssmitty.com/2020/05/11/css-fix-for-100vh-in-mobile-webkit/)

---

**Status:** ⚠️ UNRESOLVED - White space still appears after login redirects, only fixed by user scrolling
**Last Updated:** 2026-01-05
