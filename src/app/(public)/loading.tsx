import { Container } from '@/components/public/ui/SectionHeader';

/** Route-change placeholder: a quiet skeleton in the page's own shape, never a spinner. */
export default function PublicLoading() {
  return (
    <Container className="py-10" >
      <div className="h-[420px] animate-pulse rounded-[28px] bg-site-soft" />
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-80 animate-pulse rounded-[20px] bg-site-soft" />
        ))}
      </div>
    </Container>
  );
}
