/**
 * What the shortfall endpoints return, as the client sees it.
 *
 * Dates are ISO strings and money is a string, because that is what
 * `serialize()` puts on the wire. A shared type that claimed `Date` here would
 * be a type that lies at exactly the boundary types are for.
 */

export type ShortfallItem = {
  id: string;
  description: string;
  amount: string | null;
  isResolved: boolean;
  documentTypeId: string | null;
  documentTypeCode: string;
  documentTypeName: string;
};

export type ShortfallResolution = {
  id: string;
  attemptNo: number;
  response: string;
  attachments: Array<{ fileObjectId?: string; name?: string; note?: string }>;
  respondedAt: string;
  respondedByName: string;
  reviewedAt: string | null;
  reviewedByName: string;
  accepted: boolean | null;
  reviewRemarks: string;
};

export type ShortfallDemand = {
  id: string;
  demandNumber: string;
  status: string;
  totalAmount: string;
  paidAmount: string;
};

export type ShortfallRow = {
  id: string;
  shortfallNumber: string;
  kind: string;
  mode: string;
  status: string;
  turn: 'APPLICANT' | 'OFFICER' | 'SYSTEM' | 'NOBODY';
  title: string;
  description: string;
  requiredAction: string;
  raisedAtStageCode: string;
  raisedByRoleKey: string;
  raisedByName: string;
  raisedAt: string;
  dueDate: string | null;
  notifiedAt: string | null;
  closedAt: string | null;
  itemCount: number;
  attempts: number;
  amount: number;
  application: {
    id: string;
    applicationNumber: string;
    status: string;
    currentStageCode: string | null;
    applicantName: string;
    type: string;
    zone: string;
  };
  demands: ShortfallDemand[];
};

export type ShortfallDetail = ShortfallRow & {
  closedByName: string;
  closureRemarks: string;
  items: ShortfallItem[];
  resolutions: ShortfallResolution[];
};

export type ShortfallListPayload = {
  rows: ShortfallRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  counts: Record<string, number>;
  isApplicant: boolean;
  summary?: {
    open: number;
    awaitingApplicant: number;
    awaitingOfficer: number;
    overdue: number;
  };
};

export type ShortfallActionResult = {
  shortfallId: string;
  shortfallNumber: string;
  status: string;
  movedTo: string | null;
  message: string;
};

export type UploadedAttachment = {
  fileObjectId: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  scanStatus: string;
};
