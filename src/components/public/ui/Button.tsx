import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The website's one button style (master plan §5.4). Pills everywhere; press
 * scales to .98. Use `ButtonLink` for navigation, `Button` for actions.
 */
export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'onDark' | 'light' | 'whatsapp';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-site-primary text-white shadow-site-2 hover:bg-site-primary-dark',
  outline: 'border border-site-line bg-white text-site-ink hover:border-site-primary hover:text-site-primary',
  ghost: 'text-site-ink hover:bg-site-soft',
  onDark: 'border border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20',
  light: 'bg-white text-site-ink hover:bg-site-soft',
  whatsapp: 'bg-site-whatsapp text-white hover:brightness-110',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm gap-1.5',
  md: 'h-11 px-6 text-[15px] gap-2',
  lg: 'h-13 px-7 text-base gap-2',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap',
    'transition-[background-color,color,border-color,transform,filter] duration-200 ease-site-out active:scale-[0.98]',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; iconRight?: ReactNode };

export function Button({ variant, size, icon, iconRight, className, children, ...rest }: Common & ComponentProps<'button'>) {
  return (
    <button type="button" className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </button>
  );
}

/** Internal routes go through `next/link`; `tel:`, `mailto:` and http links render a plain anchor. */
export function ButtonLink({
  href,
  variant,
  size,
  icon,
  iconRight,
  className,
  children,
  external,
  ...rest
}: Common & { href: string; external?: boolean } & Omit<ComponentProps<'a'>, 'href'>) {
  const cls = buttonClass(variant, size, className);
  const plain = external || /^(tel:|mailto:|https?:)/.test(href);
  if (plain) {
    const newTab = /^https?:/.test(href);
    return (
      <a href={href} className={cls} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...rest}>
        {icon}
        {children}
        {iconRight}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}
