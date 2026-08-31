-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'DRAWING_UPLOADED', 'SCRUTINY_IN_PROGRESS', 'SCRUTINY_FAILED', 'SCRUTINY_PASSED', 'DOCUMENT_UPLOAD_PENDING', 'DOCUMENTS_COMPLETED', 'FEE_GENERATED', 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'PAYMENT_SUCCESSFUL', 'SUBMITTED', 'PENDING_TPA', 'TPA_REVIEW', 'TPA_DOCUMENT_SHORTFALL', 'TPA_FEE_SHORTFALL', 'TPA_TECHNICAL_SHORTFALL', 'PENDING_ZAD_ZDD', 'ZAD_ZDD_REVIEW', 'ZAD_ZDD_SHORTFALL', 'PENDING_ZJD', 'ZJD_REVIEW', 'ZJD_SHORTFALL', 'ZJD_FEE_SHORTFALL', 'PENDING_DIRECTOR_DP', 'DIRECTOR_REVIEW', 'DIRECTOR_SHORTFALL', 'DIRECTOR_REPORTED_SHORTFALL', 'PENDING_ADDITIONAL_COMMISSIONER', 'ADDITIONAL_COMMISSIONER_REVIEW', 'ADDITIONAL_COMMISSIONER_SHORTFALL', 'PENDING_COMMISSIONER', 'COMMISSIONER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'LAPSED');

-- CreateEnum
CREATE TYPE "StageType" AS ENUM ('LTP_ACTION', 'REVIEW', 'APPROVAL', 'TERMINAL');

-- CreateEnum
CREATE TYPE "ActionKind" AS ENUM ('FORWARD', 'RETURN', 'REPORT_AND_FORWARD', 'APPROVE', 'REJECT', 'RESUBMIT', 'CLARIFY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "WorkflowInstanceStatus" AS ENUM ('ACTIVE', 'PARKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REASSIGNED');

-- CreateEnum
CREATE TYPE "ScrutinyStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'ERRORED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScrutinyOutcome" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('CRITICAL', 'MAJOR', 'MINOR', 'INFO');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('NOT_UPLOADED', 'UPLOADED', 'UNDER_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "FeeDemandType" AS ENUM ('ORIGINAL', 'SHORTFALL', 'REVISION');

-- CreateEnum
CREATE TYPE "FeeDemandStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'WAIVED');

-- CreateEnum
CREATE TYPE "CalculationBasis" AS ENUM ('FLAT', 'PER_UNIT_AREA', 'SLAB', 'PERCENTAGE', 'FORMULA');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ShortfallKind" AS ENUM ('DOCUMENT', 'FEE', 'TECHNICAL', 'CLARIFICATION');

-- CreateEnum
CREATE TYPE "ShortfallStatus" AS ENUM ('OPEN', 'RESPONDED', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShortfallMode" AS ENUM ('BLOCKING', 'REPORTED');

-- CreateEnum
CREATE TYPE "SlaStatus" AS ENUM ('ON_TRACK', 'DUE_SOON', 'OVERDUE', 'COMPLETED', 'PAUSED');

-- CreateEnum
CREATE TYPE "SlaCalendar" AS ENUM ('CALENDAR_DAYS', 'WORKING_DAYS');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'ISSUED', 'REVOKED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "SettingType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateEnum
CREATE TYPE "ApplicationPurpose" AS ENUM ('NEW', 'REVISION', 'RENEWAL', 'REVALIDATION');

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" UUID,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT NOT NULL DEFAULT '',
    "employeeCode" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "departmentId" UUID,
    "officeId" UUID,
    "primaryZoneId" UUID,
    "ltpLicenceNo" TEXT,
    "ltpLicenceClass" TEXT,
    "ltpValidUpto" TIMESTAMP(3),
    "firmName" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteUntil" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestIp" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offices" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" UUID,
    "zoneId" UUID,
    "address" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_jurisdictions" (
    "userId" UUID NOT NULL,
    "zoneId" UUID NOT NULL,

    CONSTRAINT "user_jurisdictions_pkey" PRIMARY KEY ("userId","zoneId")
);

-- CreateTable
CREATE TABLE "application_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "workflowId" UUID NOT NULL,
    "numberPrefix" TEXT NOT NULL DEFAULT 'BP',
    "requiresScrutiny" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "application_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "applicationNumber" TEXT NOT NULL,
    "applicationTypeId" UUID NOT NULL,
    "ltpUserId" UUID NOT NULL,
    "zoneId" UUID,
    "officeId" UUID,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "parentApplicationId" UUID,
    "purpose" "ApplicationPurpose" NOT NULL DEFAULT 'NEW',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "currentStageId" UUID,
    "currentStageCode" TEXT,
    "slaDueAt" TIMESTAMP(3),
    "slaStatus" "SlaStatus",
    "openShortfalls" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applicants" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fatherName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL,
    "aadhaarLast4" TEXT NOT NULL DEFAULT '',
    "panMasked" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "ownerSameAsApplicant" BOOLEAN NOT NULL DEFAULT true,
    "ownerName" TEXT NOT NULL DEFAULT '',
    "ownerPhone" TEXT NOT NULL DEFAULT '',
    "ownerAddress" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applicants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_details" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "district" TEXT NOT NULL,
    "mandal" TEXT NOT NULL DEFAULT '',
    "village" TEXT NOT NULL DEFAULT '',
    "localityName" TEXT NOT NULL DEFAULT '',
    "wardNo" TEXT NOT NULL DEFAULT '',
    "streetName" TEXT NOT NULL DEFAULT '',
    "doorNo" TEXT NOT NULL DEFAULT '',
    "pincode" TEXT NOT NULL DEFAULT '',
    "surveyNumbers" TEXT NOT NULL,
    "plotNo" TEXT NOT NULL DEFAULT '',
    "layoutName" TEXT NOT NULL DEFAULT '',
    "lpNumber" TEXT NOT NULL DEFAULT '',
    "plotAreaSqm" DOUBLE PRECISION NOT NULL,
    "roadWidthM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "landUseZone" TEXT NOT NULL DEFAULT '',
    "tenureType" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "boundaryNorth" TEXT NOT NULL DEFAULT '',
    "boundarySouth" TEXT NOT NULL DEFAULT '',
    "boundaryEast" TEXT NOT NULL DEFAULT '',
    "boundaryWest" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building_details" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "buildingUse" TEXT NOT NULL DEFAULT '',
    "buildingSubUse" TEXT NOT NULL DEFAULT '',
    "occupancyType" TEXT NOT NULL DEFAULT '',
    "structureType" TEXT NOT NULL DEFAULT '',
    "numFloors" INTEGER NOT NULL DEFAULT 0,
    "numBasements" INTEGER NOT NULL DEFAULT 0,
    "numDwellingUnits" INTEGER NOT NULL DEFAULT 0,
    "buildingHeightM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plotAreaSqm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "builtUpAreaSqm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "floorAreaSqm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "coverageAreaSqm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "parkingAreaSqm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "achievedFar" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "achievedCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "setbackFrontM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "setbackRearM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "setbackLeftM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "setbackRightM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "building_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_objects" (
    "id" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT '',
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL DEFAULT '',
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "scanDetail" TEXT NOT NULL DEFAULT '',
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawings" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "discipline" TEXT NOT NULL DEFAULT 'ARCHITECTURAL',
    "title" TEXT NOT NULL DEFAULT 'Building Drawing',
    "currentVersionNo" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drawings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawing_versions" (
    "id" UUID NOT NULL,
    "drawingId" UUID NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "uploadedById" UUID NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "drawing_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrutiny_rules" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "severity" "IssueSeverity" NOT NULL DEFAULT 'MAJOR',
    "description" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scrutiny_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrutiny_requests" (
    "id" UUID NOT NULL,
    "drawingVersionId" UUID NOT NULL,
    "engineDriver" TEXT NOT NULL DEFAULT 'mock',
    "externalRef" TEXT,
    "status" "ScrutinyStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "requestedById" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "scrutiny_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrutiny_results" (
    "id" UUID NOT NULL,
    "scrutinyRequestId" UUID NOT NULL,
    "outcome" "ScrutinyOutcome" NOT NULL,
    "criticalCount" INTEGER NOT NULL DEFAULT 0,
    "majorCount" INTEGER NOT NULL DEFAULT 0,
    "minorCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL DEFAULT '',
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrutiny_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrutiny_issues" (
    "id" UUID NOT NULL,
    "scrutinyResultId" UUID NOT NULL,
    "ruleId" UUID,
    "ruleCode" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "expectedValue" TEXT NOT NULL DEFAULT '',
    "actualValue" TEXT NOT NULL DEFAULT '',
    "layer" TEXT NOT NULL DEFAULT '',
    "locationHint" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "scrutiny_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrutiny_reports" (
    "id" UUID NOT NULL,
    "scrutinyResultId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrutiny_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "allowedMime" TEXT[] DEFAULT ARRAY['application/pdf']::TEXT[],
    "maxSizeMb" INTEGER NOT NULL DEFAULT 10,
    "requiresExpiry" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requirements" (
    "id" UUID NOT NULL,
    "applicationTypeId" UUID,
    "documentTypeId" UUID NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "condition" JSONB NOT NULL DEFAULT '{}',
    "stageCode" TEXT NOT NULL DEFAULT 'DOCUMENT_UPLOAD',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "helpText" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_documents" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "documentTypeId" UUID NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'NOT_UPLOADED',
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "currentVersionNo" INTEGER NOT NULL DEFAULT 0,
    "shortfallItemId" UUID,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "verifyRemarks" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "applicationDocumentId" UUID NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "remarks" TEXT NOT NULL DEFAULT '',
    "expiresOn" TIMESTAMP(3),
    "uploadedById" UUID NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "applicationTypeId" UUID,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "roundingRule" TEXT NOT NULL DEFAULT 'NEAREST_1',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_components" (
    "id" UUID NOT NULL,
    "feeStructureId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headOfAccount" TEXT NOT NULL DEFAULT '',
    "basis" "CalculationBasis" NOT NULL,
    "rate" DECIMAL(18,4),
    "variable" TEXT NOT NULL DEFAULT '',
    "percentOfCode" TEXT NOT NULL DEFAULT '',
    "expression" TEXT NOT NULL DEFAULT '',
    "minAmount" DECIMAL(18,2),
    "maxAmount" DECIMAL(18,2),
    "condition" JSONB NOT NULL DEFAULT '{}',
    "isRefundable" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "fee_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_slabs" (
    "id" UUID NOT NULL,
    "feeComponentId" UUID NOT NULL,
    "fromValue" DECIMAL(18,4) NOT NULL,
    "toValue" DECIMAL(18,4),
    "rate" DECIMAL(18,4) NOT NULL,
    "flatAmount" DECIMAL(18,2),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fee_slabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_fees" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "demandNumber" TEXT NOT NULL,
    "type" "FeeDemandType" NOT NULL DEFAULT 'ORIGINAL',
    "status" "FeeDemandStatus" NOT NULL DEFAULT 'DRAFT',
    "feeStructureId" UUID NOT NULL,
    "feeStructureVersion" INTEGER NOT NULL,
    "calculationInputs" JSONB NOT NULL DEFAULT '{}',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "raisedByShortfallId" UUID,
    "dueDate" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_line_items" (
    "id" UUID NOT NULL,
    "applicationFeeId" UUID NOT NULL,
    "feeComponentId" UUID,
    "componentCode" TEXT NOT NULL,
    "componentName" TEXT NOT NULL,
    "headOfAccount" TEXT NOT NULL DEFAULT '',
    "basis" TEXT NOT NULL,
    "variableName" TEXT NOT NULL DEFAULT '',
    "variableValue" DECIMAL(18,4),
    "rateApplied" DECIMAL(18,4),
    "computedAmount" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "calculationNote" TEXT NOT NULL DEFAULT '',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fee_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "applicationFeeId" UUID NOT NULL,
    "paymentRef" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "initiatedById" UUID NOT NULL,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "failureReason" TEXT NOT NULL DEFAULT '',
    "settlementLockAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "direction" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "gatewayTxnId" TEXT,
    "bankRef" TEXT NOT NULL DEFAULT '',
    "method" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,2),
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "message" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "paymentId" UUID,
    "signatureOk" BOOLEAN NOT NULL DEFAULT false,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_receipts" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storageKey" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "externalRef" TEXT,
    "requestedById" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_stages" (
    "id" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StageType" NOT NULL DEFAULT 'REVIEW',
    "sequence" INTEGER NOT NULL,
    "ownerRoleKeys" TEXT[],
    "entryStatus" "ApplicationStatus" NOT NULL,
    "workingStatus" "ApplicationStatus",
    "slaDays" INTEGER NOT NULL DEFAULT 0,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "allowReassign" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "workflow_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_actions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "ActionKind" NOT NULL,
    "intent" TEXT NOT NULL DEFAULT 'secondary',
    "requiresRemarks" BOOLEAN NOT NULL DEFAULT true,
    "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,
    "confirmText" TEXT NOT NULL DEFAULT '',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "workflow_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_transitions" (
    "id" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "fromStageId" UUID NOT NULL,
    "actionId" UUID NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStageId" UUID,
    "toStatus" "ApplicationStatus" NOT NULL,
    "allowedRoleKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "guards" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "effects" JSONB NOT NULL DEFAULT '[]',
    "notifyEvent" TEXT NOT NULL DEFAULT '',
    "slaBehavior" TEXT NOT NULL DEFAULT 'START',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_instances" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "workflowVersion" INTEGER NOT NULL,
    "currentStageId" UUID,
    "status" "WorkflowInstanceStatus" NOT NULL DEFAULT 'ACTIVE',
    "parkedStageId" UUID,
    "parkedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_tasks" (
    "id" UUID NOT NULL,
    "instanceId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "assignedRoleKey" TEXT NOT NULL,
    "assignedUserId" UUID,
    "zoneId" UUID,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" UUID,
    "actionTaken" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "workflow_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_history" (
    "id" UUID NOT NULL,
    "instanceId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "fromStageCode" TEXT NOT NULL DEFAULT '',
    "toStageCode" TEXT NOT NULL DEFAULT '',
    "fromStatus" TEXT NOT NULL DEFAULT '',
    "toStatus" TEXT NOT NULL DEFAULT '',
    "actionCode" TEXT NOT NULL,
    "actionLabel" TEXT NOT NULL DEFAULT '',
    "actorId" UUID NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRoleKey" TEXT NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "effectsApplied" JSONB NOT NULL DEFAULT '[]',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortfalls" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "shortfallNumber" TEXT NOT NULL,
    "kind" "ShortfallKind" NOT NULL,
    "mode" "ShortfallMode" NOT NULL DEFAULT 'BLOCKING',
    "status" "ShortfallStatus" NOT NULL DEFAULT 'OPEN',
    "raisedAtStageCode" TEXT NOT NULL,
    "raisedById" UUID NOT NULL,
    "raisedByRoleKey" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "historyId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedById" UUID,
    "closureRemarks" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "shortfalls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortfall_items" (
    "id" UUID NOT NULL,
    "shortfallId" UUID NOT NULL,
    "documentTypeId" UUID,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shortfall_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortfall_resolutions" (
    "id" UUID NOT NULL,
    "shortfallId" UUID NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "respondedById" UUID NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "accepted" BOOLEAN,
    "reviewRemarks" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "shortfall_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_rules" (
    "id" UUID NOT NULL,
    "workflowStageId" UUID NOT NULL,
    "applicationTypeId" UUID,
    "days" INTEGER NOT NULL,
    "calendar" "SlaCalendar" NOT NULL DEFAULT 'WORKING_DAYS',
    "warnAtPercent" INTEGER NOT NULL DEFAULT 70,
    "escalateToRoleKey" TEXT,
    "pauseOnShortfall" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_instances" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "ruleId" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "pausedAt" TIMESTAMP(3),
    "pausedMs" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "status" "SlaStatus" NOT NULL DEFAULT 'ON_TRACK',
    "overdueAt" TIMESTAMP(3),
    "overdueDays" INTEGER NOT NULL DEFAULT 0,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "sla_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "zoneId" UUID,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "eventCode" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "providerTemplateId" TEXT NOT NULL DEFAULT '',
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "applicationId" UUID,
    "eventCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT NOT NULL DEFAULT '',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "templateId" UUID,
    "eventCode" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipientUserId" UUID,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL DEFAULT '',
    "providerRef" TEXT NOT NULL DEFAULT '',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "userId" UUID NOT NULL,
    "eventCode" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId","eventCode","channel")
);

-- CreateTable
CREATE TABLE "approval_orders" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedById" UUID NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "storageKey" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "verificationCode" TEXT NOT NULL,
    "signatureRef" TEXT NOT NULL DEFAULT '',
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "approval_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorName" TEXT NOT NULL DEFAULT '',
    "actorRoleKey" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "applicationId" UUID,
    "before" JSONB,
    "after" JSONB,
    "remarks" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "correlationId" TEXT NOT NULL DEFAULT '',
    "prevHash" TEXT NOT NULL DEFAULT '',
    "rowHash" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" "SettingType" NOT NULL DEFAULT 'STRING',
    "group" TEXT NOT NULL DEFAULT 'general',
    "label" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data" (
    "id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "parentCode" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "eventCode" TEXT NOT NULL,
    "applicationId" UUID,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "dedupeKey" TEXT,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeCode_key" ON "users"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "users_ltpLicenceNo_key" ON "users"("ltpLicenceNo");

-- CreateIndex
CREATE INDEX "users_status_deletedAt_idx" ON "users"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "users_officeId_idx" ON "users"("officeId");

-- CreateIndex
CREATE INDEX "users_primaryZoneId_idx" ON "users"("primaryZoneId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_tokenHash_key" ON "password_resets"("tokenHash");

-- CreateIndex
CREATE INDEX "password_resets_userId_idx" ON "password_resets"("userId");

-- CreateIndex
CREATE INDEX "login_attempts_email_createdAt_idx" ON "login_attempts"("email", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_ip_createdAt_idx" ON "login_attempts"("ip", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "zones_code_key" ON "zones"("code");

-- CreateIndex
CREATE UNIQUE INDEX "offices_code_key" ON "offices"("code");

-- CreateIndex
CREATE INDEX "offices_zoneId_idx" ON "offices"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "application_types_code_key" ON "application_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "applications_applicationNumber_key" ON "applications"("applicationNumber");

-- CreateIndex
CREATE INDEX "applications_ltpUserId_status_idx" ON "applications"("ltpUserId", "status");

-- CreateIndex
CREATE INDEX "applications_status_updatedAt_idx" ON "applications"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "applications_zoneId_status_idx" ON "applications"("zoneId", "status");

-- CreateIndex
CREATE INDEX "applications_currentStageCode_slaStatus_idx" ON "applications"("currentStageCode", "slaStatus");

-- CreateIndex
CREATE INDEX "applications_applicationTypeId_idx" ON "applications"("applicationTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "applicants_applicationId_key" ON "applicants"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "property_details_applicationId_key" ON "property_details"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "building_details_applicationId_key" ON "building_details"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequences_scope_key" ON "number_sequences"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "file_objects_storageKey_key" ON "file_objects"("storageKey");

-- CreateIndex
CREATE INDEX "file_objects_scanStatus_idx" ON "file_objects"("scanStatus");

-- CreateIndex
CREATE INDEX "drawings_applicationId_idx" ON "drawings"("applicationId");

-- CreateIndex
CREATE INDEX "drawing_versions_drawingId_isActive_idx" ON "drawing_versions"("drawingId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "drawing_versions_drawingId_versionNo_key" ON "drawing_versions"("drawingId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "scrutiny_rules_code_key" ON "scrutiny_rules"("code");

-- CreateIndex
CREATE INDEX "scrutiny_requests_status_idx" ON "scrutiny_requests"("status");

-- CreateIndex
CREATE INDEX "scrutiny_requests_drawingVersionId_idx" ON "scrutiny_requests"("drawingVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "scrutiny_results_scrutinyRequestId_key" ON "scrutiny_results"("scrutinyRequestId");

-- CreateIndex
CREATE INDEX "scrutiny_issues_scrutinyResultId_severity_idx" ON "scrutiny_issues"("scrutinyResultId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "scrutiny_reports_scrutinyResultId_key" ON "scrutiny_reports"("scrutinyResultId");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_code_key" ON "document_types"("code");

-- CreateIndex
CREATE INDEX "document_requirements_applicationTypeId_isActive_idx" ON "document_requirements"("applicationTypeId", "isActive");

-- CreateIndex
CREATE INDEX "application_documents_applicationId_status_idx" ON "application_documents"("applicationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "application_documents_applicationId_documentTypeId_key" ON "application_documents"("applicationId", "documentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_applicationDocumentId_versionNo_key" ON "document_versions"("applicationDocumentId", "versionNo");

-- CreateIndex
CREATE INDEX "fee_structures_applicationTypeId_isActive_effectiveFrom_idx" ON "fee_structures"("applicationTypeId", "isActive", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_code_version_key" ON "fee_structures"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "fee_components_feeStructureId_code_key" ON "fee_components"("feeStructureId", "code");

-- CreateIndex
CREATE INDEX "fee_slabs_feeComponentId_fromValue_idx" ON "fee_slabs"("feeComponentId", "fromValue");

-- CreateIndex
CREATE UNIQUE INDEX "application_fees_demandNumber_key" ON "application_fees"("demandNumber");

-- CreateIndex
CREATE INDEX "application_fees_applicationId_status_idx" ON "application_fees"("applicationId", "status");

-- CreateIndex
CREATE INDEX "fee_line_items_applicationFeeId_idx" ON "fee_line_items"("applicationFeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_paymentRef_key" ON "payments"("paymentRef");

-- CreateIndex
CREATE INDEX "payments_applicationFeeId_status_idx" ON "payments"("applicationFeeId", "status");

-- CreateIndex
CREATE INDEX "payments_status_initiatedAt_idx" ON "payments"("status", "initiatedAt");

-- CreateIndex
CREATE INDEX "payment_transactions_paymentId_occurredAt_idx" ON "payment_transactions"("paymentId", "occurredAt");

-- CreateIndex
CREATE INDEX "payment_transactions_gatewayTxnId_idx" ON "payment_transactions"("gatewayTxnId");

-- CreateIndex
CREATE INDEX "payment_webhook_events_processed_receivedAt_idx" ON "payment_webhook_events"("processed", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_externalId_key" ON "payment_webhook_events"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipts_paymentId_key" ON "payment_receipts"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipts_receiptNumber_key" ON "payment_receipts"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "workflows_code_version_key" ON "workflows"("code", "version");

-- CreateIndex
CREATE INDEX "workflow_stages_workflowId_sequence_idx" ON "workflow_stages"("workflowId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_stages_workflowId_code_key" ON "workflow_stages"("workflowId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_actions_code_key" ON "workflow_actions"("code");

-- CreateIndex
CREATE INDEX "workflow_transitions_workflowId_fromStageId_idx" ON "workflow_transitions"("workflowId", "fromStageId");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_transitions_workflowId_fromStageId_actionId_fromSt_key" ON "workflow_transitions"("workflowId", "fromStageId", "actionId", "fromStatus");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_instances_applicationId_key" ON "workflow_instances"("applicationId");

-- CreateIndex
CREATE INDEX "workflow_tasks_assignedRoleKey_status_idx" ON "workflow_tasks"("assignedRoleKey", "status");

-- CreateIndex
CREATE INDEX "workflow_tasks_assignedUserId_status_idx" ON "workflow_tasks"("assignedUserId", "status");

-- CreateIndex
CREATE INDEX "workflow_tasks_instanceId_status_idx" ON "workflow_tasks"("instanceId", "status");

-- CreateIndex
CREATE INDEX "workflow_history_instanceId_occurredAt_idx" ON "workflow_history"("instanceId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_history_instanceId_sequence_key" ON "workflow_history"("instanceId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "shortfalls_shortfallNumber_key" ON "shortfalls"("shortfallNumber");

-- CreateIndex
CREATE INDEX "shortfalls_applicationId_status_idx" ON "shortfalls"("applicationId", "status");

-- CreateIndex
CREATE INDEX "shortfalls_status_mode_idx" ON "shortfalls"("status", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "shortfall_resolutions_shortfallId_attemptNo_key" ON "shortfall_resolutions"("shortfallId", "attemptNo");

-- CreateIndex
CREATE UNIQUE INDEX "sla_rules_workflowStageId_applicationTypeId_key" ON "sla_rules"("workflowStageId", "applicationTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "sla_instances_taskId_key" ON "sla_instances"("taskId");

-- CreateIndex
CREATE INDEX "sla_instances_status_dueAt_idx" ON "sla_instances"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_eventCode_channel_locale_key" ON "notification_templates"("eventCode", "channel", "locale");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "notification_logs_eventCode_createdAt_idx" ON "notification_logs"("eventCode", "createdAt");

-- CreateIndex
CREATE INDEX "notification_logs_status_attempts_idx" ON "notification_logs"("status", "attempts");

-- CreateIndex
CREATE UNIQUE INDEX "approval_orders_applicationId_key" ON "approval_orders"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_orders_orderNumber_key" ON "approval_orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "approval_orders_verificationCode_key" ON "approval_orders"("verificationCode");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_applicationId_occurredAt_idx" ON "audit_logs"("applicationId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_occurredAt_idx" ON "audit_logs"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_occurredAt_idx" ON "audit_logs"("action", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_occurredAt_idx" ON "audit_logs"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "system_settings_group_idx" ON "system_settings"("group");

-- CreateIndex
CREATE INDEX "master_data_category_isActive_idx" ON "master_data"("category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "master_data_category_code_key" ON "master_data"("category", "code");

-- CreateIndex
CREATE INDEX "outbox_events_processed_createdAt_idx" ON "outbox_events"("processed", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_dedupeKey_key" ON "jobs"("dedupeKey");

-- CreateIndex
CREATE INDEX "jobs_status_runAt_idx" ON "jobs"("status", "runAt");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_primaryZoneId_fkey" FOREIGN KEY ("primaryZoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offices" ADD CONSTRAINT "offices_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offices" ADD CONSTRAINT "offices_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_jurisdictions" ADD CONSTRAINT "user_jurisdictions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_jurisdictions" ADD CONSTRAINT "user_jurisdictions_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_types" ADD CONSTRAINT "application_types_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_applicationTypeId_fkey" FOREIGN KEY ("applicationTypeId") REFERENCES "application_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_ltpUserId_fkey" FOREIGN KEY ("ltpUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_parentApplicationId_fkey" FOREIGN KEY ("parentApplicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_details" ADD CONSTRAINT "property_details_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_details" ADD CONSTRAINT "building_details_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_versions" ADD CONSTRAINT "drawing_versions_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "drawings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_versions" ADD CONSTRAINT "drawing_versions_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrutiny_requests" ADD CONSTRAINT "scrutiny_requests_drawingVersionId_fkey" FOREIGN KEY ("drawingVersionId") REFERENCES "drawing_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrutiny_results" ADD CONSTRAINT "scrutiny_results_scrutinyRequestId_fkey" FOREIGN KEY ("scrutinyRequestId") REFERENCES "scrutiny_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrutiny_issues" ADD CONSTRAINT "scrutiny_issues_scrutinyResultId_fkey" FOREIGN KEY ("scrutinyResultId") REFERENCES "scrutiny_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrutiny_issues" ADD CONSTRAINT "scrutiny_issues_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "scrutiny_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrutiny_reports" ADD CONSTRAINT "scrutiny_reports_scrutinyResultId_fkey" FOREIGN KEY ("scrutinyResultId") REFERENCES "scrutiny_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_applicationTypeId_fkey" FOREIGN KEY ("applicationTypeId") REFERENCES "application_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_applicationDocumentId_fkey" FOREIGN KEY ("applicationDocumentId") REFERENCES "application_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_applicationTypeId_fkey" FOREIGN KEY ("applicationTypeId") REFERENCES "application_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_components" ADD CONSTRAINT "fee_components_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "fee_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_slabs" ADD CONSTRAINT "fee_slabs_feeComponentId_fkey" FOREIGN KEY ("feeComponentId") REFERENCES "fee_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_fees" ADD CONSTRAINT "application_fees_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_fees" ADD CONSTRAINT "application_fees_raisedByShortfallId_fkey" FOREIGN KEY ("raisedByShortfallId") REFERENCES "shortfalls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_line_items" ADD CONSTRAINT "fee_line_items_applicationFeeId_fkey" FOREIGN KEY ("applicationFeeId") REFERENCES "application_fees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_line_items" ADD CONSTRAINT "fee_line_items_feeComponentId_fkey" FOREIGN KEY ("feeComponentId") REFERENCES "fee_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_applicationFeeId_fkey" FOREIGN KEY ("applicationFeeId") REFERENCES "application_fees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "workflow_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "workflow_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "workflow_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "workflow_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_history" ADD CONSTRAINT "workflow_history_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortfalls" ADD CONSTRAINT "shortfalls_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortfalls" ADD CONSTRAINT "shortfalls_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "workflow_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortfall_items" ADD CONSTRAINT "shortfall_items_shortfallId_fkey" FOREIGN KEY ("shortfallId") REFERENCES "shortfalls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortfall_items" ADD CONSTRAINT "shortfall_items_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortfall_resolutions" ADD CONSTRAINT "shortfall_resolutions_shortfallId_fkey" FOREIGN KEY ("shortfallId") REFERENCES "shortfalls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_rules" ADD CONSTRAINT "sla_rules_workflowStageId_fkey" FOREIGN KEY ("workflowStageId") REFERENCES "workflow_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_rules" ADD CONSTRAINT "sla_rules_applicationTypeId_fkey" FOREIGN KEY ("applicationTypeId") REFERENCES "application_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_instances" ADD CONSTRAINT "sla_instances_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_orders" ADD CONSTRAINT "approval_orders_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
