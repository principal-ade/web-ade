/**
 * Type definitions for panel event payloads
 *
 * These types ensure type safety for custom events emitted between panels.
 */

import type { WorkflowTemplate, ExtendedCanvas, DiscoveredStoryboard } from '@principal-ai/principal-view-core';
import type { VersionSnapshot } from '@principal-ai/principal-view-core';

/**
 * Payload for the 'openWorkflowScenarios' event
 * Emitted by TraceListPanel when a workflow is clicked in the Schematics tab
 */
export interface OpenWorkflowScenariosPayload {
  action: 'openWorkflowScenarios';

  // Workflow data - MUST include full template with scenarios
  workflowId: string;
  workflowPath: string;
  workflowTemplate: WorkflowTemplate;  // REQUIRED - must have scenarios[]
  workflow?: unknown;  // Legacy metadata field (don't use)

  // Canvas data
  canvasId: string;
  canvasPath: string;
  canvasName: string;
  canvas?: ExtendedCanvas;

  // Storyboard data
  storyboardId?: string;
  storyboardName?: string;
  storyboard?: DiscoveredStoryboard;

  // Version data (for historical context)
  repositoryUrl?: string;
  commitSha?: string;
  versionSnapshot?: VersionSnapshot;
}
