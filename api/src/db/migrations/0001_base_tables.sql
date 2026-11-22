CREATE TYPE "public"."actor_kind" AS ENUM('user', 'client', 'system');--> statement-breakpoint
CREATE TYPE "public"."auth_token_kind" AS ENUM('invite', 'reset', 'email_code');--> statement-breakpoint
CREATE TYPE "public"."change_kind" AS ENUM('lead', 'message', 'task', 'health', 'notification');--> statement-breakpoint
CREATE TYPE "public"."conversion_platform" AS ENUM('meta', 'google');--> statement-breakpoint
CREATE TYPE "public"."conversion_state" AS ENUM('pending', 'sent', 'retrying', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."health_state" AS ENUM('connected', 'needs_attention', 'broken', 'not_connected');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'mql', 'sql', 'not_qualified');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'ar', 'fr');--> statement-breakpoint
CREATE TYPE "public"."integration_mode" AS ENUM('live', 'fixture', 'awaiting');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'other');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('new_lead', 'new_message', 'no_reply', 'task_due', 'connection_issue', 'client_marked');--> statement-breakpoint
CREATE TYPE "public"."message_origin" AS ENUM('customer', 'app', 'history');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('super_admin', 'manager', 'client');--> statement-breakpoint
CREATE TYPE "public"."session_stage" AS ENUM('active', 'pending_2fa');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('meta', 'google', 'youtube', 'tiktok', 'linkedin', 'snapchat', 'website', 'whatsapp', 'csv');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."wa_sync_state" AS ENUM('none', 'syncing', 'done', 'missed');--> statement-breakpoint
CREATE TABLE "error_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "change_feed" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "change_kind" NOT NULL,
	"ref_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_pair" UNIQUE("project_id","user_id"),
	CONSTRAINT "project_members_one_project" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_id" uuid,
	"project_id" uuid,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "auth_token_kind" NOT NULL,
	"token_hash" text NOT NULL,
	"session_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "auth_tokens_code_session" CHECK (("auth_tokens"."kind" = 'email_code') = ("auth_tokens"."session_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"stage" "session_stage" DEFAULT 'pending_2fa' NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" NOT NULL,
	"pw_hash" text,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"status" "user_status" DEFAULT 'invited' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lower" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text,
	"phone_e164" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_project_phone" UNIQUE("project_id","phone_e164")
);
--> statement-breakpoint
CREATE TABLE "conversion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"status" "lead_status" NOT NULL,
	"status_seq" integer NOT NULL,
	"platform" "conversion_platform" NOT NULL,
	"state" "conversion_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversion_events_lead_seq_platform" UNIQUE("lead_id","status_seq","platform")
);
--> statement-breakpoint
CREATE TABLE "conversion_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "lead_status" NOT NULL,
	"meta_event" text,
	"google_event" text,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "conversion_mappings_project_status" UNIQUE("project_id","status")
);
--> statement-breakpoint
CREATE TABLE "integration_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"enc_value" text NOT NULL,
	"key_id" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"status" "health_state" DEFAULT 'not_connected' NOT NULL,
	"mode" "integration_mode" DEFAULT 'awaiting' NOT NULL,
	"account_label" text,
	"last_data_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_project_platform" UNIQUE("project_id","platform")
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"external_form_id" text NOT NULL,
	"name" text NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_forms_integration_form" UNIQUE("integration_id","external_form_id")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"source" "source" NOT NULL,
	"external_id" text,
	"form_id" text,
	"campaign" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"status_seq" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"stage_id" uuid,
	"owner_id" uuid,
	"is_test" boolean DEFAULT false NOT NULL,
	"first_reply_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_project_source_external" UNIQUE("project_id","source","external_id")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"author_id" uuid,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"mql_definition" text DEFAULT '' NOT NULL,
	"sql_definition" text DEFAULT '' NOT NULL,
	"reasons" text[] DEFAULT ARRAY['No budget','Wrong location','Not interested','Unreachable','Duplicate']::text[] NOT NULL,
	CONSTRAINT "qualification_settings_project" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"ref_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"industry" text,
	"timezone" text DEFAULT 'Asia/Dubai' NOT NULL,
	"business_hours" jsonb DEFAULT '{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}'::jsonb NOT NULL,
	"first_reply_minutes" integer DEFAULT 15 NOT NULL,
	"color" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lead_id" uuid,
	"assignee_id" uuid,
	"title" text NOT NULL,
	"due_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"project_id" uuid,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "webhook_events_provider_external" UNIQUE("provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "wa_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_conversations_number_contact" UNIQUE("number_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "wa_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"wa_message_id" text NOT NULL,
	"direction" "direction" NOT NULL,
	"origin" "message_origin" NOT NULL,
	"type" "message_type" DEFAULT 'text' NOT NULL,
	"text" text,
	"ts" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_messages_wa_message_id_unique" UNIQUE("wa_message_id")
);
--> statement-breakpoint
CREATE TABLE "wa_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"phone_e164" text NOT NULL,
	"label" text,
	"phone_number_id" text,
	"waba_id" text,
	"sync_state" "wa_sync_state" DEFAULT 'none' NOT NULL,
	"sync_pct" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_numbers_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
ALTER TABLE "change_feed" ADD CONSTRAINT "change_feed_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_mappings" ADD CONSTRAINT "conversion_mappings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_settings" ADD CONSTRAINT "qualification_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_number_id_wa_numbers_id_fk" FOREIGN KEY ("number_id") REFERENCES "public"."wa_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_conversation_id_wa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_numbers" ADD CONSTRAINT "wa_numbers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "error_log_fingerprint_idx" ON "error_log" USING btree ("fingerprint","created_at");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "change_feed_project_idx" ON "change_feed" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at","id");--> statement-breakpoint
CREATE INDEX "audit_project_idx" ON "audit_log" USING btree ("project_id","at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_id","at");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action","at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_one_live" ON "auth_tokens" USING btree ("user_id","kind") WHERE "auth_tokens"."used_at" is null;--> statement-breakpoint
CREATE INDEX "auth_tokens_session_idx" ON "auth_tokens" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "auth_tokens_expires_idx" ON "auth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "contacts_project_email_idx" ON "contacts" USING btree ("project_id","email");--> statement-breakpoint
CREATE INDEX "conversion_events_state_idx" ON "conversion_events" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "lead_events_lead_idx" ON "lead_events" USING btree ("lead_id","at");--> statement-breakpoint
CREATE INDEX "leads_project_created_idx" ON "leads" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_project_status_idx" ON "leads" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "leads_contact_idx" ON "leads" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "notes_lead_idx" ON "notes" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "pipeline_stages_project_idx" ON "pipeline_stages" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_name_lower_idx" ON "projects" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "tasks_assignee_due_idx" ON "tasks" USING btree ("assignee_id","due_at");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "wa_conversations_project_last_idx" ON "wa_conversations" USING btree ("project_id","last_message_at");--> statement-breakpoint
CREATE INDEX "wa_messages_conversation_ts_idx" ON "wa_messages" USING btree ("conversation_id","ts");