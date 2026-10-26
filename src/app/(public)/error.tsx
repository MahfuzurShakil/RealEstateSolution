'use client';

import { RotateCcw } from 'lucide-react';
import { en } from '@/components/public/i18n/en';
import { Button } from '@/components/public/ui/Button';
import { Container } from '@/components/public/ui/SectionHeader';

const t = en.error;

/** Error boundary for public pages: the header and footer (with phone and WhatsApp) stay usable. */
export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container className="grid place-items-center py-24 text-center md:py-32">
      <h1 className="text-3xl font-semibold md:text-4xl">{t.title}</h1>
      <p className="mt-4 max-w-md text-lg text-site-muted">{t.body}</p>
      <Button className="mt-8" onClick={reset} icon={<RotateCcw className="size-4" />}>
        {t.retry}
      </Button>
    </Container>
  );
}
