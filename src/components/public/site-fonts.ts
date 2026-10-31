import { Hind_Siliguri, Instrument_Serif, League_Spartan, Plus_Jakarta_Sans } from 'next/font/google';

// The brand's type (master plan §5.2) is declared here once, so a rebrand changes one file.
// Both the public website and the Customer Portal put these variables on their shell.
const spartan = League_Spartan({ variable: '--font-spartan', subsets: ['latin'] });
const jakarta = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'] });
const instrument = Instrument_Serif({ variable: '--font-instrument', subsets: ['latin'], weight: ['400'], style: ['italic'] });
// only for the ৳ sign, which the Latin faces do not draw
const hind = Hind_Siliguri({ variable: '--font-hind', subsets: ['bengali'], weight: ['600'] });

export const SITE_FONT_VARS = `${spartan.variable} ${jakarta.variable} ${instrument.variable} ${hind.variable}`;
