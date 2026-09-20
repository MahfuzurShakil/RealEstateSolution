/**
 * Batch L3 demo data — due-diligence findings (BRD section 9).
 *
 * Keyed on the land's `name` and the checklist item's `code`. Anything not
 * listed here stays `pending`, which is the honest state for a land whose
 * lawyer has not finished — and it is what gives gate G2 something to block on.
 *
 * The three lands covered are deliberately at three different stages: one
 * fully settled with a waiver, one fully settled without, and one mid-search
 * with a failed mandatory item. A demo where everything passes proves nothing
 * about a gate.
 */

export interface DemoDdFinding {
  land: string;
  code: string;
  status:
    | 'in_progress'
    | 'submitted'
    | 'passed'
    | 'conditionally_approved'
    | 'failed'
    | 'waived'
    | 'not_applicable';
  finding?: string;
  waiver_reason?: string;
}

/** The seeded checklist's mandatory items (DD_CHECKLIST_SEED). */
const MANDATORY_CODES = [
  'ownership_proof',
  'heir_consent',
  'deed_chain',
  'khatian_verified',
  'mutation_done',
  'encumbrance_search',
  'mortgage_clear',
  'litigation_clear',
  'land_tax_paid',
  'acquisition_check',
  'boundary_survey',
  'possession_clear',
  'land_use_clearance',
];

export const DEMO_DD_FINDINGS: DemoDdFinding[] = [
  /* Bashundhara — JV signed, so every mandatory item is settled. One waiver,
     because a real acquisition almost always carries one. */
  {
    land: 'Bashundhara Block K corner plot',
    code: 'ownership_proof',
    status: 'passed',
    finding: 'Sole owner on RS and BS khatian. NID verified against the deed.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'heir_consent',
    status: 'not_applicable',
    finding: 'Purchased by the current owner in 1998 — not inherited.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'poa_validity',
    status: 'passed',
    finding: 'POA-2026-014 registered at Gulshan sub-registry, unrevoked.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'deed_chain',
    status: 'passed',
    finding: 'Chain traced to 1987. Four transfers, all registered.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'khatian_verified',
    status: 'passed',
    finding: 'RS and BS agree on the dag and the area.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'mutation_done',
    status: 'passed',
    finding: 'Mutation 2019, DCR attached.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'encumbrance_search',
    status: 'passed',
    finding: 'Search certificate 2001–2026 clear.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'mortgage_clear',
    status: 'passed',
    finding: 'No charge ever registered.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'litigation_clear',
    status: 'passed',
    finding: 'Civil and land survey tribunal searches clear.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'land_tax_paid',
    status: 'passed',
    finding: 'Dakhila current to 1432 Bangla.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'holding_tax_paid',
    status: 'waived',
    finding: 'City corporation shows BDT 41,500 outstanding for 2024–25.',
    waiver_reason:
      'Seller liability under clause 7 of the JV agreement. BDT 200,000 withheld from the signing money until the receipt is produced.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'acquisition_check',
    status: 'passed',
    finding: 'No L.A. case. Not khas.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'boundary_survey',
    status: 'passed',
    finding:
      'Amin survey matches the deed within 0.4 decimal. North wall rebuilt on the correct line.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'possession_clear',
    status: 'passed',
    finding: 'Tenant vacated March 2026, handover letter on file.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'access_right',
    status: 'passed',
    finding: 'Two recorded road frontages.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'land_use_clearance',
    status: 'passed',
    finding: 'RAJUK DAP — residential, up to 9 floors at this FAR.',
  },
  {
    land: 'Bashundhara Block K corner plot',
    code: 'authority_noc',
    status: 'not_applicable',
    finding: 'Outside the civil aviation height zone; no water body on the dag.',
  },

  /* Uttara — acquired, all mandatory settled, no waiver needed. */
  {
    land: 'Uttara Sector 13 residential plot',
    code: 'ownership_proof',
    status: 'passed',
    finding: 'Sole owner, allotment from RAJUK in 2006.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    code: 'heir_consent',
    status: 'not_applicable',
    finding: 'Allotted, not inherited.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    code: 'deed_chain',
    status: 'passed',
    finding: 'RAJUK allotment then registered deed 2011. Two links, both clean.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    code: 'khatian_verified',
    status: 'passed',
    finding: 'BS khatian matches the allotment letter.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    code: 'mutation_done',
    status: 'passed',
    finding: 'Mutation 2012, DCR attached.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    code: 'encumbrance_search',
    status: 'passed',
    finding: 'Clear 2001–2026.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    code: 'mortgage_clear',
    status: 'passed',
    finding: 'No charge registered.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    code: 'litigation_clear',
    status: 'passed',
    finding: 'No case found.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    code: 'land_tax_paid',
    status: 'passed',
    finding: 'Dakhila current.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    code: 'acquisition_check',
    status: 'passed',
    finding: 'RAJUK-allotted land, not under acquisition.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    code: 'boundary_survey',
    status: 'passed',
    finding: 'Survey matches the allotment plan exactly.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    code: 'possession_clear',
    status: 'passed',
    finding: 'Vacant plot, nothing standing.',
  },
  {
    land: 'Uttara Sector 13 residential plot',
    code: 'land_use_clearance',
    status: 'passed',
    finding: 'Sector 13 residential, 7 floors permitted.',
  },

  /* Chattogram Khulshi — mid due diligence, and the case worth demonstrating:
     a failed mandatory item plus several still running, so gate G2 has real
     work to do and the tab header has a real number in it. */
  {
    land: 'Chattogram Khulshi hillside plot',
    code: 'ownership_proof',
    status: 'passed',
    finding: 'Owner confirmed on BS khatian.',
  },
  {
    land: 'Chattogram Khulshi hillside plot',
    code: 'heir_consent',
    status: 'in_progress',
    finding:
      'Inherited from the father in 2014. Two of three siblings have signed; the third is in Dubai.',
  },
  {
    land: 'Chattogram Khulshi hillside plot',
    code: 'deed_chain',
    status: 'passed',
    finding: 'Traced to 1979 through the inheritance deed.',
  },
  {
    land: 'Chattogram Khulshi hillside plot',
    code: 'khatian_verified',
    status: 'passed',
    finding: 'RS and BS consistent.',
  },
  {
    land: 'Chattogram Khulshi hillside plot',
    code: 'mutation_done',
    status: 'failed',
    finding:
      'Mutation is still in the deceased father name. Namjari application filed 2024 and not disposed of. Registration cannot proceed until it is.',
  },
  {
    land: 'Chattogram Khulshi hillside plot',
    code: 'encumbrance_search',
    status: 'submitted',
    finding: 'Search certificate from the Chattogram sub-registry received and handed in for review.',
  },
  {
    land: 'Chattogram Khulshi hillside plot',
    code: 'litigation_clear',
    status: 'passed',
    finding: 'No case in the civil court or the land survey tribunal.',
  },
  {
    land: 'Chattogram Khulshi hillside plot',
    code: 'land_tax_paid',
    status: 'passed',
    finding: 'Dakhila current to 1431.',
  },
  {
    land: 'Chattogram Khulshi hillside plot',
    code: 'land_use_clearance',
    status: 'in_progress',
    finding: 'CDA hill-cutting permission is the open question — application under review.',
  },

  /* L7 — Gazipur is mid-search while negotiating: some checks done, one awaiting review */
  ...(['ownership_proof', 'deed_chain', 'khatian_verified', 'land_tax_paid'] as const).map(
    (code): DemoDdFinding => ({
      land: 'Gazipur Tongi industrial-adjacent plot',
      code,
      status: 'passed',
      finding: 'Verified against the record-room copy.',
    }),
  ),
  {
    land: 'Gazipur Tongi industrial-adjacent plot',
    code: 'encumbrance_search',
    status: 'submitted',
    finding: 'Search report 2001–2026 received from the Tongi sub-registry; submitted for review.',
  },

  /*
   * Savar is agreed and settled for signing — every mandatory check done, one
   * of them approved on a condition (BRD DD-003), which is the case the
   * conditional state exists for.
   */
  ...passAllMandatory('Savar highway-side land', {
    boundary_survey: {
      status: 'conditionally_approved',
      finding:
        'Approved on condition the neighbour’s tin shed on the east strip is removed before signing; the 2.5 decimal strip under dispute is excluded from the agreement.',
    },
  }),

  /* the closed deals had their checks done in full */
  ...passAllMandatory('Chattogram Agrabad commercial plot'),
  ...passAllMandatory('Dhanmondi Road 27 plot'),
  ...passAllMandatory('Ashulia Zirabo industrial plot'),
  ...passAllMandatory('Bashundhara Block J ready plot'),
  ...passAllMandatory('Tangail Mirzapur roadside plot'),
  ...passAllMandatory('Rupganj Kanchan tract'),
  ...passAllMandatory('Savar Birulia riverside plot'),
  /*
   * Madhabdi passed every legal check and was still a bad buy (review
   * 2026-09-20). Due diligence verifies title; it does not verify that the
   * road the pricing rests on will ever be built. Worth one example in the
   * dataset, so `land_use_clearance` carries the finding that later undid the
   * plot rather than the usual "checked and clear".
   */
  ...passAllMandatory('Narsingdi Madhabdi plot', {
    land_use_clearance: {
      status: 'passed',
      finding:
        'DAP sheet shows the plot on a proposed 40ft access road; clearance issued on that basis. The road is proposed, not constructed.',
    },
  }),
];

function passAllMandatory(
  land: string,
  overrides: Partial<Record<string, Pick<DemoDdFinding, 'status' | 'finding'>>> = {},
): DemoDdFinding[] {
  return MANDATORY_CODES.map((code) => ({
    land,
    code,
    status: 'passed',
    finding: 'Checked and clear.',
    ...overrides[code],
  }));
}

