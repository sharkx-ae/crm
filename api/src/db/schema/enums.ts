import { pgEnum } from 'drizzle-orm/pg-core';
import * as c from '../../contracts/common.ts';

// Values come from the contracts, so enums can't drift from the Zod schemas.
const v = <const T extends readonly string[]>(o: T) =>
  [...o] as unknown as [T[number], ...T[number][]];

export const roleEnum = pgEnum('role', v(c.role.options));
export const localeEnum = pgEnum('locale', v(c.locale.options));
export const sourceEnum = pgEnum('source', v(c.source.options));
export const leadStatusEnum = pgEnum('lead_status', v(c.leadStatus.options));
export const healthEnum = pgEnum('health_state', v(c.healthState.options));
export const modeEnum = pgEnum('integration_mode', v(c.mode.options));
export const directionEnum = pgEnum('direction', v(c.direction.options));
export const originEnum = pgEnum('message_origin', v(c.origin.options));
export const msgTypeEnum = pgEnum('message_type', v(c.msgType.options));
export const actorKindEnum = pgEnum('actor_kind', v(c.actorKind.options));
export const conversionStateEnum = pgEnum('conversion_state', v(c.conversionState.options));
export const changeKindEnum = pgEnum('change_kind', v(c.changeKind.options));
export const notificationKindEnum = pgEnum('notification_kind', v(c.notificationKind.options));

export const userStatusEnum = pgEnum('user_status', v(c.userStatus.options));
export const sessionStageEnum = pgEnum('session_stage', v(c.sessionStage.options));
export const authTokenKindEnum = pgEnum('auth_token_kind', ['invite', 'reset', 'email_code']);
export const waSyncStateEnum = pgEnum('wa_sync_state', v(c.waSyncState.options));
export const conversionPlatformEnum = pgEnum('conversion_platform', ['meta', 'google']);
