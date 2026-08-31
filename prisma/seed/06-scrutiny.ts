import type { PrismaClient } from '@prisma/client';

/**
 * The scrutiny rule catalogue.
 *
 * ── READ THIS BEFORE ADDING A NUMBER ───────────────────────────────────
 *
 * `reference` is DELIBERATELY EMPTY on every row, and no rule states a
 * threshold. No byelaw schedule has been supplied for this jurisdiction, and
 * architectural Rule 6 forbids inventing one — a seed row reading "front
 * setback must be 3 m" would be legislation invented by a developer, printed
 * on a report, and shown to an applicant as though it were law.
 *
 * So each rule describes a CONDITION that can be checked without citing a
 * figure: does the drawing agree with the particulars the applicant declared?
 * That is a real, useful check, and it is honest about what it is.
 *
 * When the department supplies its schedule, `reference` and the numeric
 * thresholds are filled in HERE, and the report renderer starts printing the
 * citation it already knows how to display. No code changes.
 *
 * `remedy` is what the LTP should do. A finding they cannot act on wastes a
 * correction cycle, and the correction cycle is the expensive part of this
 * process for everyone involved.
 */

type RuleSeed = {
  code: string;
  name: string;
  category: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
  description: string;
  remedy: string;
};

/**
 * Categories match the issue types the requirement names — setback, FAR,
 * parking, height, road width — plus the drawing-quality checks any real
 * engine performs.
 */
export const SCRUTINY_RULES: RuleSeed[] = [
  // ── Setback ───────────────────────────────────────────────────────────
  {
    code: 'SETBACK_FRONT',
    name: 'Front setback consistency',
    category: 'SETBACK',
    severity: 'MAJOR',
    description:
      'The front setback shown on the site plan must agree with the front setback declared in the application particulars.',
    remedy:
      'Correct the front setback on the site plan, or amend the setback recorded in the application so the two agree.',
  },
  {
    code: 'SETBACK_REAR',
    name: 'Rear setback consistency',
    category: 'SETBACK',
    severity: 'MAJOR',
    description:
      'The rear open space shown on the site plan must agree with the rear setback declared in the particulars.',
    remedy: 'Dimension the rear open space on the site plan and make it match the declared value.',
  },
  {
    code: 'SETBACK_SIDE',
    name: 'Side setback consistency',
    category: 'SETBACK',
    severity: 'MAJOR',
    description:
      'Side open space on both flanks must agree with the left and right setbacks declared in the particulars.',
    remedy: 'Dimension both side setbacks on the site plan and make them match the declared values.',
  },

  // ── Floor area and coverage ───────────────────────────────────────────
  {
    code: 'FAR_LIMIT',
    name: 'Floor area consistency',
    category: 'FAR',
    severity: 'CRITICAL',
    description:
      'The floor area computed from the drawing must agree with the floor area declared in the application particulars.',
    remedy:
      'Check the floor-wise area statement on the drawing against the declared total floor area, and correct whichever is wrong.',
  },
  {
    code: 'COVERAGE_LIMIT',
    name: 'Ground coverage consistency',
    category: 'FAR',
    severity: 'MAJOR',
    description:
      'The building footprint on the site plan must agree with the ground coverage declared in the particulars.',
    remedy:
      'Dimension the footprint on the site plan and reconcile it with the declared ground coverage area.',
  },

  // ── Parking ───────────────────────────────────────────────────────────
  {
    code: 'PARKING_PROVISION',
    name: 'Parking provision consistency',
    category: 'PARKING',
    severity: 'MAJOR',
    description:
      'The parking bays shown must account for the parking area and number of dwelling units declared in the particulars.',
    remedy:
      'Mark and count the parking bays on the parking plan, and reconcile the total with the declared parking area.',
  },
  {
    code: 'PARKING_AISLE',
    name: 'Parking aisle dimensioned',
    category: 'PARKING',
    severity: 'MINOR',
    description: 'Manoeuvring space between parking bays should be dimensioned on the drawing.',
    remedy: 'Add aisle width dimensions to the parking plan.',
  },

  // ── Height ────────────────────────────────────────────────────────────
  {
    code: 'HEIGHT_LIMIT',
    name: 'Building height consistency',
    category: 'HEIGHT',
    severity: 'CRITICAL',
    description:
      'The height shown on the elevation must agree with the height declared for the number of floors in the particulars.',
    remedy:
      'Dimension the total height on the elevation from ground level, and reconcile it with the declared height and floor count.',
  },

  // ── Road width ────────────────────────────────────────────────────────
  {
    code: 'ROAD_WIDTH_MIN',
    name: 'Abutting road width consistency',
    category: 'ROAD_WIDTH',
    severity: 'CRITICAL',
    description:
      'The width of the abutting road shown on the site plan must agree with the width declared in the particulars.',
    remedy:
      'Dimension the abutting road on the site plan, and correct either the drawing or the declared road width.',
  },

  // ── Site and safety ───────────────────────────────────────────────────
  {
    code: 'OPEN_SPACE',
    name: 'Open space distinguishable',
    category: 'SITE',
    severity: 'MINOR',
    description:
      'Open space should be hatched or otherwise distinguished from built-up area on the site plan.',
    remedy: 'Hatch and label the open space on the site plan.',
  },
  {
    code: 'NORTH_POINT',
    name: 'North point shown',
    category: 'SITE',
    severity: 'MINOR',
    description: 'The site plan should carry a north point so orientation can be read.',
    remedy: 'Add a north point to the site plan.',
  },
  {
    code: 'STAIR_WIDTH',
    name: 'Staircase dimensioned',
    category: 'SAFETY',
    severity: 'MAJOR',
    description:
      'Staircase width and tread dimensions should be shown on the floor plan so means of escape can be assessed.',
    remedy: 'Dimension the staircase width, tread and riser on every floor plan.',
  },

  // ── Drawing quality ───────────────────────────────────────────────────
  {
    code: 'SCALE_DECLARED',
    name: 'Drawing scale declared',
    category: 'DRAWING',
    severity: 'INFO',
    description: 'The title block should state the scale at which the drawing is prepared.',
    remedy: 'Add the scale to the title block.',
  },
  {
    code: 'DIM_LEGIBILITY',
    name: 'Dimensions legible',
    category: 'DRAWING',
    severity: 'MINOR',
    description: 'Dimensions should be legible at the declared scale.',
    remedy: 'Increase the dimension text height, or re-issue the sheet at a larger scale.',
  },
];

/** The drawing sheet types offered at upload. Extensible from the admin UI. */
export const DRAWING_CATEGORIES = [
  { code: 'SITE_PLAN', label: 'Site Plan', order: 1 },
  { code: 'FLOOR_PLAN', label: 'Floor Plan', order: 2 },
  { code: 'ELEVATION', label: 'Elevation', order: 3 },
  { code: 'SECTION', label: 'Section', order: 4 },
  { code: 'PARKING_PLAN', label: 'Parking Plan', order: 5 },
  { code: 'STRUCTURAL_DRAWING', label: 'Structural Drawing', order: 6 },
  { code: 'OTHER', label: 'Other', order: 99 },
];

export async function seedScrutiny(prisma: PrismaClient) {
  for (const category of DRAWING_CATEGORIES) {
    await prisma.masterData.upsert({
      where: { category_code: { category: 'DRAWING_CATEGORY', code: category.code } },
      create: {
        category: 'DRAWING_CATEGORY',
        code: category.code,
        label: category.label,
        displayOrder: category.order,
      },
      update: { label: category.label, displayOrder: category.order },
    });
  }

  for (const rule of SCRUTINY_RULES) {
    await prisma.scrutinyRule.upsert({
      where: { code: rule.code },
      create: { ...rule, reference: '' },
      update: {
        name: rule.name,
        category: rule.category,
        severity: rule.severity,
        description: rule.description,
        remedy: rule.remedy,
        // `reference` is NOT overwritten on update. If a department has filled
        // in a citation through the admin UI, re-running the seed must not
        // wipe it — that is the one field here that carries their authority
        // rather than ours.
      },
    });
  }

  return { rules: SCRUTINY_RULES.length, drawingCategories: DRAWING_CATEGORIES.length };
}
