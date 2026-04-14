import { relations } from "drizzle-orm";
import {
  pgTable,
  serial,
  varchar,
  integer,
  decimal,
  timestamp,
  boolean,
  jsonb,
  text,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ============================================
// ENUMS
// ============================================

export const userRoleEnum = pgEnum("userRole", ["ADMIN", "STUDENT", "COMMITTEE", "SUPER_ADMIN"]);

export const applicationStatusEnum = pgEnum("applicationStatus", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

export const taadaFlagEnum = pgEnum("taadaFlag", [
  "FIRST_TIME",
  "ALREADY_FUNDED",
  "REJECTED_BEFORE",
]);

export const disbursementStatusEnum = pgEnum("disbursementStatus", [
  "PENDING",
  "APPROVED",
  "PROCESSED",
]);

// ============================================
// TABLES
// ============================================

// 1. Roles Table
export const rolesTable = pgTable(
  "roles",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 50 }).notNull().unique(),
  },
  (table) => ({
    nameIdx: uniqueIndex("roles_name_idx").on(table.name),
  })
);

// 2. Users Table
export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    roleId: integer("role_id").references(() => rolesTable.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").default(true),
    isVerified: boolean("is_verified").default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
  })
);

// 3. Students Table
export const studentsTable = pgTable(
  "students",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    nationalId: varchar("national_id", { length: 50 }).notNull().unique(),
    institution: varchar("institution", { length: 255 }).notNull(),
    educationLevel: varchar("education_level", { length: 50 }).default("TERTIARY"),
    course: varchar("course", { length: 255 }),
    yearOfStudy: integer("year_of_study").notNull(),
    schoolBankName: varchar("school_bank_name", { length: 255 }),
    schoolAccountNumber: varchar("school_account_number", { length: 100 }),
    county: varchar("county", { length: 100 }),
    constituency: varchar("constituency", { length: 100 }),
    isBankLocked: boolean("is_bank_locked").default(false),
    avatar: varchar("avatar", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("students_user_id_idx").on(table.userId),
    nationalIdIdx: uniqueIndex("students_national_id_idx").on(table.nationalId),
  })
);

// Bursary Type Enum
export const bursaryTypeEnum = pgEnum("bursaryType", [
  "MCA",
  "CDF",
  "COUNTY",
  "NATIONAL"
]);

// 4. Applications Table
export const applicationsTable = pgTable(
  "applications",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    cycleYear: integer("cycle_year").notNull(),
    bursaryType: bursaryTypeEnum("bursary_type").default("NATIONAL"), // NEW - Fund source
    county: varchar("county", { length: 100 }), // NEW - County
    constituency: varchar("constituency", { length: 100 }), // NEW - Constituency
    needScore: decimal("need_score", { precision: 5, scale: 2 }).default("0"), // NEW - Need assessment (0-100)
    amountRequested: decimal("amount_requested", { precision: 12, scale: 2 }).notNull(),
    feeBalance: decimal("fee_balance", { precision: 12, scale: 2 }).notNull().default("0"),
    amountAllocated: decimal("amount_allocated", { precision: 12, scale: 2 }).default("0"),
    status: applicationStatusEnum("status").default("PENDING"),
    taadaFlag: taadaFlagEnum("taada_flag").default("FIRST_TIME"),
    documentUrl: text("document_url"), // Stores JSON string of file paths
    rejectionReason: varchar("rejection_reason", { length: 500 }), // NEW - Why rejected
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    studentIdIdx: index("student_id_idx").on(table.studentId),
    bursaryTypeIdx: index("bursary_type_idx").on(table.bursaryType),
  })
);

// 5. Disbursements Table
export const disbursementsTable = pgTable(
  "disbursements",
  {
    id: serial("id").primaryKey(),
    allocationId: integer("allocation_id")
      .notNull()
      .references(() => applicationsTable.id, { onDelete: "cascade" }),
    fundSource: bursaryTypeEnum("fund_source").default("NATIONAL"), // NEW - Which fund paid this
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    referenceNumber: varchar("reference_number", { length: 50 }), // NEW - Bank transfer ref
    status: disbursementStatusEnum("status").default("PENDING"),
    disbursedAt: timestamp("disbursed_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    allocationIdIdx: index("allocation_id_idx").on(table.allocationId),
    fundSourceIdx: index("fund_source_idx").on(table.fundSource),
  })
);

// 6. Audit Logs Table
export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applicationsTable.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 255 }).notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userIdIdx: index("user_id_idx").on(table.userId),
    applicationIdIdx: index("application_id_idx").on(table.applicationId),
  })
);

// 7. Fund Sources Table (Configuration)
export const fundSourcesTable = pgTable(
  "fund_sources",
  {
    id: serial("id").primaryKey(),
    name: bursaryTypeEnum("name").notNull(), // MCA, CDF, COUNTY, NATIONAL
    description: varchar("description", { length: 500 }),
    budgetPerCycle: decimal("budget_per_cycle", { precision: 12, scale: 2 }).notNull(),
    cycleYear: integer("cycle_year").notNull(),
    allocatedAmount: decimal("allocated_amount", { precision: 12, scale: 2 }).default("0"),
    disbursedAmount: decimal("disbursed_amount", { precision: 12, scale: 2 }).default("0"),
    isOpen: boolean("is_open").default(false),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    nameYearIdx: index("fund_source_name_year_idx").on(table.name, table.cycleYear),
  })
);

// 8. Need Assessment Criteria Table
export const needAssessmentTable = pgTable(
  "need_assessment",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id")
      .notNull()
      .unique()
      .references(() => applicationsTable.id, { onDelete: "cascade" }),
    familyIncome: decimal("family_income", { precision: 12, scale: 2 }), // Annual family income
    dependents: integer("dependents").default(0), // Number of dependents
    orphaned: boolean("orphaned").default(false), // Is student an orphan
    disabled: boolean("disabled").default(false), // Any disabilities
    otherHardships: text("other_hardships"), // Text description of hardships
    academicScore: decimal("academic_score", { precision: 5, scale: 2 }), // GPA or exam score (0-100)
    scorePercentage: decimal("need_score_percentage", { precision: 5, scale: 2 }).default("0"), // Calculated need score
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    applicationIdIdx: index("assessment_app_id_idx").on(table.applicationId),
  })
);

// 9. Cash Flow Records Table (For detailed auditing)
export const cashFlowTable = pgTable(
  "cash_flow_records",
  {
    id: serial("id").primaryKey(),
    disbursementId: integer("disbursement_id").references(() => disbursementsTable.id, { onDelete: "cascade" }),
    fundSource: bursaryTypeEnum("fund_source").notNull(),
    transactionType: varchar("transaction_type", { length: 50 }).notNull(), // ALLOCATION, DISBURSEMENT, REVERSAL
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    balanceBefore: decimal("balance_before", { precision: 12, scale: 2 }).notNull(),
    balanceAfter: decimal("balance_after", { precision: 12, scale: 2 }).notNull(),
    referenceId: varchar("reference_id", { length: 100 }), // Application ID, Disbursement ID, etc
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    fundSourceIdx: index("cf_fund_source_idx").on(table.fundSource),
    createdAtIdx: index("cf_created_at_idx").on(table.createdAt),
  })
);

// 7. Password Resets Table
export const passwordResetsTable = pgTable(
  "password_resets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userIdIdx: index("user_id_idx").on(table.userId),
    tokenIdx: uniqueIndex("password_resets_token_idx").on(table.token),
  })
);

// 10. Notifications Table
export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    isRead: boolean("is_read").default(false),
    type: varchar("type", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userIdIdx: index("notifications_user_id_idx").on(table.userId),
  })
);

// 11. Announcements Table
export const announcementsTable = pgTable(
  "announcements",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow(),
  }
);

// 12. Admins Table (admin profile details)
export const adminsTable = pgTable(
  "admins",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 255 }),
    idNumber: varchar("id_number", { length: 50 }),
    imageIcon: text("image_icon"),
    systemId: varchar("system_id", { length: 50 }).unique(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("admins_user_id_idx").on(table.userId),
  })
);

// 13. OTP Verifications Table
export const otpVerificationsTable = pgTable(
  "otp_verifications",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    otp: varchar("otp", { length: 10 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    emailIdx: index("otp_email_idx").on(table.email),
  })
);

// ============================================
// RELATIONS
// ============================================

// User Relations
export const usersRelations = relations(usersTable, ({ one, many }) => ({
  role: one(rolesTable, {
    fields: [usersTable.roleId],
    references: [rolesTable.id],
  }),
  student: one(studentsTable, {
    fields: [usersTable.id],
    references: [studentsTable.userId],
  }),
  auditLogs: many(auditLogsTable),
  passwordResets: many(passwordResetsTable),
  notifications: many(notificationsTable),
  announcements: many(announcementsTable),
}));

// Role Relations
export const rolesRelations = relations(rolesTable, ({ many }) => ({
  users: many(usersTable),
}));

// Student Relations
export const studentsRelations = relations(studentsTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [studentsTable.userId],
    references: [usersTable.id],
  }),
  applications: many(applicationsTable),
}));

// Application Relations
export const applicationsRelations = relations(
  applicationsTable,
  ({ one, many }) => ({
    student: one(studentsTable, {
      fields: [applicationsTable.studentId],
      references: [studentsTable.id],
    }),
    disbursements: many(disbursementsTable),
    auditLogs: many(auditLogsTable),
  })
);

// Disbursement Relations
export const disbursementsRelations = relations(
  disbursementsTable,
  ({ one }) => ({
    application: one(applicationsTable, {
      fields: [disbursementsTable.allocationId],
      references: [applicationsTable.id],
    }),
  })
);

// Audit Log Relations
export const auditLogsRelations = relations(auditLogsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [auditLogsTable.userId],
    references: [usersTable.id],
  }),
  application: one(applicationsTable, {
    fields: [auditLogsTable.applicationId],
    references: [applicationsTable.id],
  }),
}));

// Password Reset Relations
export const passwordResetsRelations = relations(
  passwordResetsTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [passwordResetsTable.userId],
      references: [usersTable.id],
    }),
  })
);

// Need Assessment Relations
export const needAssessmentRelations = relations(needAssessmentTable, ({ one }) => ({
  application: one(applicationsTable, {
    fields: [needAssessmentTable.applicationId],
    references: [applicationsTable.id],
  }),
}));

// Cash Flow Relations
export const cashFlowRelations = relations(cashFlowTable, ({ one }) => ({
  disbursement: one(disbursementsTable, {
    fields: [cashFlowTable.disbursementId],
    references: [disbursementsTable.id],
  }),
}));

// ============================================
// TYPE INFERENCE
// ============================================

// Role Types
export type TRoleInsert = typeof rolesTable.$inferInsert;
export type TRoleSelect = typeof rolesTable.$inferSelect;

// User Types
export type TUserInsert = typeof usersTable.$inferInsert;
export type TUserSelect = typeof usersTable.$inferSelect;

// Student Types
export type TStudentInsert = typeof studentsTable.$inferInsert;
export type TStudentSelect = typeof studentsTable.$inferSelect;

// Application Types
export type TApplicationInsert = typeof applicationsTable.$inferInsert;
export type TApplicationSelect = typeof applicationsTable.$inferSelect;

// Disbursement Types
export type TDisbursementInsert = typeof disbursementsTable.$inferInsert;
export type TDisbursementSelect = typeof disbursementsTable.$inferSelect;

// Audit Log Types
export type TAuditLogInsert = typeof auditLogsTable.$inferInsert;
export type TAuditLogSelect = typeof auditLogsTable.$inferSelect;

// Password Reset Types
export type TPasswordResetInsert = typeof passwordResetsTable.$inferInsert;
export type TPasswordResetSelect = typeof passwordResetsTable.$inferSelect;

// Fund Source Types
export type TFundSourceInsert = typeof fundSourcesTable.$inferInsert;
export type TFundSourceSelect = typeof fundSourcesTable.$inferSelect;

// Need Assessment Types
export type TNeedAssessmentInsert = typeof needAssessmentTable.$inferInsert;
export type TNeedAssessmentSelect = typeof needAssessmentTable.$inferSelect;

// Cash Flow Types
export type TCashFlowInsert = typeof cashFlowTable.$inferInsert;
export type TCashFlowSelect = typeof cashFlowTable.$inferSelect;

// Notification Types
export type TNotificationInsert = typeof notificationsTable.$inferInsert;
export type TNotificationSelect = typeof notificationsTable.$inferSelect;

// Announcement Types
export type TAnnouncementInsert = typeof announcementsTable.$inferInsert;
export type TAnnouncementSelect = typeof announcementsTable.$inferSelect;

// Admin Profile Types
export type TAdminInsert = typeof adminsTable.$inferInsert;
export type TAdminSelect = typeof adminsTable.$inferSelect;
