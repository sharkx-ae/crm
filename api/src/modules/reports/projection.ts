import type { Role } from '../../contracts/common.ts';
import type { OverviewResponse } from '../../contracts/reports.ts';
import { type LeadRow, leadViewFor, toClientLead, visibleTo } from '../leads/projection.ts';

// Client-safe projection for the overview (F10a S3; F13a fills the numbers). Neither role gets per-manager data;
// the client shape adds the "waiting for review" tile and list, with leads in the client allowlist only. Everything
// is copied field by field, so a number or a breakdown the query adds never reaches a response by itself.

type StaffOverview = Extract<OverviewResponse, { view: 'staff' }>;

/**
 * What the overview query computes, before the role decides the shape. Waiting = unreviewed (status 'new'), real
 * leads only (`hideTestLeads('client')`): `waitingCount` is the full count for the tile, `waiting` the short list.
 */
export type OverviewData = {
  kpis: StaffOverview['kpis'];
  perDay: StaffOverview['perDay'];
  bySource: StaffOverview['bySource'];
  waitingCount: number;
  waiting: LeadRow[];
};

export function projectOverview(session: { role: Role }, data: OverviewData): OverviewResponse {
  const kpis = {
    leads30: data.kpis.leads30,
    newToday: data.kpis.newToday,
    medianFirstReplyMin: data.kpis.medianFirstReplyMin,
    mqlRate: data.kpis.mqlRate,
    sqlRate: data.kpis.sqlRate,
  };
  const series = {
    perDay: data.perDay.map((d) => ({ date: d.date, count: d.count })),
    bySource: data.bySource.map((s) => ({ source: s.source, count: s.count })),
  };
  if (leadViewFor(session) === 'staff') return { view: 'staff', kpis, ...series };
  return {
    view: 'client',
    kpis: { ...kpis, waiting: data.waitingCount },
    ...series,
    waiting: data.waiting.filter((r) => visibleTo('client', r)).map(toClientLead),
  };
}
