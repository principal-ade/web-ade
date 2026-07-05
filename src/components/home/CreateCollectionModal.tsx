'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@principal-ade/industry-theme';
import { X, Globe, Lock } from 'lucide-react';

type Visibility = 'public' | 'private';

interface CreateCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string, visibility: Visibility) => Promise<void>;
}

/**
 * CreateCollectionModal — modal for creating a new collection.
 * Simple form with name (required) and description (optional).
 */
export function CreateCollectionModal({
  isOpen,
  onClose,
  onSave,
}: CreateCollectionModalProps) {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setVisibility('private');
      setError(null);
      setSaving(false);
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, saving]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave(name.trim(), description.trim(), visibility);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create collection');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create Collection"
      onClick={() => {
        if (!saving) onClose();
      }}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        background: 'rgba(0,0,0,0.55)',
        zIndex: 2147483000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          color: theme.colors.text,
          fontFamily: theme.fonts.body,
        }}
      >
        {/* Header */}
        <div
          className="px-5 pt-5 pb-3 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${theme.colors.border}` }}
        >
          <h2
            className="text-lg font-semibold"
            style={{ color: theme.colors.text }}
          >
            Create Collection
          </h2>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex items-center justify-center w-8 h-8 rounded transition-opacity hover:opacity-70 disabled:opacity-50"
            style={{
              color: theme.colors.textSecondary,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {/* Error message */}
          {error && (
            <div
              className="mb-4 p-3 rounded-lg text-sm"
              style={{
                backgroundColor: `${theme.colors.error}20`,
                color: theme.colors.error,
              }}
            >
              {error}
            </div>
          )}

          {/* Name input */}
          <div className="mb-4">
            <label
              className="block mb-2 text-sm font-medium"
              style={{ color: theme.colors.textSecondary }}
            >
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Collection"
              autoFocus
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                border: `1px solid ${theme.colors.border}`,
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim() && !saving) {
                  handleSave();
                }
              }}
            />
          </div>

          {/* Description input */}
          <div className="mb-4">
            <label
              className="block mb-2 text-sm font-medium"
              style={{ color: theme.colors.textSecondary }}
            >
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A collection of repositories..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-vertical"
              style={{
                border: `1px solid ${theme.colors.border}`,
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
              }}
            />
          </div>

          {/* Visibility toggle */}
          <div>
            <label
              className="block mb-2 text-sm font-medium"
              style={{ color: theme.colors.textSecondary }}
            >
              Visibility
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm flex-1 transition-all"
                style={{
                  border: `1px solid ${visibility === 'public' ? theme.colors.primary : theme.colors.border}`,
                  backgroundColor: visibility === 'public'
                    ? `color-mix(in srgb, ${theme.colors.primary} 10%, transparent)`
                    : theme.colors.background,
                  color: visibility === 'public' ? theme.colors.primary : theme.colors.text,
                  cursor: 'pointer',
                }}
              >
                <Globe size={16} />
                <span className="font-medium">Public</span>
              </button>
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm flex-1 transition-all"
                style={{
                  border: `1px solid ${visibility === 'private' ? theme.colors.primary : theme.colors.border}`,
                  backgroundColor: visibility === 'private'
                    ? `color-mix(in srgb, ${theme.colors.primary} 10%, transparent)`
                    : theme.colors.background,
                  color: visibility === 'private' ? theme.colors.primary : theme.colors.text,
                  cursor: 'pointer',
                }}
              >
                <Lock size={16} />
                <span className="font-medium">Private</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex items-center justify-end gap-2"
          style={{ borderTop: `1px solid ${theme.colors.border}` }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 h-9 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{
              background: 'transparent',
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 h-9 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{
              background: theme.colors.primary,
              color: theme.colors.textOnPrimary,
              border: 'none',
              cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
