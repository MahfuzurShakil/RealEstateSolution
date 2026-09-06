import type { PurchaseOrderStatus, QualityCheck, SupplierPaymentMethod, SupplierType } from './types';

/**
 * Bangladesh-context demo dataset for Module 6 (Procurement & Supplier
 * Voucher).
 *
 * Everything time-dependent is an offset in days from the day the demo is
 * loaded, never a fixed date — the same rule Module 5 follows, and for the same
 * reason: a hard-coded 2026 date turns "ordered 40 days ago, still not
 * delivered" into nonsense a month later.
 *
 * The set is chosen so no page or tab opens empty and every state is reachable:
 *
 *   PO status        — draft, ordered, partially_received, received, cancelled
 *   PO route         — against a material request, direct, and central/no-project
 *   quality check    — passed, failed, pending (one rejected batch, one awaiting test)
 *   stock            — project stores and the central store, several items each
 *   movement         — issues to site (with and without a work item), and transfers
 *                      central → project and project → project
 *   payment method   — cash, bank, mfs, cheque, online
 *   payment state    — unpaid, part-paid, fully settled
 */

export interface DemoSupplier {
  key: string;
  name: string;
  type: SupplierType;
  contact_person?: string;
  phone: string;
  address?: string;
  notes?: string;
}

export const DEMO_SUPPLIERS: DemoSupplier[] = [
  {
    key: 'shah',
    name: 'Shah Cement Distributor (Tejgaon)',
    type: 'material_supplier',
    contact_person: 'Abdul Kader',
    phone: '01811 223344',
    address: 'Tejgaon Industrial Area, Dhaka 1208',
    notes: '30-day credit. Delivery within 48 hours on full-truck orders.',
  },
  {
    key: 'bsrm',
    name: 'BSRM Steels — Dhaka Depot',
    type: 'material_supplier',
    contact_person: 'Nazmul Huda',
    phone: '01812 334455',
    address: 'Motijheel C/A, Dhaka 1000',
    notes: 'Rate revised monthly against the mill price list.',
  },
  {
    key: 'meghna',
    name: 'Meghna Sand & Aggregates',
    type: 'material_supplier',
    contact_person: 'Rafiq Mia',
    phone: '01813 445566',
    address: 'Kanchpur, Narayanganj',
    notes: 'Sylhet sand and stone chips by truckload. Cash on delivery.',
  },
  {
    key: 'bijoy',
    name: 'Bijoy Electric & Hardware',
    type: 'material_supplier',
    contact_person: 'Shamim Ahmed',
    phone: '01814 556677',
    address: 'Nawabpur Road, Dhaka 1100',
  },
  {
    key: 'berger',
    name: 'Berger Paints Dealer — Dhanmondi',
    type: 'material_supplier',
    contact_person: 'Tanvir Islam',
    phone: '01815 667788',
    address: 'Road 27, Dhanmondi, Dhaka 1209',
  },
  {
    key: 'rfl',
    name: 'RFL Plastics & Pipes',
    type: 'material_supplier',
    contact_person: 'Sumaiya Akter',
    phone: '01816 778899',
    address: 'Uttara Sector 7, Dhaka 1230',
    notes: 'Plumbing lines. Prices firm for 15 days from quotation.',
  },
  {
    key: 'akij',
    name: 'Akij Bricks & Blocks',
    type: 'material_supplier',
    contact_person: 'Jamal Uddin',
    phone: '01817 889900',
    address: 'Savar, Dhaka',
  },
  {
    key: 'nirman',
    name: 'Nirman Construction Services',
    type: 'contractor',
    contact_person: 'Engr. Habibur Rahman',
    phone: '01818 990011',
    address: 'Mirpur DOHS, Dhaka 1216',
    notes: 'Piling and substructure subcontractor. Kept here for the Contractor module.',
  },
  {
    key: 'safety',
    name: 'Dhaka Safety Equipment House',
    type: 'other',
    contact_person: 'Mizanur Rahman',
    phone: '01819 001122',
    address: 'Bangshal, Dhaka 1100',
    notes: 'Helmets, harnesses, signage. Small orders, no credit.',
  },
];

export interface DemoPoItem {
  item_name: string;
  unit: string;
  quantity_ordered: number;
  unit_price: number;
}

export interface DemoGrnLine {
  /** matches a line by `item_name` on the same order */
  item_name: string;
  quantity_received: number;
  quality_check: QualityCheck;
}

export interface DemoGrn {
  days_ago: number;
  received_by_key: string;
  notes?: string;
  lines: DemoGrnLine[];
}

export interface DemoVoucher {
  days_ago: number;
  amount: number;
  payment_method: SupplierPaymentMethod;
  reference_no?: string;
  paid_by_key: string;
  notes?: string;
}

export interface DemoPurchaseOrder {
  key: string;
  supplier_key: string;
  /** omit for a central/company purchase — Section 7.4 makes it nullable */
  project_name?: string;
  /** the DEMO_MATERIAL_REQUESTS key this fulfils, when there is one */
  request_key?: string;
  days_ago: number;
  /** the state the order should end in; receipts drive it where they can */
  status: PurchaseOrderStatus;
  notes?: string;
  /** appended by the cancellation step, so the reason is on the record */
  cancel_reason?: string;
  items: DemoPoItem[];
  receipts?: DemoGrn[];
  vouchers?: DemoVoucher[];
}

export const DEMO_PURCHASE_ORDERS: DemoPurchaseOrder[] = [
  /* ---------------------------------------------------------------- *
   * The full happy path: request → PO → two GRNs → fully received →
   * paid off. This is the order that closes MREQ "dhanmondi-paint" as
   * Fulfilled without anybody clicking a status.
   * ---------------------------------------------------------------- */
  {
    key: 'dhanmondi-paint',
    supplier_key: 'berger',
    project_name: 'Nokshi Dhanmondi Court',
    request_key: 'dhanmondi-paint',
    days_ago: 104,
    status: 'received',
    notes: 'Final coat before the snag inspection. Delivery split over two trips.',
    items: [
      { item_name: 'Berger Weathercoat (Exterior)', unit: 'litre', quantity_ordered: 900, unit_price: 585 },
      { item_name: 'Wall Putty', unit: 'kg', quantity_ordered: 400, unit_price: 92 },
      { item_name: 'Paint Roller Set', unit: 'piece', quantity_ordered: 30, unit_price: 340 },
    ],
    receipts: [
      {
        days_ago: 96,
        received_by_key: 'jahangir',
        notes: 'First trip — paint and rollers. Challan 44821.',
        lines: [
          { item_name: 'Berger Weathercoat (Exterior)', quantity_received: 600, quality_check: 'passed' },
          { item_name: 'Paint Roller Set', quantity_received: 30, quality_check: 'passed' },
        ],
      },
      {
        days_ago: 88,
        received_by_key: 'jahangir',
        notes: 'Balance paint and the full putty lot. Challan 44903.',
        lines: [
          { item_name: 'Berger Weathercoat (Exterior)', quantity_received: 300, quality_check: 'passed' },
          { item_name: 'Wall Putty', quantity_received: 400, quality_check: 'passed' },
        ],
      },
    ],
    vouchers: [
      {
        days_ago: 100,
        amount: 300000,
        payment_method: 'cheque',
        reference_no: 'DBBL 4471203',
        paid_by_key: 'faruk',
        notes: 'Advance against the first delivery.',
      },
      {
        days_ago: 84,
        amount: 273500,
        payment_method: 'bank',
        reference_no: 'BEFTN 8890231',
        paid_by_key: 'faruk',
        notes: 'Balance settled after the second trip.',
      },
    ],
  },

  /* ---------------------------------------------------------------- *
   * Part-delivered, part-paid — the ordinary live order, and the one
   * that keeps MREQ "electrical-conduit" sitting at Ordered.
   * ---------------------------------------------------------------- */
  {
    key: 'green-conduit',
    supplier_key: 'bijoy',
    project_name: 'Nokshi Green Residence',
    request_key: 'electrical-conduit',
    days_ago: 34,
    status: 'partially_received',
    notes: 'Conduit and boxes to be cast into the slabs. Delivery promised within ten days.',
    items: [
      { item_name: 'PVC Conduit Pipe 25mm', unit: 'bundle', quantity_ordered: 120, unit_price: 780 },
      { item_name: 'Concealed Junction Box', unit: 'piece', quantity_ordered: 600, unit_price: 65 },
    ],
    receipts: [
      {
        days_ago: 21,
        received_by_key: 'jahangir',
        notes: 'Half the conduit and all the boxes. Rest to follow.',
        lines: [
          { item_name: 'PVC Conduit Pipe 25mm', quantity_received: 60, quality_check: 'passed' },
          { item_name: 'Concealed Junction Box', quantity_received: 600, quality_check: 'passed' },
        ],
      },
    ],
    vouchers: [
      {
        days_ago: 20,
        amount: 85800,
        payment_method: 'mfs',
        reference_no: 'bKash TrxID BKX9F2K',
        paid_by_key: 'faruk',
        notes: 'Paid against the first delivery only.',
      },
    ],
  },

  /* ---------------------------------------------------------------- *
   * A rejected batch. The cement passed, the rod did not — so only the
   * cement reached stock, which is the whole point of Section 7.6.
   * ---------------------------------------------------------------- */
  {
    key: 'green-slab',
    supplier_key: 'shah',
    project_name: 'Nokshi Green Residence',
    days_ago: 18,
    // fully received as a delivery — the rejected wire still counts as
    // received against the order (Section 7.6 updates `quantity_received`
    // regardless of the quality check); what it does NOT do is reach stock
    status: 'received',
    // deliberately NOT against MREQ 'shuttering-ply': that request is left
    // approved-with-no-order so the "to buy" inbox has something in it
    notes: 'Shuttering material for the 7th and 8th floor pours. Bought directly.',
    items: [
      { item_name: 'Shuttering Ply 12mm', unit: 'piece', quantity_ordered: 140, unit_price: 1450 },
      { item_name: 'GI Wire 20 SWG', unit: 'kg', quantity_ordered: 150, unit_price: 128 },
      { item_name: 'Shuttering Oil', unit: 'litre', quantity_ordered: 80, unit_price: 210 },
    ],
    receipts: [
      {
        days_ago: 9,
        received_by_key: 'jahangir',
        notes:
          'Ply and oil accepted. The GI wire coil was rusted through — rejected at the gate and sent back on the same truck.',
        lines: [
          { item_name: 'Shuttering Ply 12mm', quantity_received: 140, quality_check: 'passed' },
          { item_name: 'GI Wire 20 SWG', quantity_received: 150, quality_check: 'failed' },
          { item_name: 'Shuttering Oil', quantity_received: 80, quality_check: 'passed' },
        ],
      },
    ],
    vouchers: [
      {
        days_ago: 7,
        amount: 219800,
        payment_method: 'bank',
        reference_no: 'BEFTN 9012884',
        paid_by_key: 'faruk',
        notes: 'Paid for the ply and oil. The rejected wire is not being paid for.',
      },
    ],
  },

  /* ---------------------------------------------------------------- *
   * Ordered, nothing arrived yet, nothing paid — the "still to come"
   * figure on the dashboard has to come from somewhere.
   * ---------------------------------------------------------------- */
  {
    key: 'green-rod',
    supplier_key: 'bsrm',
    project_name: 'Nokshi Green Residence',
    days_ago: 6,
    status: 'ordered',
    notes: 'Rod for the 9th floor columns. Mill despatch confirmed, truck not loaded yet.',
    items: [
      { item_name: 'MS Rod 16mm (BSRM)', unit: 'ton', quantity_ordered: 12, unit_price: 96500 },
      { item_name: 'MS Rod 12mm (BSRM)', unit: 'ton', quantity_ordered: 6, unit_price: 95800 },
    ],
  },

  /* ---------------------------------------------------------------- *
   * A quality check still pending: the material is on site but not
   * accepted, so it is deliberately NOT in stock yet.
   * ---------------------------------------------------------------- */
  {
    key: 'green-bricks',
    supplier_key: 'akij',
    project_name: 'Nokshi Green Residence',
    days_ago: 5,
    status: 'partially_received',
    notes: 'Partition walls, Tower B, 4th and 5th floors. Bought directly, ahead of the request.',
    items: [
      { item_name: 'First Class Bricks', unit: 'piece', quantity_ordered: 40000, unit_price: 13.5 },
      { item_name: 'Cement (Fresh)', unit: 'bag', quantity_ordered: 220, unit_price: 545 },
    ],
    receipts: [
      {
        days_ago: 2,
        received_by_key: 'salma',
        notes:
          'Cement taken in. Brick sample sent for a crushing-strength test — nothing counted into stock until the result is back.',
        lines: [
          { item_name: 'First Class Bricks', quantity_received: 20000, quality_check: 'pending' },
          { item_name: 'Cement (Fresh)', quantity_received: 220, quality_check: 'passed' },
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- *
   * Cancelled after a part delivery — the case Section 7.6 spells out:
   * what arrived stays, only the balance is voided.
   * ---------------------------------------------------------------- */
  {
    key: 'green-sand',
    supplier_key: 'meghna',
    project_name: 'Nokshi Green Residence',
    days_ago: 46,
    status: 'cancelled',
    notes: 'Sylhet sand and chips for the slab pour.',
    cancel_reason:
      'Supplier could not hold the rate after the second trip and wanted a 14% increase. Balance cancelled and re-ordered elsewhere.',
    items: [
      { item_name: 'Sylhet Sand', unit: 'cft', quantity_ordered: 1800, unit_price: 58 },
      { item_name: 'Stone Chips 3/4"', unit: 'cft', quantity_ordered: 1200, unit_price: 172 },
    ],
    receipts: [
      {
        days_ago: 41,
        received_by_key: 'jahangir',
        notes: 'Two truckloads of sand only.',
        lines: [{ item_name: 'Sylhet Sand', quantity_received: 900, quality_check: 'passed' }],
      },
    ],
    vouchers: [
      {
        days_ago: 39,
        amount: 52200,
        payment_method: 'cash',
        paid_by_key: 'faruk',
        notes: 'Cash on delivery for the two truckloads that did arrive.',
      },
    ],
  },

  /* ---------------------------------------------------------------- *
   * Central purchase (project_id = null) — the advance-stocking route
   * of Section 7.8a. What comes in here is transferred out below.
   * ---------------------------------------------------------------- */
  {
    key: 'central-cement',
    supplier_key: 'shah',
    days_ago: 60,
    status: 'received',
    notes:
      'Bulk buy before the monsoon price rise. Not for one project — held centrally and released as sites need it.',
    items: [
      { item_name: 'Cement (Shah Special)', unit: 'bag', quantity_ordered: 2000, unit_price: 512 },
    ],
    receipts: [
      {
        days_ago: 55,
        received_by_key: 'monir',
        notes: 'Full lot into the central store, Tejgaon.',
        lines: [{ item_name: 'Cement (Shah Special)', quantity_received: 2000, quality_check: 'passed' }],
      },
    ],
    vouchers: [
      {
        days_ago: 54,
        amount: 1024000,
        payment_method: 'bank',
        reference_no: 'BEFTN 7761092',
        paid_by_key: 'faruk',
      },
    ],
  },
  {
    key: 'central-second-lot',
    supplier_key: 'shah',
    days_ago: 25,
    status: 'received',
    notes: 'Top-up at the new rate — this is what moves the weighted average on the central store.',
    items: [
      { item_name: 'Cement (Shah Special)', unit: 'bag', quantity_ordered: 800, unit_price: 568 },
    ],
    receipts: [
      {
        days_ago: 22,
        received_by_key: 'monir',
        lines: [{ item_name: 'Cement (Shah Special)', quantity_received: 800, quality_check: 'passed' }],
      },
    ],
    vouchers: [
      {
        days_ago: 21,
        amount: 454400,
        payment_method: 'online',
        reference_no: 'City Bank IB 553201',
        paid_by_key: 'faruk',
      },
    ],
  },
  {
    key: 'central-safety',
    supplier_key: 'safety',
    days_ago: 30,
    status: 'received',
    notes: 'Safety gear kept centrally and issued to whichever site mobilises next.',
    items: [
      { item_name: 'Safety Helmet', unit: 'piece', quantity_ordered: 120, unit_price: 420 },
      { item_name: 'Safety Harness', unit: 'piece', quantity_ordered: 25, unit_price: 2350 },
    ],
    receipts: [
      {
        days_ago: 27,
        received_by_key: 'monir',
        lines: [
          { item_name: 'Safety Helmet', quantity_received: 120, quality_check: 'passed' },
          { item_name: 'Safety Harness', quantity_received: 25, quality_check: 'passed' },
        ],
      },
    ],
    vouchers: [
      { days_ago: 26, amount: 109150, payment_method: 'cash', paid_by_key: 'faruk' },
    ],
  },

  /* ---------------------------------------------------------------- *
   * Plumbing for the finished project, fully received and fully paid —
   * so its store has something to have issued from.
   * ---------------------------------------------------------------- */
  {
    key: 'dhanmondi-plumbing',
    supplier_key: 'rfl',
    project_name: 'Nokshi Dhanmondi Court',
    days_ago: 140,
    status: 'received',
    notes: 'Plumbing lines for the whole tower.',
    items: [
      { item_name: 'uPVC Pipe 4"', unit: 'piece', quantity_ordered: 260, unit_price: 1180 },
      { item_name: 'CP Bath Fitting Set', unit: 'piece', quantity_ordered: 48, unit_price: 8600 },
    ],
    receipts: [
      {
        days_ago: 132,
        received_by_key: 'jahangir',
        lines: [
          { item_name: 'uPVC Pipe 4"', quantity_received: 260, quality_check: 'passed' },
          { item_name: 'CP Bath Fitting Set', quantity_received: 48, quality_check: 'passed' },
        ],
      },
    ],
    vouchers: [
      {
        days_ago: 130,
        amount: 719600,
        payment_method: 'cheque',
        reference_no: 'BRAC 3390144',
        paid_by_key: 'faruk',
      },
    ],
  },

  /* ---------------------------------------------------------------- *
   * A draft — priced but not placed, so it commits nothing, cannot be
   * received against, and shows the "not ordered yet" state.
   * ---------------------------------------------------------------- */
  {
    key: 'agrabad-draft',
    supplier_key: 'bsrm',
    project_name: 'Nokshi Agrabad Trade Centre',
    days_ago: 3,
    status: 'draft',
    notes: 'Priced against the current mill list. Waiting on the piling schedule before placing it.',
    items: [
      { item_name: 'MS Rod 20mm (BSRM)', unit: 'ton', quantity_ordered: 30, unit_price: 97200 },
      { item_name: 'MS Rod 25mm (BSRM)', unit: 'ton', quantity_ordered: 18, unit_price: 97600 },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Stock movements
 * ------------------------------------------------------------------ */

export interface DemoTransfer {
  item_name: string;
  unit: string;
  quantity: number;
  /** omit for the central store */
  from_project_name?: string;
  to_project_name: string;
  days_ago: number;
  transferred_by_key: string;
  notes?: string;
}

export const DEMO_STOCK_TRANSFERS: DemoTransfer[] = [
  {
    item_name: 'Cement (Shah Special)',
    unit: 'bag',
    quantity: 900,
    to_project_name: 'Nokshi Green Residence',
    days_ago: 45,
    transferred_by_key: 'monir',
    notes: 'Released from the pre-monsoon bulk buy for the 6th and 7th floor pours.',
  },
  {
    item_name: 'Safety Helmet',
    unit: 'piece',
    quantity: 40,
    to_project_name: 'Nokshi Green Residence',
    days_ago: 24,
    transferred_by_key: 'monir',
    notes: 'New gang starting on the superstructure.',
  },
  {
    item_name: 'Cement (Shah Special)',
    unit: 'bag',
    quantity: 400,
    to_project_name: 'Nokshi Dhanmondi Court',
    days_ago: 12,
    transferred_by_key: 'monir',
    notes: 'Second lot released at the new rate — the receiving store re-averages its own cost.',
  },
  {
    item_name: 'Safety Helmet',
    unit: 'piece',
    quantity: 15,
    from_project_name: 'Nokshi Green Residence',
    to_project_name: 'Nokshi Dhanmondi Court',
    days_ago: 8,
    transferred_by_key: 'salma',
    notes: 'Project-to-project: surplus after the Tower A gang wound down.',
  },
];

export interface DemoIssue {
  project_name: string;
  /** the WBS line it went to — optional detail per Section 7.8 */
  tower_name?: string;
  work_item_name?: string;
  item_name: string;
  unit: string;
  quantity_issued: number;
  days_ago: number;
  issued_by_key: string;
  notes?: string;
  /**
   * Section 7.8b. How much of this issue the site actually laid, and how much
   * it sent back — seeded so the demo shows the gap the split exists for.
   *
   * Left undefined, the issue is fully consumed a few days later, which is the
   * ordinary case. A number smaller than the issue leaves the remainder
   * standing on the site, which is the case that used to be invisible.
   */
  used_quantity?: number;
  returned_quantity?: number;
}

export const DEMO_STOCK_ISSUES: DemoIssue[] = [
  {
    project_name: 'Nokshi Green Residence',
    tower_name: 'Tower A',
    work_item_name: 'Superstructure',
    item_name: 'Cement (Shah Special)',
    unit: 'bag',
    quantity_issued: 450,
    days_ago: 40,
    issued_by_key: 'jahangir',
    notes: '6th floor slab casting.',
  },
  {
    project_name: 'Nokshi Green Residence',
    tower_name: 'Tower A',
    work_item_name: 'Superstructure',
    item_name: 'Cement (Shah Special)',
    unit: 'bag',
    quantity_issued: 320,
    days_ago: 18,
    issued_by_key: 'jahangir',
    notes: '7th floor slab and column casting.',
    // 40 bags never got laid and are still stacked by the lift core — the
    // exact case that used to be charged to the project and shown nowhere
    used_quantity: 280,
  },
  {
    project_name: 'Nokshi Green Residence',
    tower_name: 'Tower A',
    work_item_name: 'Superstructure',
    item_name: 'Sylhet Sand',
    unit: 'cft',
    quantity_issued: 640,
    days_ago: 38,
    issued_by_key: 'jahangir',
  },
  {
    project_name: 'Nokshi Green Residence',
    tower_name: 'Tower A',
    work_item_name: 'Electrical',
    item_name: 'Concealed Junction Box',
    unit: 'piece',
    quantity_issued: 280,
    days_ago: 15,
    issued_by_key: 'jahangir',
    notes: 'Cast into the 7th floor slab.',
    // over-issued: the surplus went back to the store, where a transfer can
    // now take it to whichever tower needs it
    used_quantity: 240,
    returned_quantity: 40,
  },
  {
    project_name: 'Nokshi Green Residence',
    item_name: 'Safety Helmet',
    unit: 'piece',
    quantity_issued: 22,
    days_ago: 20,
    issued_by_key: 'salma',
    // no work item on purpose: site-wide consumption, which 7.8 allows
    notes: 'Issued to the new labour gang at the gate.',
  },
  {
    project_name: 'Nokshi Dhanmondi Court',
    tower_name: 'Tower A',
    work_item_name: 'Finishing',
    item_name: 'Berger Weathercoat (Exterior)',
    unit: 'litre',
    quantity_issued: 720,
    days_ago: 80,
    issued_by_key: 'jahangir',
    notes: 'Given to the painting contractor for the external faces.',
    used_quantity: 600,
  },
  {
    project_name: 'Nokshi Dhanmondi Court',
    tower_name: 'Tower A',
    work_item_name: 'Finishing',
    item_name: 'Wall Putty',
    unit: 'kg',
    quantity_issued: 340,
    days_ago: 82,
    issued_by_key: 'jahangir',
  },
  {
    project_name: 'Nokshi Dhanmondi Court',
    tower_name: 'Tower A',
    work_item_name: 'Plumbing',
    item_name: 'uPVC Pipe 4"',
    unit: 'piece',
    quantity_issued: 210,
    days_ago: 120,
    issued_by_key: 'jahangir',
  },
];
