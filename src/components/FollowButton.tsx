'use client';

import { useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { UserPlus, UserMinus } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';

export interface FollowButtonProps {
  /** Type of entity to follow */
  type: 'user' | 'repo';
  /** Whether currently following this entity */
  isFollowing: boolean;
  /** Handler to toggle follow state */
  onToggle: () => Promise<void>;
  /** Whether the button is disabled (e.g., at max follows) */
  disabled?: boolean;
  /** Optional size variant */
  size?: 'sm' | 'md';
  /** Whether to show icon only */
  iconOnly?: boolean;
}

/**
 * Follow/Unfollow button component
 *
 * @example
 * ```tsx
 * function UserCard({ login }: { login: string }) {
 *   const { isFollowingUser, followUser, unfollowUser, canFollowMoreUsers } = useFollows();
 *   const isFollowing = isFollowingUser(login);
 *
 *   return (
 *     <FollowButton
 *       type="user"
 *       isFollowing={isFollowing}
 *       onToggle={async () => {
 *         isFollowing ? await unfollowUser(login) : await followUser(login);
 *       }}
 *       disabled={!isFollowing && !canFollowMoreUsers}
 *     />
 *   );
 * }
 * ```
 */
export function FollowButton({
  type,
  isFollowing,
  onToggle,
  disabled = false,
  size = 'md',
  iconOnly = false,
}: FollowButtonProps) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (loading || disabled) return;

    setLoading(true);
    try {
      await onToggle();
    } catch (error) {
      console.error('[FollowButton] Toggle failed:', error);
    } finally {
      setLoading(false);
    }
  }

  const Icon = isFollowing ? UserMinus : UserPlus;
  const label = isFollowing ? 'Unfollow' : 'Follow';

  const sizeStyles = size === 'sm'
    ? { padding: '4px 8px', fontSize: `${theme.fontSizes[0]}px` }
    : { padding: '6px 12px', fontSize: `${theme.fontSizes[1]}px` };

  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      title={disabled && !isFollowing ? `Max ${type === 'user' ? 'users' : 'repos'} followed` : label}
      className="flex items-center gap-1.5 rounded transition-all"
      style={{
        ...sizeStyles,
        fontFamily: theme.fonts.body,
        fontWeight: theme.fontWeights.medium,
        background: isFollowing ? 'transparent' : theme.colors.primary,
        border: `1px solid ${isFollowing ? theme.colors.border : theme.colors.primary}`,
        color: isFollowing ? theme.colors.text : '#fff',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
      }}
    >
      {loading ? (
        <LoadingSpinner size={iconSize} />
      ) : (
        <Icon style={{ width: iconSize, height: iconSize }} />
      )}
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
