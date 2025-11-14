# @principal-ade/alexandria-workspace-panel

Workspace management panel for organizing repositories into logical groups with integrated theming and panel framework support.

> **Status**: Planning phase. Implementation not yet started.

## Features

### 🚧 Planned Features

- ✨ Create, edit, and delete workspaces
- 📁 Add/remove repositories to/from workspaces
- 🎨 Color-coded workspaces for visual organization
- ⭐ Default workspace designation
- 🔍 Search and filter repositories when adding
- 📝 Inline editing of workspace names
- 🔄 Real-time synchronization across tabs
- 🎯 Selected workspace context for filtering
- 📊 Repository count and metadata display
- 🌈 Custom workspace colors and icons
- 💾 Suggested clone paths for repositories
- 🔔 Panel event system for inter-panel communication
- 📱 Responsive design with theme support
- ♿ Accessibility compliant

## What is a Workspace?

A **workspace** is a logical grouping of repositories/projects. Think of it as:
- A collection of related projects (e.g., "Frontend Projects", "Client Work", "Open Source")
- A way to organize and filter repositories in the editor
- A suggested location for cloning new repositories
- A context that other panels can use to filter their content

### Use Cases

- **Project Organization**: Group related repositories together
- **Context Switching**: Quickly switch between different work contexts
- **Team Collaboration**: Share workspace configurations with team members
- **Filtered Views**: Show only repositories relevant to current workspace

## Installation

```bash
npm install @principal-ade/alexandria-workspace-panel @a24z/industry-theme @principal-ade/panel-framework-core
```

or with bun:

```bash
bun add @principal-ade/alexandria-workspace-panel @a24z/industry-theme @principal-ade/panel-framework-core
```

## Quick Start

### 1. Set up Database

Create the necessary tables for workspaces:

```sql
-- Workspaces table
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(7),
  icon VARCHAR(50),
  suggested_clone_path TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Workspace memberships
CREATE TABLE workspace_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  repository_id VARCHAR(255) NOT NULL,
  added_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE(workspace_id, repository_id)
);
```

### 2. Create API Routes

```typescript
// app/api/workspaces/route.ts
export async function GET() {
  const session = await getSession();
  const workspaces = await db.workspace.findMany({
    where: { userId: session.user.id },
  });
  return NextResponse.json(workspaces);
}

export async function POST(request: Request) {
  const session = await getSession();
  const data = await request.json();
  const workspace = await db.workspace.create({
    data: { ...data, userId: session.user.id },
  });
  return NextResponse.json(workspace, { status: 201 });
}
```

### 3. Use the Panel Components

```tsx
import { WorkspacePanel, WorkspaceEntriesPanel } from '@principal-ade/alexandria-workspace-panel';
import { PanelProvider } from '@/contexts/PanelContext';

function App() {
  return (
    <PanelProvider>
      <div className="flex">
        <aside className="w-80">
          <WorkspacePanel />
        </aside>
        <main className="flex-1">
          <WorkspaceEntriesPanel />
        </main>
      </div>
    </PanelProvider>
  );
}
```

## Available Components

### `<WorkspacePanel />`
Main workspace list panel with create, edit, delete operations.

**Features:**
- List all workspaces
- Create new workspace
- Inline edit workspace name
- Set default workspace
- Delete workspace
- Select active workspace
- Color indicators

**Example:**
```tsx
<WorkspacePanel
  onWorkspaceSelect={(workspace) => {
    console.log('Selected:', workspace.name);
  }}
  selectedWorkspaceId={selectedId}
/>
```

### `<WorkspaceEntriesPanel />`
Display and manage repositories within selected workspace.

**Features:**
- List repositories in workspace
- Add repositories
- Remove repositories
- Empty states
- Search repositories

**Example:**
```tsx
<WorkspaceEntriesPanel
  selectedWorkspace={currentWorkspace}
  onRepositoryClick={(repo) => {
    console.log('Opening:', repo.name);
  }}
/>
```

### Additional Components

- `<WorkspaceCard />` - Individual workspace display
- `<CreateWorkspaceModal />` - Modal for creating workspaces
- `<EditWorkspaceModal />` - Modal for editing workspace details
- `<AddRepositoryModal />` - Modal for adding repositories to workspace
- `<WorkspaceColorPicker />` - Color selection component
- `<EmptyWorkspaceState />` - Empty state when no workspaces

## Hooks

### `useWorkspaces`

Main hook for workspace management.

```typescript
const {
  workspaces,
  loading,
  error,
  defaultWorkspace,
  refresh,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  setDefaultWorkspace,
} = useWorkspaces();

// Create a workspace
const newWorkspace = await createWorkspace({
  name: 'My Project',
  description: 'Frontend projects',
  color: '#3b82f6',
});

// Update a workspace
await updateWorkspace(workspace.id, {
  name: 'Updated Name',
});

// Set as default
await setDefaultWorkspace(workspace.id);

// Delete
await deleteWorkspace(workspace.id);
```

### `useWorkspaceMembers`

Manage repositories within a workspace.

```typescript
const {
  repositories,
  loading,
  addRepository,
  removeRepository,
  refresh,
} = useWorkspaceMembers(workspaceId);

// Add repository
await addRepository('repo-123');

// Remove repository
await removeRepository('repo-123');
```

### `useWorkspaceSelection`

Track selected workspace across the application.

```typescript
const {
  selectedWorkspace,
  setSelectedWorkspace,
} = useWorkspaceSelection();

// Select a workspace
setSelectedWorkspace(workspace);

// Clear selection
setSelectedWorkspace(null);
```

## Panel Framework Integration

### Event System

The panel emits events that other panels can subscribe to:

```typescript
import { usePanelProvider } from '@/contexts/PanelContext';

function MyPanel() {
  const { events } = usePanelProvider();

  useEffect(() => {
    // Listen for workspace selection
    const unsubscribe = events.on('workspace:selected', (event) => {
      const { workspace } = event.payload;
      console.log('Workspace changed:', workspace?.name);
      // Filter your panel content by workspace
    });

    return unsubscribe;
  }, [events]);
}
```

### Available Events

- `workspace:created` - New workspace created
- `workspace:updated` - Workspace details updated
- `workspace:deleted` - Workspace deleted
- `workspace:selected` - Active workspace changed
- `workspace:default-changed` - Default workspace changed
- `workspace:membership-changed` - Repository added/removed

### Data Slices

Integrate with panel framework data slices:

```typescript
const { context } = usePanelProvider();

// Access workspaces slice
const workspacesSlice = context.getWorkspaceSlice<Workspace[]>('workspaces');

if (workspacesSlice && !workspacesSlice.loading) {
  console.log('Workspaces:', workspacesSlice.data);
}

// Access selected workspace slice
const selectedSlice = context.getWorkspaceSlice<Workspace | null>('selected-workspace');
```

## TypeScript Types

```typescript
interface Workspace {
  id: string;
  userId: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  suggestedClonePath?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkspaceMembership {
  id: string;
  workspaceId: string;
  repositoryId: string;
  addedAt: Date;
  metadata?: Record<string, unknown>;
}

interface CreateWorkspaceInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  suggestedClonePath?: string;
  isDefault?: boolean;
}

interface UpdateWorkspaceInput {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  suggestedClonePath?: string;
  isDefault?: boolean;
}
```

## Styling

The panel uses `@a24z/industry-theme` for consistent styling:

```tsx
import { useTheme } from '@a24z/industry-theme';

function CustomWorkspaceComponent() {
  const { theme } = useTheme();

  return (
    <div style={{
      backgroundColor: theme.colors.background,
      color: theme.colors.text,
      padding: theme.space[4],
      borderRadius: theme.radii.md,
    }}>
      Custom workspace component
    </div>
  );
}
```

## Advanced Usage

### Custom Workspace Filtering

```tsx
import { useWorkspaces } from '@principal-ade/alexandria-workspace-panel';

function FilteredWorkspaceList() {
  const { workspaces } = useWorkspaces();
  const [filter, setFilter] = useState('');

  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter(w =>
      w.name.toLowerCase().includes(filter.toLowerCase()) ||
      w.description?.toLowerCase().includes(filter.toLowerCase())
    );
  }, [workspaces, filter]);

  return (
    <div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search workspaces..."
      />
      {filteredWorkspaces.map(workspace => (
        <div key={workspace.id}>{workspace.name}</div>
      ))}
    </div>
  );
}
```

### Workspace Templates

```tsx
const WORKSPACE_TEMPLATES = [
  {
    name: 'Frontend Projects',
    description: 'Web development projects',
    color: '#3b82f6',
    icon: '🎨',
  },
  {
    name: 'Backend Services',
    description: 'API and server projects',
    color: '#10b981',
    icon: '⚙️',
  },
  {
    name: 'Open Source',
    description: 'Community contributions',
    color: '#f59e0b',
    icon: '🌟',
  },
];

function WorkspaceTemplates() {
  const { createWorkspace } = useWorkspaces();

  const createFromTemplate = async (template: typeof WORKSPACE_TEMPLATES[0]) => {
    await createWorkspace(template);
  };

  return (
    <div>
      <h3>Quick Start Templates</h3>
      {WORKSPACE_TEMPLATES.map((template, i) => (
        <button key={i} onClick={() => createFromTemplate(template)}>
          {template.icon} {template.name}
        </button>
      ))}
    </div>
  );
}
```

### Bulk Repository Operations

```tsx
function BulkAddRepositories({ workspaceId }: { workspaceId: string }) {
  const { addRepository } = useWorkspaceMembers(workspaceId);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);

  const addMultiple = async () => {
    await Promise.all(
      selectedRepos.map(repoId => addRepository(repoId))
    );
    setSelectedRepos([]);
  };

  return (
    <div>
      {/* Repository selection UI */}
      <button onClick={addMultiple} disabled={selectedRepos.length === 0}>
        Add {selectedRepos.length} repositories
      </button>
    </div>
  );
}
```

## Panel Layout Integration

```tsx
import { EditableConfigurablePanelLayout } from '@principal-ade/panel-layouts';
import { WorkspacePanel, WorkspaceEntriesPanel } from '@principal-ade/alexandria-workspace-panel';

const panelDefinitions = [
  {
    id: 'workspaces',
    label: 'Workspaces',
    icon: <Layers size={16} />,
    component: WorkspacePanel,
  },
  {
    id: 'workspace-entries',
    label: 'Workspace Repositories',
    icon: <FolderGit2 size={16} />,
    component: WorkspaceEntriesPanel,
  },
];

const layout = {
  left: {
    type: 'tabs',
    panels: ['workspaces'],
  },
  middle: {
    type: 'tabs',
    panels: ['workspace-entries', 'file-tree'],
  },
};

function Workspace() {
  return (
    <EditableConfigurablePanelLayout
      panels={panelDefinitions}
      layout={layout}
    />
  );
}
```

## Documentation

- [DESIGN.md](./DESIGN.md) - Complete architecture and design decisions
- [API.md](./API.md) - API reference documentation
- [EXAMPLES.md](./EXAMPLES.md) - Usage examples and recipes

## Development

```bash
# Install dependencies
bun install

# Start Storybook
bun run storybook

# Build
bun run build

# Type checking
bun run typecheck

# Linting
bun run lint

# Testing
bun run test
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

## License

MIT © Principal ADE Team

## Support

- GitHub Issues: [principal-ade/alexandria-workspace-panel](https://github.com/principal-ade/alexandria-workspace-panel/issues)
- Documentation: [https://principal-ade.com/docs/panels/alexandria-workspace](https://principal-ade.com/docs/panels/alexandria-workspace)
- Discord: [Principal ADE Community](https://discord.gg/principal-ade)

## Related Packages

- [`@principal-ade/panel-framework-core`](https://npmjs.com/package/@principal-ade/panel-framework-core) - Core panel framework
- [`@principal-ade/git-repos-panel`](https://npmjs.com/package/@principal-ade/git-repos-panel) - GitHub repository browser
- [`@a24z/industry-theme`](https://npmjs.com/package/@a24z/industry-theme) - Theming system
- [`@a24z/panels`](https://npmjs.com/package/@a24z/panels) - Panel layout components
