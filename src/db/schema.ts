import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
const dates = () => ({ createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull() });
export const players = pgTable('players', {
  id: uuid('id').defaultRandom().primaryKey(), subject: text('sus_subject').unique().notNull(),
  displayName: text('display_name').notNull(), username: text('username').notNull(), avatar: text('avatar'),
  isAdmin: boolean('is_admin').default(false).notNull(),
  tag: text('tag').unique().notNull(), tagChangedAt: timestamp('tag_changed_at', { withTimezone: true }), xp: integer('xp').default(0).notNull(), bio: text('bio').default('').notNull(),
  publicProfile: boolean('public_profile').default(true).notNull(), ...dates(),
});
export const sessions = pgTable('sessions', { id: text('id_hash').primaryKey(), playerId: uuid('player_id').references(() => players.id, { onDelete: 'cascade' }).notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull() });
export const games = pgTable('games', {
  id: uuid('id').defaultRandom().primaryKey(), ownerId: uuid('owner_id').references(() => players.id).notNull(),
  slug: text('slug').unique().notNull(), title: text('title').notNull(), description: text('description').notNull(),
  genre: text('genre').notNull(), type: text('type', { enum: ['hosted', 'external'] }).notNull(),
  status: text('status', { enum: ['draft', 'review', 'published', 'suspended'] }).default('draft').notNull(),
  url: text('url'), icon: text('icon'), screenshots: jsonb('screenshots').$type<string[]>().default([]).notNull(), cover: text('cover'), accent: text('accent').default('violet').notNull(), activeBuildId: uuid('active_build_id'),
  ...dates(),
});
export const achievements = pgTable('achievements', { id: uuid('id').defaultRandom().primaryKey(), gameId: uuid('game_id').references(() => games.id, { onDelete: 'cascade' }).notNull(), key: text('key').notNull(), title: text('title').notNull(), description: text('description').notNull(), xp: integer('xp').default(0).notNull(), score: integer('score').default(0).notNull(), verified: boolean('verified').default(false).notNull(), imageId: uuid('image_id').references((): AnyPgColumn => gameMedia.id, { onDelete: 'set null' }), ...dates() }, t => [uniqueIndex('game_achievement_key').on(t.gameId, t.key)]);
export const unlocks = pgTable('unlocks', { id: uuid('id').defaultRandom().primaryKey(), playerId: uuid('player_id').references(() => players.id).notNull(), achievementId: uuid('achievement_id').references(() => achievements.id).notNull(), scoreAwarded: integer('score_awarded').default(0).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull() }, t => [uniqueIndex('player_achievement').on(t.playerId, t.achievementId)]);
export const library = pgTable('library', { id: uuid('id').defaultRandom().primaryKey(), playerId: uuid('player_id').references(() => players.id).notNull(), gameId: uuid('game_id').references(() => games.id).notNull(), ...dates() }, t => [uniqueIndex('player_library_game').on(t.playerId, t.gameId)]);
export const clients = pgTable('oauth_clients', { id: uuid('id').defaultRandom().primaryKey(), gameId: uuid('game_id').references(() => games.id).notNull(), name: text('name').notNull(), secretHash: text('secret_hash'), redirectUris: jsonb('redirect_uris').$type<string[]>().default([]).notNull(), scopes: jsonb('scopes').$type<string[]>().default([]).notNull(), ...dates() });
export const grants = pgTable('grants', { id: uuid('id').defaultRandom().primaryKey(), playerId: uuid('player_id').references(() => players.id).notNull(), gameId: uuid('game_id').references(() => games.id).notNull(), scopes: jsonb('scopes').$type<string[]>().notNull(), ...dates() }, t => [uniqueIndex('player_game_grant').on(t.playerId, t.gameId)]);
export const codes = pgTable('oauth_codes', { hash: text('hash').primaryKey(), clientId: uuid('client_id').references(() => clients.id).notNull(), playerId: uuid('player_id').references(() => players.id).notNull(), redirectUri: text('redirect_uri').notNull(), challenge: text('challenge').notNull(), scopes: jsonb('scopes').$type<string[]>().notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull() });
export const tokens = pgTable('access_tokens', { hash: text('hash').primaryKey(), playerId: uuid('player_id').references(() => players.id).notNull(), gameId: uuid('game_id').references(() => games.id).notNull(), clientId: uuid('client_id').references(() => clients.id), sessionHash: text('session_hash'), buildId: uuid('build_id'), scopes: jsonb('scopes').$type<string[]>().notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull() });
export const refreshTokens = pgTable('refresh_tokens', { hash: text('hash').primaryKey(), family: uuid('family').notNull(), accessHash: text('access_hash').notNull(), playerId: uuid('player_id').references(() => players.id).notNull(), clientId: uuid('client_id').references(() => clients.id).notNull(), gameId: uuid('game_id').references(() => games.id).notNull(), scopes: jsonb('scopes').$type<string[]>().notNull(), used: boolean('used').default(false).notNull(), revoked: boolean('revoked').default(false).notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull() });
export const builds = pgTable('hosted_builds', { id: uuid('id').defaultRandom().primaryKey(), gameId: uuid('game_id').references(() => games.id).notNull(), entrypoint: text('entrypoint').default('index.html').notNull(), digest: text('digest').default('').notNull(), bytes: integer('bytes').default(0).notNull(), fileCount: integer('file_count').default(0).notNull(), version: text('version').default('1.0.0').notNull(), notes: text('notes').default('').notNull(), sourceBytes: integer('source_bytes').default(0).notNull(), artifactId: text('artifact_id'), processingToken: text('processing_token'), manifest: jsonb('manifest').$type<Record<string, { bytes: number; type: string }>>().default({}).notNull(), error: text('error'), processingAt: timestamp('processing_at', { withTimezone: true }), status: text('status', { enum: ['awaiting_upload', 'queued', 'processing', 'ready', 'review', 'approved', 'rejected', 'failed'] }).default('awaiting_upload').notNull(), ...dates() });
export const saves = pgTable('cloud_saves', { id: uuid('id').defaultRandom().primaryKey(), playerId: uuid('player_id').references(() => players.id).notNull(), gameId: uuid('game_id').references(() => games.id).notNull(), data: jsonb('data').notNull(), version: integer('version').default(1).notNull(), bytes: integer('bytes').default(0).notNull(), ...dates() }, t => [uniqueIndex('player_game_save').on(t.playerId, t.gameId)]);
export const audit = pgTable('audit_log', { id: uuid('id').defaultRandom().primaryKey(), actorId: uuid('actor_id').references(() => players.id).notNull(), action: text('action').notNull(), targetId: text('target_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull() });
export const communityServers = pgTable('community_servers', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(), game: text('game').notNull(), description: text('description').notNull(),
  state: text('state', { enum: ['active', 'upcoming', 'maintenance', 'ended'] }).default('upcoming').notNull(),
  address: text('address'), version: text('version'), joinUrl: text('join_url'),
  joinLabel: text('join_label').default('Cómo entrar').notNull(), accessNote: text('access_note'), cover: text('cover'),
  visible: boolean('visible').default(false).notNull(), position: integer('position').default(0).notNull(), ...dates(),
});

export const gameMedia = pgTable('game_media', {
 id: uuid('id').defaultRandom().primaryKey(), gameId: uuid('game_id').references(() => games.id).notNull(),
 kind: text('kind', { enum: ['icon', 'banner', 'screenshot', 'achievement'] }).notNull(), achievementId: uuid('achievement_id').references((): AnyPgColumn => achievements.id, { onDelete: 'cascade' }),
 sourceBytes: integer('source_bytes').notNull(), contentType: text('content_type').notNull(),
 artifactKey: text('artifact_key'), processingToken: text('processing_token'), width: integer('width'), height: integer('height'), bytes: integer('bytes'), alt: text('alt').default('').notNull(),
 status: text('status', { enum: ['awaiting_upload', 'queued', 'processing', 'ready', 'failed'] }).default('awaiting_upload').notNull(), error: text('error'), processingAt: timestamp('processing_at', { withTimezone: true }), ...dates(),
});
export const releases = pgTable('game_releases', {
 id: uuid('id').defaultRandom().primaryKey(), gameId: uuid('game_id').references(() => games.id).notNull(),
 fromBuildId: uuid('from_build_id'), buildId: uuid('build_id').references(() => builds.id).notNull(),
 actorId: uuid('actor_id').references(() => players.id).notNull(), action: text('action', { enum: ['publish', 'rollback'] }).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
