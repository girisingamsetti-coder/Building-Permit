import * as Enums from './enums';

declare module '@prisma/client' {
  export import UserStatus = Enums.UserStatus;
  export import ApplicationStatus = Enums.ApplicationStatus;
  export import StageType = Enums.StageType;
  export import ActionKind = Enums.ActionKind;
  export import WorkflowInstanceStatus = Enums.WorkflowInstanceStatus;
  export import TaskStatus = Enums.TaskStatus;
  export import AssignmentStrategy = Enums.AssignmentStrategy;
  export import ScrutinyStatus = Enums.ScrutinyStatus;
  export import ScrutinyOutcome = Enums.ScrutinyOutcome;
  export import IssueSeverity = Enums.IssueSeverity;
  export import DocumentStatus = Enums.DocumentStatus;
  export import ScanStatus = Enums.ScanStatus;
  export import FeeDemandType = Enums.FeeDemandType;
  export import FeeDemandStatus = Enums.FeeDemandStatus;
  export import CalculationBasis = Enums.CalculationBasis;
  export import FeeAdjustmentKind = Enums.FeeAdjustmentKind;
  export import PaymentStatus = Enums.PaymentStatus;
  export import RefundStatus = Enums.RefundStatus;
  export import ShortfallKind = Enums.ShortfallKind;
  export import ShortfallStatus = Enums.ShortfallStatus;
  export import ShortfallMode = Enums.ShortfallMode;
  export import SlaStatus = Enums.SlaStatus;
  export import SlaCalendar = Enums.SlaCalendar;
  export import NotificationChannel = Enums.NotificationChannel;
  export import DeliveryStatus = Enums.DeliveryStatus;
  export import OrderStatus = Enums.OrderStatus;
  export import JobStatus = Enums.JobStatus;
  export import SettingType = Enums.SettingType;
  export import ApplicationPurpose = Enums.ApplicationPurpose;
}
