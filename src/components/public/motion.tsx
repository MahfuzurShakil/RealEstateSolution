'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/** True once the element has scrolled into view (and stays true). */
export function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  return [ref, seen];
}

/**
 * Fades a block up as it enters the screen. `motion-reduce` keeps it still for
 * people who have asked their system for less movement.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-[opacity,translate] duration-500 ease-site-out motion-reduce:transition-none',
        seen ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Counts from 0 to `value` once, when it comes into view. */
export function CountUp({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!seen) return;
    // less movement asked for: the first frame lands on the final number
    const span = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = span === 0 ? 1 : Math.min(1, (now - start) / span);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [seen, value, duration]);

  // screen readers get the final number straight away, never a value mid-count
  return (
    <>
      <span ref={ref} aria-hidden className="tabular">
        {shown.toLocaleString('en-IN')}
      </span>
      <span className="sr-only">{value.toLocaleString('en-IN')}</span>
    </>
  );
}
