import type { PrismaClient } from '@prisma/client';

/**
 * The fee schedule.
 *
 * ── READ THIS BEFORE CHANGING A NUMBER ─────────────────────────────────
 *
 * EVERY RATE HERE IS A PLACEHOLDER. No statutory fee schedule has been
 * supplied for this jurisdiction (open question Q3), and architectural Rule 6
 * forbids inventing one and presenting it as though it were law. The structure
 * is therefore seeded with `isPlaceholder = true`, which the admin UI and the
 * demand both surface, so nobody can mistake a demonstration figure for a
 * charge the corporation is entitled to levy.
 *
 * What IS real is the shape: five calculation bases, effective dating,
 * versioning, minimum and maximum clamping, conditional components and
 * conditional adjustments. When the department supplies its schedule, the
 * numbers below are replaced — by an administrator, through the admin UI, as a
 * NEW VERSION with a later `effectiveFrom` — and no code changes. Demands
 * already issued keep the version they were calculated under, which is the
 * whole point of the design.
 *
 * The figures reproduce the worked example in docs/07-subsystems.md N.6, so
 * that document and this seed can be checked against each other:
 *
 *   Plot 300 m², built-up 620 m², residential
 *   ─────────────────────────────────────────────────────────────────
 *   Application fee        FLAT                            1,000.00
 *   Scrutiny fee           620 × 5.00                      3,100.00
 *   Development charge     100@20 + 200@30 + 320@45       22,400.00
 *   Betterment charge      10% of development charge       2,240.00
 *   Labour cess            1% of (scrutiny + development)     255.00
 *   Open-space contribution  plotAreaSqm × 15, min 2,000    4,500.00
 *   ─────────────────────────────────────────────────────────────────
 *   Total, rounded to the nearest rupee                   33,495.00
 */

/** The date from which the placeholder schedule is treated as effective. */
const EFFECTIVE_FROM = new Date('2020-04-01T00:00:00.000Z');

export const FEE_STRUCTURE = {
  code: 'BP_STANDARD_FEES',
  name: 'Standard building permission fees (placeholder)',
  version: 1,
  roundingRule: 'NEAREST_1',
  isPlaceholder: true,
  notes:
    'Illustrative rates only. No statutory fee schedule has been supplied for this jurisdiction — see open question Q3. Replace with the department’s schedule as a NEW VERSION; do not edit this one, or demands already issued under it become unexplainable.',
};

type ComponentSeed = {
  code: string;
  name: string;
  headOfAccount: string;
  basis: 'FLAT' | 'PER_UNIT_AREA' | 'SLAB' | 'PERCENTAGE' | 'FORMULA';
  rate?: number | null;
  variable?: string;
  percentOfCode?: string;
  expression?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  condition?: unknown;
  displayOrder: number;
  isRefundable?: boolean;
  slabs?: Array<{ fromValue: number; toValue: number | null; rate: number; flatAmount?: number | null }>;
};

export const FEE_COMPONENTS: ComponentSeed[] = [
  {
    code: 'APPLICATION_FEE',
    name: 'Application fee',
    headOfAccount: 'BP-APP-FEE',
    basis: 'FLAT',
    rate: 1000,
    displayOrder: 10,
  },
  {
    code: 'SCRUTINY_FEE',
    name: 'Scrutiny fee',
    headOfAccount: 'BP-SCRUTINY',
    basis: 'PER_UNIT_AREA',
    rate: 5,
    variable: 'builtUpAreaSqm',
    displayOrder: 20,
  },
  {
    code: 'DEVELOPMENT_CHARGE',
    name: 'Development charge',
    headOfAccount: 'BP-DEV-CHARGE',
    basis: 'SLAB',
    variable: 'builtUpAreaSqm',
    displayOrder: 30,
    // Cumulative bands: the first 100 m² at one rate, the next 200 at another,
    // everything above at a third. The last band is open-ended, which is how a
    // schedule says "and the remainder".
    slabs: [
      { fromValue: 0, toValue: 100, rate: 20 },
      { fromValue: 100, toValue: 300, rate: 30 },
      { fromValue: 300, toValue: null, rate: 45 },
    ],
  },
  {
    code: 'BETTERMENT_CHARGE',
    name: 'Betterment charge',
    headOfAccount: 'BP-BETTERMENT',
    basis: 'PERCENTAGE',
    rate: 10,
    percentOfCode: 'DEVELOPMENT_CHARGE',
    // Must come AFTER what it is a percentage of. The calculator refuses a
    // forward reference rather than quietly charging 10% of nothing.
    displayOrder: 40,
  },
  {
    code: 'LABOUR_CESS',
    name: 'Labour cess',
    headOfAccount: 'BP-LABOUR-CESS',
    basis: 'PERCENTAGE',
    rate: 1,
    percentOfCode: 'SCRUTINY_FEE,DEVELOPMENT_CHARGE',
    displayOrder: 50,
  },
  {
    code: 'OPEN_SPACE_CONTRIBUTION',
    name: 'Open-space contribution',
    headOfAccount: 'BP-OPEN-SPACE',
    basis: 'FORMULA',
    expression: 'plotAreaSqm * 15',
    minAmount: 2000,
    displayOrder: 60,
  },
];

type RuleSeed = {
  code: string;
  name: string;
  kind: 'REBATE' | 'SURCHARGE';
  basis: 'FLAT' | 'PERCENTAGE';
  rate: number;
  appliesToCode?: string;
  condition?: unknown;
  reason: string;
  displayOrder: number;
};

/**
 * Conditional adjustments.
 *
 * Both are illustrative, like the rates above, and both are deliberately
 * written so they do NOT fire on an ordinary application — a demonstration
 * that silently applied a concession to every demand would be worse than no
 * demonstration at all. They exist so the Adjustments line, the rebate/
 * surcharge arithmetic and the condition evaluation are all exercised by
 * something real rather than only by tests.
 */
export const FEE_RULES: RuleSeed[] = [
  {
    code: 'SMALL_PLOT_REBATE',
    name: 'Small plot concession',
    kind: 'REBATE',
    basis: 'PERCENTAGE',
    rate: 10,
    condition: { lte: ['plotAreaSqm', 100] },
    reason: 'Illustrative concession for plots of 100 m² or less',
    displayOrder: 10,
  },
  {
    code: 'HIGH_RISE_SURCHARGE',
    name: 'High-rise surcharge',
    kind: 'SURCHARGE',
    basis: 'PERCENTAGE',
    rate: 5,
    condition: { gte: ['numFloors', 5] },
    reason: 'Illustrative surcharge for buildings of five floors or more',
    displayOrder: 20,
  },
];

export async function seedFees(prisma: PrismaClient) {
  // Deliberately NOT scoped to an application type: one schedule covers every
  // kind of permission until the department supplies different ones. A
  // type-specific structure, when it exists, wins over this by being more
  // specific — see resolveStructure().
  const structure = await prisma.feeStructure.upsert({
    where: { code_version: { code: FEE_STRUCTURE.code, version: FEE_STRUCTURE.version } },
    create: {
      code: FEE_STRUCTURE.code,
      name: FEE_STRUCTURE.name,
      version: FEE_STRUCTURE.version,
      applicationTypeId: null,
      effectiveFrom: EFFECTIVE_FROM,
      effectiveTo: null,
      roundingRule: FEE_STRUCTURE.roundingRule,
      isActive: true,
      isPlaceholder: FEE_STRUCTURE.isPlaceholder,
      notes: FEE_STRUCTURE.notes,
    },
    update: {
      name: FEE_STRUCTURE.name,
      roundingRule: FEE_STRUCTURE.roundingRule,
      isPlaceholder: FEE_STRUCTURE.isPlaceholder,
      notes: FEE_STRUCTURE.notes,
      // `effectiveFrom` and `isActive` are NOT refreshed. If a department has
      // superseded this placeholder with their own schedule, re-running the
      // seed must not resurrect it over the top of theirs.
    },
    select: { id: true },
  });

  for (const component of FEE_COMPONENTS) {
    const data = {
      name: component.name,
      headOfAccount: component.headOfAccount,
      basis: component.basis,
      rate: component.rate ?? null,
      variable: component.variable ?? '',
      percentOfCode: component.percentOfCode ?? '',
      expression: component.expression ?? '',
      minAmount: component.minAmount ?? null,
      maxAmount: component.maxAmount ?? null,
      condition: (component.condition ?? {}) as never,
      isRefundable: component.isRefundable ?? false,
      displayOrder: component.displayOrder,
      isActive: true,
    };

    const row = await prisma.feeComponent.upsert({
      where: { feeStructureId_code: { feeStructureId: structure.id, code: component.code } },
      create: { feeStructureId: structure.id, code: component.code, ...data },
      update: data,
      select: { id: true },
    });

    // Slabs have no natural key and are meaningless apart from their
    // component, so they are replaced wholesale rather than diffed. Safe
    // because they belong to a structure VERSION: an issued demand does not
    // read them again — it carries its own frozen line items.
    if (component.slabs) {
      await prisma.feeSlab.deleteMany({ where: { feeComponentId: row.id } });
      await prisma.feeSlab.createMany({
        data: component.slabs.map((slab, index) => ({
          feeComponentId: row.id,
          fromValue: slab.fromValue,
          toValue: slab.toValue,
          rate: slab.rate,
          flatAmount: slab.flatAmount ?? null,
          displayOrder: index,
        })),
      });
    }
  }

  for (const rule of FEE_RULES) {
    const data = {
      name: rule.name,
      kind: rule.kind,
      basis: rule.basis,
      rate: rule.rate,
      appliesToCode: rule.appliesToCode ?? '',
      condition: (rule.condition ?? {}) as never,
      reason: rule.reason,
      displayOrder: rule.displayOrder,
      isActive: true,
    };

    await prisma.feeRule.upsert({
      where: { feeStructureId_code: { feeStructureId: structure.id, code: rule.code } },
      create: { feeStructureId: structure.id, code: rule.code, ...data },
      update: data,
    });
  }

  return {
    structures: 1,
    components: FEE_COMPONENTS.length,
    rules: FEE_RULES.length,
    isPlaceholder: FEE_STRUCTURE.isPlaceholder,
  };
}
