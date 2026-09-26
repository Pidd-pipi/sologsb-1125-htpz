import type { AnalysisRecord } from '../types/analysis';

/** 检测日期新→旧排序（日期相同再按创建时间） */
export function compareByRecency(a: AnalysisRecord, b: AnalysisRecord): number {
  const t = (b.testedAt ?? '').localeCompare(a.testedAt ?? '');
  return t !== 0 ? t : b.createdAt - a.createdAt;
}

/**
 * 挑选样本的当前判据版本。
 * 优先取 status = current 的记录；旧档案没有版本信息时，
 * 按检测日期最近的一次检测作为当前结果。
 */
export function resolveCurrentAnalysis(records: AnalysisRecord[]): AnalysisRecord | undefined {
  if (records.length === 0) return undefined;
  const current = records.find((r) => r.status === 'current');
  if (current) return current;
  const legacy = records.filter((r) => !r.status);
  if (legacy.length > 0) return [...legacy].sort(compareByRecency)[0];
  return undefined;
}

/** 待确认复测，按创建时间新→旧 */
export function pendingAnalyses(records: AnalysisRecord[]): AnalysisRecord[] {
  return records.filter((r) => r.status === 'pending').sort((a, b) => b.createdAt - a.createdAt);
}

/** 历史版本（已被取代，只读），按检测日期新→旧 */
export function supersededAnalyses(records: AnalysisRecord[]): AnalysisRecord[] {
  return records.filter((r) => r.status === 'superseded').sort(compareByRecency);
}

/** 同一样本内的下一个版本号 */
export function nextVersion(records: AnalysisRecord[]): number {
  return records.reduce((max, r) => Math.max(max, r.version ?? 0), 0) + 1;
}

/** 找出取代了指定记录的新版本（若有） */
export function supersededBy(
  records: AnalysisRecord[],
  record: AnalysisRecord,
): AnalysisRecord | undefined {
  return records.find((r) => r.supersedesId === record.id);
}
