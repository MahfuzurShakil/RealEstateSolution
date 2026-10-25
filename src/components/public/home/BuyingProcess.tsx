import { FileSearch, FileSignature, HandCoins, KeyRound, Landmark, MapPinned, type LucideIcon } from 'lucide-react';
import { Reveal } from './motion';

/*
 * How a flat, plot or share is actually bought from a developer in Bangladesh,
 * in the order it happens. The same words the sales team and the Admin booking
 * flow use: booking money confirms the booking, the sale agreement fixes the
 * price and payment terms, and the deed is registered once the price is paid.
 */
const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MapPinned,
    title: 'Site visit',
    body: 'Visit the project with our team. We can pick you up from the office or meet you on site.',
  },
  {
    icon: FileSearch,
    title: 'Check the papers',
    body: 'See the land deed, khatian, mutation, land tax receipt and the approved building plan.',
  },
  {
    icon: HandCoins,
    title: 'Pay booking money',
    body: 'Your flat, plot or share is held for you, and a money receipt is issued the same day.',
  },
  {
    icon: FileSignature,
    title: 'Sign the sale agreement',
    body: 'Final price, payment schedule and handover date are written down — full payment or instalments.',
  },
  {
    icon: KeyRound,
    title: 'Handover',
    body: 'Keys for a flat, possession for a plot, a share certificate for a land share.',
  },
  {
    icon: Landmark,
    title: 'Registration & mutation',
    body: 'The deed is registered in your name at the sub-registry office, then mutation (namjari).',
  },
];

export function BuyingProcess() {
  return (
    <div className="relative mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {STEPS.map(({ icon: Icon, title, body }, i) => (
        <Reveal key={title} delay={(i % 3) * 120}>
          <div className="group relative h-full rounded-2xl border border-site-line bg-white p-7 transition-all duration-500 hover:-translate-y-1 hover:border-transparent hover:shadow-xl">
            <span className="absolute top-6 right-7 text-5xl font-bold text-site-soft transition-colors group-hover:text-site-primary-soft">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="relative grid size-14 place-items-center rounded-xl bg-site-primary-soft text-site-primary transition-colors group-hover:bg-site-primary group-hover:text-white">
              <Icon className="size-7" strokeWidth={1.6} />
            </span>
            <h3 className="relative mt-6 text-xl font-semibold">{title}</h3>
            <p className="relative mt-2.5 leading-relaxed text-site-muted">{body}</p>
          </div>
        </Reveal>
      ))}
    </div>
  );
}
