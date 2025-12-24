'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  X,
  Sparkles,
  FolderOpen,
  Wrench,
  Atom,
  Cog,
  Cpu,
  Zap,
  Code,
  Layers,
  Box,
  BookOpen,
  Network,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { Collection } from '@principal-ai/alexandria-collections';

// Available icons for collections
export const iconOptions: Array<{ name: string; icon: LucideIcon }> = [
  { name: 'FolderOpen', icon: FolderOpen },
  { name: 'Sparkles', icon: Sparkles },
  { name: 'Wrench', icon: Wrench },
  { name: 'Atom', icon: Atom },
  { name: 'Cog', icon: Cog },
  { name: 'Cpu', icon: Cpu },
  { name: 'Zap', icon: Zap },
  { name: 'Code', icon: Code },
  { name: 'Layers', icon: Layers },
  { name: 'Box', icon: Box },
  { name: 'BookOpen', icon: BookOpen },
  { name: 'Network', icon: Network },
];

export const iconMap: Record<string, LucideIcon> = Object.fromEntries(
  iconOptions.map(({ name, icon }) => [name, icon])
);

interface CollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string, icon: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  initialData?: Collection;
  mode: 'create' | 'edit';
}

export function CollectionModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialData,
  mode,
}: CollectionModalProps) {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('FolderOpen');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.name);
        setDescription(initialData.description || '');
        setSelectedIcon(initialData.icon || 'FolderOpen');
      } else {
        setName('');
        setDescription('');
        setSelectedIcon('FolderOpen');
      }
      setError(null);
    }
  }, [isOpen, initialData]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave(name.trim(), description.trim(), selectedIcon);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save collection');
    } finally {
      setSaving(false);
    }
  }, [name, description, selectedIcon, onSave, onClose]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;

    if (!confirm('Are you sure you want to delete this collection?')) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete collection');
    } finally {
      setDeleting(false);
    }
  }, [onDelete, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background,
          borderRadius: '12px',
          border: `1px solid ${theme.colors.border}`,
          padding: '24px',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: `${theme.fontSizes[4]}px`,
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.text,
            }}
          >
            {mode === 'create' ? 'Create Collection' : 'Edit Collection'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: theme.colors.textSecondary,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: '12px',
              marginBottom: '16px',
              backgroundColor: `${theme.colors.error}20`,
              borderRadius: '8px',
              color: theme.colors.error,
              fontSize: `${theme.fontSizes[1]}px`,
            }}
          >
            {error}
          </div>
        )}

        {/* Name input */}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: `${theme.fontSizes[1]}px`,
              fontWeight: theme.fontWeights.medium,
              color: theme.colors.textSecondary,
            }}
          >
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Collection"
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: `1px solid ${theme.colors.border}`,
              backgroundColor: theme.colors.background,
              color: theme.colors.text,
              fontSize: `${theme.fontSizes[2]}px`,
              outline: 'none',
            }}
          />
        </div>

        {/* Description input */}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: `${theme.fontSizes[1]}px`,
              fontWeight: theme.fontWeights.medium,
              color: theme.colors.textSecondary,
            }}
          >
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A collection of repositories..."
            rows={3}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: `1px solid ${theme.colors.border}`,
              backgroundColor: theme.colors.background,
              color: theme.colors.text,
              fontSize: `${theme.fontSizes[2]}px`,
              outline: 'none',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Icon selector */}
        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: `${theme.fontSizes[1]}px`,
              fontWeight: theme.fontWeights.medium,
              color: theme.colors.textSecondary,
            }}
          >
            Icon
          </label>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            {iconOptions.map(({ name: iconName, icon: IconComponent }) => (
              <button
                key={iconName}
                onClick={() => setSelectedIcon(iconName)}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  border: `2px solid ${selectedIcon === iconName ? theme.colors.primary : theme.colors.border}`,
                  backgroundColor:
                    selectedIcon === iconName
                      ? `${theme.colors.primary}20`
                      : theme.colors.background,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color:
                    selectedIcon === iconName
                      ? theme.colors.primary
                      : theme.colors.textSecondary,
                  transition: 'all 0.15s ease',
                }}
              >
                <IconComponent size={20} />
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: mode === 'edit' && onDelete ? 'space-between' : 'flex-end',
          }}
        >
          {mode === 'edit' && onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                border: `1px solid ${theme.colors.error}`,
                backgroundColor: 'transparent',
                color: theme.colors.error,
                fontSize: `${theme.fontSizes[2]}px`,
                fontWeight: theme.fontWeights.medium,
                cursor: deleting || saving ? 'not-allowed' : 'pointer',
                opacity: deleting || saving ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Trash2 size={16} />
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onClose}
              disabled={saving || deleting}
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                border: `1px solid ${theme.colors.border}`,
                backgroundColor: 'transparent',
                color: theme.colors.text,
                fontSize: `${theme.fontSizes[2]}px`,
                fontWeight: theme.fontWeights.medium,
                cursor: saving || deleting ? 'not-allowed' : 'pointer',
                opacity: saving || deleting ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting || !name.trim()}
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: theme.colors.primary,
                color: '#fff',
                fontSize: `${theme.fontSizes[2]}px`,
                fontWeight: theme.fontWeights.semibold,
                cursor: saving || deleting || !name.trim() ? 'not-allowed' : 'pointer',
                opacity: saving || deleting || !name.trim() ? 0.5 : 1,
              }}
            >
              {saving ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
