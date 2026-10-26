import { ArrowRight, Building2 } from 'lucide-react';
import { en } from '@/components/public/i18n/en';
import { ButtonLink } from '@/components/public/ui/Button';
import { Container } from '@/components/public/ui/SectionHeader';

const t = en.notFound;

/** 404 inside the public shell: say what happened, offer the two useful next steps. */
export default function PublicNotFound() {
  return (
    <Container className="grid place-items-center py-24 text-center md:py-32">
      <span className="grid size-16 place-items-center rounded-2xl bg-site-primary-soft text-site-primary">
        <Building2 className="size-8" aria-hidden />
      </span>
      <p className="mt-6 text-xs font-semibold tracking-[0.18em] text-site-brass-dark uppercase">{t.eyebrow}</p>
      <h1 className="mt-3 text-4xl font-semibold md:text-5xl">{t.title}</h1>
      <p className="mt-4 max-w-md text-lg text-site-muted">{t.body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/projects" iconRight={<ArrowRight className="size-4" />}>
          {t.browse}
        </ButtonLink>
        <ButtonLink href="/" variant="outline">
          {t.home}
        </ButtonLink>
      </div>
    </Container>
  );
}
