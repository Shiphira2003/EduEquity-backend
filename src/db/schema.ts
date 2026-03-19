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

export const userRoleEnum = pgEnum("userRole", ["ADMIN", "STUDENT", "COMMITTEE"]);

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
    course: varchar("course", { length: 255 }).notNull(),
    yearOfStudy: integer("year_of_study").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("students_user_id_idx").on(table.userId),
    nationalIdIdx: uniqueIndex("students_national_id_idx").on(table.nationalId),
  })
);

// 4. Applications Table
export const applicationsTable = pgTable(
  "applications",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    cycleYear: integer("cycle_year").notNull(),
    amountRequested: decimal("amount_requested", { precision: 12, scale: 2 }).notNull(),
    amountAllocated: decimal("amount_allocated", { precision: 12, scale: 2 }).default("0"),
    status: applicationStatusEnum("status").default("PENDING"),
    taadaFlag: taadaFlagEnum("taada_flag").default("FIRST_TIME"),
    documentUrl: text("document_url"), // Stores JSON string of file paths
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    studentIdIdx: index("student_id_idx").on(table.studentId),
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
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    status: disbursementStatusEnum("status").default("PENDING"),
    disbursedAt: timestamp("disbursed_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    allocationIdIdx: index("allocation_id_idx").on(table.allocationId),
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
