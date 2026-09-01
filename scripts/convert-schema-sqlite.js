const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

// 1. Update datasource
schema = schema.replace(
  /datasource db \{[\s\S]*?\}/,
  `datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}`
);

// 2. Remove all enum blocks
const enums = [
  'UserStatus',
  'ApplicationStatus',
  'StageType',
  'ActionKind',
  'WorkflowInstanceStatus',
  'TaskStatus',
  'AssignmentStrategy',
  'ScrutinyStatus',
  'ScrutinyOutcome',
  'IssueSeverity',
  'DocumentStatus',
  'ScanStatus',
  'FeeDemandType',
  'FeeDemandStatus',
  'CalculationBasis',
  'FeeAdjustmentKind',
  'PaymentStatus',
  'RefundStatus',
  'ShortfallKind',
  'ShortfallStatus',
  'ShortfallMode',
  'SlaStatus',
  'SlaCalendar',
  'NotificationChannel',
  'DeliveryStatus',
  'OrderStatus',
  'JobStatus',
  'SettingType',
  'ApplicationPurpose',
];

for (const e of enums) {
  const enumRegex = new RegExp(`enum\\s+${e}\\s+\\{[\\s\\S]*?\\}`, 'g');
  schema = schema.replace(enumRegex, '');
}

// 3. Remove @db.Uuid and other unsupported native types
schema = schema.replace(/@db\.Uuid/g, '');
schema = schema.replace(/@db\.Date/g, '');
schema = schema.replace(/@db\.Decimal\([^)]*\)/g, '');

// 4. Replace @default(uuid(7)) with @default(uuid())
schema = schema.replace(/@default\(uuid\(7\)\)/g, '@default(uuid())');

// 5. Replace Decimal with Float
schema = schema.replace(/\bDecimal\b/g, 'Float');

// 6. Replace String[] list types with Json for SQLite
schema = schema.replace(/allowedMime\s+String\[\]\s+@default\(\["application\/pdf"\]\)/g, "allowedMime Json @default(dbgenerated(\"'[\\\"application/pdf\\\"]'\"))");
schema = schema.replace(/allowedExtensions\s+String\[\]\s+@default\(\["pdf"\]\)/g, "allowedExtensions Json @default(dbgenerated(\"'[\\\"pdf\\\"]'\"))");
schema = schema.replace(/ownerRoleKeys\s+String\[\]/g, 'ownerRoleKeys Json');
schema = schema.replace(/allowedRoleKeys\s+String\[\]\s+@default\(\[\]\)/g, "allowedRoleKeys Json @default(dbgenerated(\"'[]'\"))");
schema = schema.replace(/guards\s+String\[\]\s+@default\(\[\]\)/g, "guards Json @default(dbgenerated(\"'[]'\"))");
schema = schema.replace(/variables\s+String\[\]\s+@default\(\[\]\)/g, "variables Json @default(dbgenerated(\"'[]'\"))");
schema = schema.replace(/completedSteps\s+String\[\]\s+@default\(\[\]\)/g, "completedSteps Json @default(dbgenerated(\"'[]'\"))");

// Replace remaining String[]
schema = schema.replace(/String\[\]/g, 'Json');

// 7. Fix JSON defaults for SQLite
schema = schema.replace(/@default\("\{}"\)/g, " @default(dbgenerated(\"'{}'\"))");
schema = schema.replace(/@default\("\[]"\)/g, " @default(dbgenerated(\"'[]'\"))");

// 8. Replace enum field types with String and fix defaults
for (const e of enums) {
  const fieldRegex = new RegExp(`(\\b\\w+\\s+)${e}(\\??)(\\s+@default\\((\\w+)\\))?`, 'g');
  schema = schema.replace(fieldRegex, (match, prefix, optional, defaultClause, defaultValue) => {
    let res = `${prefix}String${optional || ''}`;
    if (defaultValue) {
      res += ` @default("${defaultValue}")`;
    } else if (defaultClause) {
      res += defaultClause;
    }
    return res;
  });
}

// 9. Fix AuditLog in SQLite
schema = schema.replace(
  /model AuditLog \{[\s\S]*?@@map\("audit_logs"\)\s*\}/,
  (match) => {
    let m = match.replace(/id\s+String\s+@id\s+@default\(uuid\(\)\)/, 'id Int @id @default(autoincrement())');
    m = m.replace(/seq\s+BigInt\s+@unique\s+@default\(autoincrement\(\)\)/, 'seq Int @unique @default(0)');
    return m;
  }
);

// 10. Clean up extra blank lines
schema = schema.replace(/\n{3,}/g, '\n\n');

fs.writeFileSync(schemaPath, schema, 'utf8');
console.log('Successfully transformed schema.prisma to SQLite format');
