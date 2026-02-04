# Test Telemetry Functionality - Implementation Documentation

**Status**: Removed from UI (2026-02-03)
**Reason**: Functionality removed per user request
**API Routes**: Preserved for potential future use

This document describes how the Test Telemetry functionality was integrated into the Web ADE UI before removal. The API routes remain intact and can be re-integrated following this documentation.

---

## Overview

The Test Telemetry functionality provided a complete interface for viewing test execution telemetry data, trace visualization, and code coverage metrics directly within the Web ADE. It included:

- Telemetry coverage panel showing test coverage metrics
- Trace viewer for visualizing test execution traces
- Integration with OpenTelemetry data
- File City visualization for spatial representation of coverage

---

## Layout Configuration

### Location
`src/components/LayoutConfigDropdown.tsx`

### Configuration Entry (Removed)
```typescript
{
  id: 'file-city',
  name: 'Test Telemetry',
  layout: {
    left: 'telemetry-coverage',  // Coverage metrics panel
    middle: 'trace-viewer',       // Trace visualization panel
    right: 'file-city',           // File City visualization
  },
  collapsed: {
    left: false,
    right: false,
  },
}
```

This layout provided a three-panel view:
- **Left**: Telemetry coverage panel showing test coverage metrics
- **Middle**: Trace viewer for visualizing test execution traces
- **Right**: File City visualization with coverage data

---

## Sidebar Icon

### Location
`src/components/LayoutSidebar.tsx`

### Icon Mapping (Removed)
```typescript
const layoutIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  // ...
  'file-city': LineChart,  // REMOVED
  // ...
};
```

The LineChart icon from lucide-react was used to represent the Test Telemetry layout in the sidebar.

---

## Panel Components

### Location
`src/components/EditorLayout.tsx`

### Dynamic Imports (Removed)

```typescript
// Dynamically import the TraceViewerPanel with SSR disabled
const TraceViewerPanelLoader = dynamic(
  () => import('@industry-theme/principal-view-panels').then((mod) => {
    // TraceViewerPanel extraction logic
  }),
  { ssr: false }
);

// Dynamically import the TelemetryCoveragePanel with SSR disabled
const TelemetryCoveragePanelLoader = dynamic(
  () => import('@industry-theme/repository-composition-panels').then((mod) => mod.TelemetryCoveragePanel),
  { ssr: false }
);
```

### Panel Definitions (Removed)

```typescript
{
  id: 'telemetry-coverage',
  label: 'Telemetry Coverage',
  icon: <Activity size={16} />,
  content: (
    <div className="h-full w-full overflow-hidden">
      <TelemetryCoveragePanelLoader context={context} actions={enhancedActions} events={events} />
    </div>
  ),
},
{
  id: 'trace-viewer',
  label: 'Trace Viewer',
  icon: <Activity size={16} />,
  content: (
    <div className="h-full w-full overflow-hidden">
      <TraceViewerPanelLoader context={context} actions={enhancedActions} events={events} />
    </div>
  ),
}
```

Both panels used the Activity icon from lucide-react.

---

## Panel Context Integration

### Location
`src/contexts/PanelContext.tsx`

**No specific state or event handlers** were found for telemetry functionality in PanelContext. The telemetry panels likely used generic panel slice data or external data sources.

---

## API Routes (Preserved)

### Test Telemetry Route
- **Path**: `/api/test-telemetry/route.ts`
- **Methods**: Likely GET/POST
- **Purpose**: Fetch and store test telemetry data
- **Note**: This route remains available for future use

### OTEL Test Setup
- **Path**: `src/__tests__/otel-setup.ts`
- **Purpose**: OpenTelemetry test instrumentation setup
- **Note**: Test infrastructure remains intact

---

## Data Sources

The Test Telemetry functionality integrated with:

1. **OpenTelemetry**: For collecting trace data from test execution
2. **Coverage Reports**: Likely from test runners like Jest, Vitest, or Playwright
3. **File City Visualization**: Enhanced with coverage data overlay

---

## Component Packages

The panels were imported from:

- `@industry-theme/principal-view-panels` - TraceViewerPanel
- `@industry-theme/repository-composition-panels` - TelemetryCoveragePanel

These packages contain the actual panel implementations and remain available in node_modules.

---

## Integration with Other Features

### File City Visualization

The File City panel in the right column could be enhanced with test coverage data, showing:
- Files with low/high test coverage
- Color coding based on coverage percentage
- Size scaling based on test execution frequency

### Repository Composition

The telemetry coverage panel integrated with repository composition data to show:
- Package-level test coverage
- Module-level coverage metrics
- Test execution patterns

---

## Re-enabling the Functionality

To re-enable Test Telemetry functionality:

1. **Restore Layout Configuration**
   - Add the layout config back to `LayoutConfigDropdown.tsx` (see configuration above)
   - Note: The id 'file-city' may conflict with the File City panel id - consider renaming to 'test-telemetry'

2. **Restore Sidebar Icon**
   - Add the icon mapping back to `LayoutSidebar.tsx`: `'file-city': LineChart` (or use new id)

3. **Restore Panel Components**
   - Add TraceViewerPanelLoader dynamic import in `EditorLayout.tsx`
   - Add TelemetryCoveragePanelLoader dynamic import in `EditorLayout.tsx`
   - Add panel definitions for 'telemetry-coverage' and 'trace-viewer'

4. **Verify API Routes**
   - Check `/api/test-telemetry/route.ts` is functional
   - Verify OpenTelemetry instrumentation is configured

5. **Panel Component Verification**
   - Ensure `@industry-theme/principal-view-panels` package includes TraceViewerPanel
   - Ensure `@industry-theme/repository-composition-panels` package includes TelemetryCoveragePanel
   - Verify panels can receive context, actions, and events props

6. **Test Integration**
   - Verify telemetry coverage data loads correctly
   - Test trace viewer visualization
   - Verify File City integration with coverage data
   - Test layout switching to Test Telemetry view

---

## Notes

- The layout id 'file-city' is potentially confusing as it's also the name of a panel
- Consider renaming to 'test-telemetry' or 'telemetry-view' when re-enabling
- No specific state management was found in PanelContext, suggesting panels may fetch data directly
- The Activity icon was used for both telemetry panels
- OpenTelemetry test setup remains in place for test execution
- API routes for telemetry data remain preserved and functional
