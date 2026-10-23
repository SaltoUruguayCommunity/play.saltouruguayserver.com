CREATE TABLE "community_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"game" text NOT NULL,
	"description" text NOT NULL,
	"state" text DEFAULT 'upcoming' NOT NULL,
	"address" text,
	"version" text,
	"join_url" text,
	"join_label" text DEFAULT 'Cómo entrar' NOT NULL,
	"access_note" text,
	"cover" text,
	"visible" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
