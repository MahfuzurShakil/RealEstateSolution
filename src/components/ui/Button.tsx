import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { useReadOnly } from './ViewOnly';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'dangerGhost';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-admin-500 text-white hover:bg-admin-600',
  outline: 'border border-hairline bg-white text-ink hover:bg-admin-50 hover:text-admin-700',
  ghost: 'text-ink-muted hover:bg-admin-50 hover:text-admin-700',
  danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
  /*
   * Destructive, but not competing with the primary action beside it. Detail
   * headers used `danger` for Delete next to an outlined Edit, which gave the
   * irreversible action the louder treatment of the two. This is quiet until
   * the pointer is on it, and the confirm dialog is still the real gate.
   */
  dangerGhost: 'text-ink-muted hover:bg-red-50 hover:text-red-600',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  // default to "button": these often sit inside a form (modals, toolbars) and
  // must not submit it unless the caller asks for type="submit"
  type = 'button',
  className,
  children,
  viewSafe = false,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  /** stays enabled in a view-only area: it only looks (view, download, close) */
  viewSafe?: boolean;
}) {
  const readOnly = useReadOnly();
  return (
    <button
      type={type}
      disabled={disabled || (readOnly && !viewSafe)}
      title={readOnly && !viewSafe ? 'View only for your role' : props.title}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
