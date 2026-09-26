import type { AnalysisRecord } from '../types/analysis';

/**
 * 取样本的当前判据：优先 status === 'current' 的版本。
 * 旧档案没有版本信息（所有记录都缺 status）时，按检测日期最近的一次检测作为当前结果；
 * 已有版本信息但尚无已确认版本（全部为待确认）时返回 undefined，待确认结果不参与判据。
 */
export function currentAnalysisOf(
  list: AnalysisRecord[],
  sampleId: string,
): AnalysisRecord | undefined {
  const mine = list.filter((a) => a.sampleId === sampleId);
  const current = mine.find((a) => a.status === 'current');
  if (current) return current;
  if (mine.some((a) => a.status)) return undefined;
  return [...mine].sort(
    (a, b) => b.testedAt.localeCompare(a.testedAt) || b.createdAt - a.createdAt,
  )[0];
}

/**
 * 取样本的完整版本链，按版本号倒序（最新版在前）。
 * 旧档案缺 version 字段时按检测日期推算位次，保证链条稳定。
 */
export function versionChainOf(list: AnalysisRecord[], sampleId: string): AnalysisRecord[] {
  const mine = list.filter((a) => a.sampleId === sampleId);
  return mine.sort((a, b) => {
    const va = typeof a.version === 'number' ? a.version : 0;
    const vb = typeof b.version === 'number' ? b.version : 0;
    if (va !== vb) return vb - va;
    return b.testedAt.localeCompare(a.testedAt) || b.createdAt - a.createdAt;
  });
}

/** 取代某条记录的新版本（若存在） */
export function supersededByOf(list: AnalysisRecord[], record: AnalysisRecord): AnalysisRecord | undefined {
  return list.find((a) => a.supersedesId === record.id);
}

/** 样本是否还有待确认版本（版本链串行：确认前不再录入新复测） */
export function hasPendingAnalysis(list: AnalysisRecord[], sampleId: string): boolean {
  return list.some((a) => a.sampleId === sampleId && a.status === 'pending');
}
