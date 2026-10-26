'use client';

import { usePathname } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useCompanyInfo } from './useCompanyInfo';

/**
 * Floating click-to-chat (Public Portal v2.0 §5.4). Opens the company's own
 * WhatsApp; nothing is written to `leads` — that needs the Business API.
 * Hidden when no WhatsApp number is set in Company Settings.
 */
export function WhatsAppButton() {
  const company = useCompanyInfo();
  const pathname = usePathname();
  if (!company?.whatsapp_url) return null;
  // a project page on a phone has its own call / WhatsApp bar along the bottom
  const onDetail = /^\/projects\/[^/]+/.test(pathname ?? '');

  return (
    <a
      href={company.whatsapp_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className={cn(
        'fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-site-whatsapp px-4 py-3 text-sm font-medium text-white shadow-lg shadow-black/15 transition-transform hover:scale-105 sm:right-6 sm:bottom-6',
        onDetail && 'max-lg:hidden',
      )}
    >
      <MessageCircle className="size-5" />
      <span className="hidden sm:inline">WhatsApp</span>
    </a>
  );
}
