'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { UTM_KEYS, type Utm } from '@/lib/domain/public-enquiry';
import { whatsappLink } from '@/lib/domain/public-portal';
import { en } from '../i18n/en';
import { useCompanyInfo } from '../useCompanyInfo';
import { EnquiryModal } from './EnquiryModal';

/*
 * One enquiry modal for the whole public site (master plan §8). Any button
 * opens it with `useEnquiry().open(kind, subject)`; the project page tells it
 * what is on screen with `setPage`, so the floating WhatsApp button and the
 * header can prefill the project and unit too.
 */

export type EnquiryKind = 'enquiry' | 'visit' | 'callback';

/** What an enquiry is about, by public codes only. */
export interface EnquirySubject {
  project?: { name: string; code: string };
  /** `item` is the singular word the project uses: Flat, Plot, Share… */
  unit?: { code: string; item: string };
}

interface EnquiryContextValue {
  open: (kind: EnquiryKind, subject?: EnquirySubject) => void;
  /** what the current page is showing; cleared when the page unmounts */
  setPage: (subject: EnquirySubject | null) => void;
  page: EnquirySubject | null;
  /**
   * A `wa.me` link prefilled for the subject (or the page), or with `text`
   * as given; null without a company WhatsApp.
   */
  whatsapp: (subject?: EnquirySubject | null, text?: string) => string | null;
}

const EnquiryContext = createContext<EnquiryContextValue | null>(null);

export function whatsappText(subject?: EnquirySubject | null): string {
  const t = en.whatsappText;
  const p = subject?.project;
  if (!p) return t.general;
  return subject?.unit ? t.unit(p.name, subject.unit.item, subject.unit.code, p.code) : t.project(p.name, p.code);
}

const UTM_STORE = 'site-utm';

/** The campaign tags this tab landed with, read when a form is sent. */
export function landingUtm(): Utm {
  try {
    return JSON.parse(sessionStorage.getItem(UTM_STORE) ?? '{}') as Utm;
  } catch {
    return {};
  }
}

export function EnquiryProvider({ children }: { children: React.ReactNode }) {
  const company = useCompanyInfo();
  const [state, setState] = useState<{ kind: EnquiryKind; subject: EnquirySubject } | null>(null);
  const [page, setPage] = useState<EnquirySubject | null>(null);

  // the tags are on the landing URL only, so keep them for the rest of the visit
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fresh: Utm = {};
      for (const k of UTM_KEYS) {
        const v = params.get(k);
        if (v) fresh[k] = v.slice(0, 100);
      }
      if (Object.keys(fresh).length) sessionStorage.setItem(UTM_STORE, JSON.stringify(fresh));
    } catch {
      // storage blocked: attribution is a nice-to-have
    }
  }, []);

  const number = company?.whatsapp_number ?? null;
  const whatsapp = useCallback(
    (subject?: EnquirySubject | null, text?: string) =>
      number ? whatsappLink(number, text ?? whatsappText(subject ?? page)) : null,
    [number, page],
  );

  const close = useCallback(() => setState(null), []);
  const switchKind = useCallback((kind: EnquiryKind) => setState((s) => (s ? { ...s, kind } : s)), []);

  const value = useMemo<EnquiryContextValue>(
    () => ({
      open: (kind, subject = {}) => setState({ kind, subject }),
      setPage,
      page,
      whatsapp,
    }),
    [page, whatsapp],
  );

  return (
    <EnquiryContext.Provider value={value}>
      {children}
      {state && (
        <EnquiryModal
          key={`${state.kind}-${state.subject.project?.code ?? ''}-${state.subject.unit?.code ?? ''}`}
          kind={state.kind}
          subject={state.subject}
          onKind={switchKind}
          onClose={close}
          whatsapp={whatsapp}
          tel={company?.phone ?? null}
        />
      )}
    </EnquiryContext.Provider>
  );
}

export function useEnquiry(): EnquiryContextValue {
  const ctx = useContext(EnquiryContext);
  if (!ctx) throw new Error('useEnquiry must be used inside the public layout');
  return ctx;
}

/** Tells the modal and the WhatsApp buttons what this page is about, for as long as it is mounted. */
export function usePageSubject(subject: EnquirySubject | null) {
  const { setPage } = useEnquiry();
  const key = `${subject?.project?.code ?? ''}|${subject?.unit?.code ?? ''}`;
  useEffect(() => {
    setPage(subject);
    return () => setPage(null);
    // the key carries everything the subject says
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setPage]);
}
