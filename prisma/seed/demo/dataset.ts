/**
 * The vocabulary the demo environment is built from.
 *
 * Every name, firm and locality below is FICTIONAL. They are drawn to look
 * like the records a South-Indian planning office would hold, because a demo
 * populated with "Test User 1" teaches a reviewer nothing about whether the
 * columns are wide enough or whether the sort order reads correctly — but
 * none of it refers to a real person, a real firm or a real property.
 *
 * The districts and localities are real place names used as plausible
 * ADDRESSES ONLY. No survey number, plot number or applicant here corresponds
 * to any actual land record.
 */

export const FIRST_NAMES = [
  'Ravi', 'Priya', 'Anil', 'Meena', 'Suresh', 'Lakshmi', 'Vikram', 'Deepa',
  'Rajesh', 'Sunitha', 'Krishna', 'Padma', 'Naveen', 'Anitha', 'Srinivas',
  'Kavitha', 'Mahesh', 'Swathi', 'Ramesh', 'Bhavani', 'Gopal', 'Sridevi',
  'Prakash', 'Vasantha', 'Kiran', 'Jyothi', 'Venkat', 'Rohini', 'Sandeep',
  'Aruna', 'Harish', 'Nirmala', 'Chandra', 'Sarita', 'Murali', 'Indira',
] as const;

export const SURNAMES = [
  'Kumar', 'Sharma', 'Reddy', 'Iyer', 'Naidu', 'Rao', 'Singh', 'Menon',
  'Gupta', 'Varma', 'Chowdary', 'Prasad', 'Murthy', 'Sastry', 'Pillai',
  'Raju', 'Babu', 'Devi', 'Nair', 'Bhat', 'Acharya', 'Mohan',
] as const;

/** Districts used as plausible addresses. */
export const DISTRICTS = [
  { name: 'Guntur', mandals: ['Guntur East', 'Guntur West', 'Tadikonda', 'Mangalagiri'] },
  { name: 'Krishna', mandals: ['Vijayawada Rural', 'Penamaluru', 'Gannavaram', 'Ibrahimpatnam'] },
  { name: 'Visakhapatnam', mandals: ['Gajuwaka', 'Bheemunipatnam', 'Anandapuram', 'Pendurthi'] },
  { name: 'Nellore', mandals: ['Nellore Rural', 'Kovur', 'Muthukur', 'Venkatachalam'] },
  { name: 'Kurnool', mandals: ['Kurnool', 'Kallur', 'Orvakal', 'Gudur'] },
  { name: 'Anantapur', mandals: ['Anantapur', 'Rapthadu', 'Kuderu', 'Atmakur'] },
] as const;

export const LOCALITIES = [
  'Brodipet', 'Arundelpet', 'Lakshmipuram', 'Gorantla', 'Nallapadu',
  'Patamata', 'Benz Circle', 'Gunadala', 'Bhavanipuram', 'Auto Nagar',
  'MVP Colony', 'Seethammadhara', 'Madhurawada', 'Rushikonda',
  'Dargamitta', 'Magunta Layout', 'Balaji Nagar', 'Santhapet',
  'Ashok Nagar', 'Vidya Nagar', 'Shanti Nagar', 'Gandhi Nagar',
] as const;

export const STREETS = [
  'Main Road', '4th Line', '12th Cross Road', 'Temple Street', 'Market Road',
  'Ring Road Service Lane', 'Canal Road', 'School Street', 'Bank Street',
  'Housing Board Road', 'Nehru Street', 'Station Road',
] as const;

export const LAYOUTS = [
  'Sai Enclave', 'Green Meadows', 'Vasavi Township', 'Sree Gardens',
  'Lakeview Colony', 'Amaravati Heights', 'Sunrise Estates', 'Nandi Layout',
  'Pearl City Layout', 'Sarovar Enclave',
] as const;

export const FIRMS = [
  'Kumar & Associates', 'Skyline Design Studio', 'Aakriti Architects',
  'Vastu Consultants', 'Meridian Planners', 'Sthapati Design Works',
  'BluePrint Engineering', 'Nirman Consultancy', 'Axis Architects',
  'Prabhava Design Collective',
] as const;

/**
 * Building profiles. Each is internally coherent — a warehouse does not get
 * four dwelling units — because the fee engine and the document rules both
 * read these fields, and an incoherent profile produces a demand and a
 * checklist that make no sense together.
 */
export const BUILDING_PROFILES = [
  {
    key: 'INDIVIDUAL_HOUSE',
    buildingUse: 'DWELLING',
    buildingSubUse: 'Individual residence',
    occupancyType: 'A_RESIDENTIAL',
    structureType: 'RCC',
    landUseZone: 'RESIDENTIAL',
    floors: [1, 3] as const,
    basements: [0, 0] as const,
    units: [1, 2] as const,
    plotArea: [150, 500] as const,
    farTarget: [1.0, 1.8] as const,
  },
  {
    key: 'APARTMENT_BLOCK',
    buildingUse: 'APARTMENT',
    buildingSubUse: 'Multi-dwelling block',
    occupancyType: 'A_RESIDENTIAL',
    structureType: 'RCC',
    landUseZone: 'RESIDENTIAL',
    floors: [4, 9] as const,
    basements: [0, 2] as const,
    units: [8, 48] as const,
    plotArea: [800, 3000] as const,
    farTarget: [1.8, 2.8] as const,
  },
  {
    key: 'RETAIL_SHOP',
    buildingUse: 'SHOP',
    buildingSubUse: 'Retail premises',
    occupancyType: 'F_MERCANTILE',
    structureType: 'RCC',
    landUseZone: 'COMMERCIAL',
    floors: [1, 3] as const,
    basements: [0, 1] as const,
    units: [0, 0] as const,
    plotArea: [120, 700] as const,
    farTarget: [1.2, 2.2] as const,
  },
  {
    key: 'OFFICE_BLOCK',
    buildingUse: 'OFFICE',
    buildingSubUse: 'Commercial offices',
    occupancyType: 'E_BUSINESS',
    structureType: 'STEEL',
    landUseZone: 'COMMERCIAL',
    floors: [3, 8] as const,
    basements: [1, 2] as const,
    units: [0, 0] as const,
    plotArea: [600, 2500] as const,
    farTarget: [2.0, 3.0] as const,
  },
  {
    key: 'WAREHOUSE',
    buildingUse: 'WAREHOUSE',
    buildingSubUse: 'Storage godown',
    occupancyType: 'H_STORAGE',
    structureType: 'STEEL',
    landUseZone: 'INDUSTRIAL',
    floors: [1, 2] as const,
    basements: [0, 0] as const,
    units: [0, 0] as const,
    plotArea: [1000, 5000] as const,
    farTarget: [0.6, 1.2] as const,
  },
  {
    key: 'SCHOOL',
    buildingUse: 'SCHOOL',
    buildingSubUse: 'Primary and secondary school',
    occupancyType: 'B_EDUCATIONAL',
    structureType: 'RCC',
    landUseZone: 'INSTITUTIONAL',
    floors: [2, 4] as const,
    basements: [0, 0] as const,
    units: [0, 0] as const,
    plotArea: [1500, 6000] as const,
    farTarget: [0.8, 1.6] as const,
  },
] as const;

export type BuildingProfile = (typeof BUILDING_PROFILES)[number];

/** Remarks an officer would actually type. Keeps the history readable. */
export const FORWARD_REMARKS = [
  'Drawings and documents verified. Recommended for the next stage.',
  'Setbacks and coverage checked against the sanctioned plan. In order.',
  'Site particulars tally with the survey sketch. Forwarded.',
  'Technical scrutiny report reviewed. No adverse observations.',
  'Fee demand settled in full. Placed before the next authority.',
  'Land use conforms to the zoning of the area. Recommended.',
] as const;

export const APPROVAL_REMARKS = [
  'All statutory requirements satisfied. Permission accorded.',
  'Recommendations of the lower authorities accepted. Approved.',
  'No open shortfalls and fees realised in full. Sanctioned.',
] as const;

export const REJECTION_REMARKS = [
  'Proposed setbacks fall short of the prescribed minimum and cannot be regularised. Rejected.',
  'The plot abuts a road narrower than the width required for the proposed height. Rejected.',
] as const;

/**
 * Shortfall wordings, per kind. `action` is what the applicant must DO.
 *
 * Typed rather than `as const`: the four lists have different lengths, so
 * inference would give each one its own tuple type and `SHORTFALL_TEXT[kind]`
 * would be a union of tuples that nothing can be picked from uniformly. One
 * declared element type is what makes the four interchangeable at the call
 * site, which is the whole reason they are keyed by kind.
 */
export type ShortfallText = {
  title: string;
  /** What is wrong, in the officer's words. */
  description: string;
  /** What the applicant must do about it. This is the sentence that gets sent. */
  action: string;
};

export const SHORTFALL_TEXT: Record<
  'DOCUMENT' | 'FEE' | 'TECHNICAL' | 'CLARIFICATION',
  readonly ShortfallText[]
> = {
  DOCUMENT: [
    {
      title: 'Encumbrance certificate not current',
      description: 'The encumbrance certificate on record predates the transaction shown in the sale deed.',
      action: 'Upload an encumbrance certificate covering the last thirteen years, up to the current date.',
    },
    {
      title: 'Survey sketch illegible',
      description: 'The uploaded survey sketch is not legible and the boundaries cannot be read from it.',
      action: 'Upload a clear, authenticated survey sketch showing all four boundaries.',
    },
    {
      title: 'Property tax receipt missing',
      description: 'No property tax receipt for the current year has been placed on record.',
      action: 'Upload the latest property tax receipt for the plot.',
    },
  ],
  FEE: [
    {
      title: 'Differential development charges payable',
      description: 'The built-up area shown on the revised drawing exceeds the area on which the original demand was raised.',
      action: 'Pay the supplementary demand raised against this application.',
    },
    {
      title: 'Betterment charges short-collected',
      description: 'Betterment charges were computed on the earlier plot extent and fall short of the extent now declared.',
      action: 'Pay the supplementary demand raised against this application.',
    },
  ],
  TECHNICAL: [
    {
      title: 'Parking provision below requirement',
      description: 'The parking area shown falls short of the provision required for the proposed built-up area.',
      action: 'Revise the drawing to show the required parking provision and upload the corrected version.',
    },
    {
      title: 'Staircase width insufficient',
      description: 'The staircase width shown on the floor plan is below the minimum for the proposed occupancy.',
      action: 'Revise the staircase detail on the floor plan and upload the corrected drawing.',
    },
  ],
  CLARIFICATION: [
    {
      title: 'Clarification on plot extent',
      description: 'The plot extent in the application differs from the extent shown on the survey sketch.',
      action: 'Confirm the correct plot extent and place the supporting record on file.',
    },
  ],
};

export const RESOLUTION_TEXT = [
  'The requested record has been uploaded against this application.',
  'Corrected drawing and the supporting document have been placed on file.',
  'The supplementary demand has been paid and the receipt is on record.',
] as const;

export const ACCEPT_REMARKS = [
  'Response verified and found in order. Shortfall closed.',
  'The document supplied answers the observation. Proceeding.',
] as const;
