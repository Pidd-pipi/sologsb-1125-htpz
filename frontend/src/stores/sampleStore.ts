import { create } from 'zustand';
import { db, makeId, seedIfEmpty } from '../db';
import type { AnalysisInput, AnalysisRecord } from '../types/analysis';
import type { FindRecord } from '../types/find';
import type { MeteoriteSample } from '../types/sample';
import type { ThinSection } from '../types/section';
import { nextVersion } from '../utils/versionChain';

export interface SampleState {
  samples: MeteoriteSample[];
  finds: FindRecord[];
  sections: ThinSection[];
  analysis: AnalysisRecord[];
  loading: boolean;
  loaded: boolean;
  loadAll: () => Promise<void>;
  addSample: (input: Omit<MeteoriteSample, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateSample: (id: string, patch: Partial<MeteoriteSample>) => Promise<void>;
  removeSample: (id: string) => Promise<void>;
  addFind: (input: Omit<FindRecord, 'id' | 'createdAt'>) => Promise<string>;
  addSection: (input: Omit<ThinSection, 'id' | 'createdAt'>) => Promise<string>;
  updateSection: (id: string, patch: Partial<ThinSection>) => Promise<void>;
  /** 首条检测直接成为当前判据；样本已有判据时记为待确认复测 */
  addAnalysis: (input: AnalysisInput) => Promise<AnalysisRecord>;
  /** 确认待确认复测：填写复核原因后取代当前判据，旧版转为历史版本 */
  confirmAnalysis: (id: string, reviewReason: string) => Promise<boolean>;
  nextSampleSeq: () => number;
}

export const useSampleStore = create<SampleState>((set, get) => ({
  samples: [],
  finds: [],
  sections: [],
  analysis: [],
  loading: false,
  loaded: false,

  loadAll: async () => {
    set({ loading: true });
    await seedIfEmpty();
    const [samples, finds, sections, analysis] = await Promise.all([
      db.samples.toArray(),
      db.finds.toArray(),
      db.sections.toArray(),
      db.analysis.toArray(),
    ]);
    samples.sort((a, b) => b.createdAt - a.createdAt);
    finds.sort((a, b) => b.createdAt - a.createdAt);
    sections.sort((a, b) => b.createdAt - a.createdAt);
    analysis.sort((a, b) => b.createdAt - a.createdAt);
    set({ samples, finds, sections, analysis, loading: false, loaded: true });
  },

  addSample: async (input) => {
    const now = Date.now();
    const record: MeteoriteSample = { ...input, id: makeId('sample'), createdAt: now, updatedAt: now };
    await db.samples.add(record);
    set({ samples: [record, ...get().samples] });
    return record.id;
  },

  updateSample: async (id, patch) => {
    const updatedAt = Date.now();
    await db.samples.update(id, { ...patch, updatedAt });
    set({
      samples: get().samples.map((s) => (s.id === id ? { ...s, ...patch, updatedAt } : s)),
    });
  },

  removeSample: async (id) => {
    await db.transaction('rw', db.samples, db.finds, db.sections, db.analysis, async () => {
      await db.samples.delete(id);
      await db.finds.where('sampleId').equals(id).delete();
      await db.sections.where('sampleId').equals(id).delete();
      await db.analysis.where('sampleId').equals(id).delete();
    });
    set({
      samples: get().samples.filter((s) => s.id !== id),
      finds: get().finds.filter((f) => f.sampleId !== id),
      sections: get().sections.filter((s) => s.sampleId !== id),
      analysis: get().analysis.filter((a) => a.sampleId !== id),
    });
  },

  addFind: async (input) => {
    const record: FindRecord = { ...input, id: makeId('find'), createdAt: Date.now() };
    await db.finds.add(record);
    set({ finds: [record, ...get().finds] });
    return record.id;
  },

  addSection: async (input) => {
    const record: ThinSection = { ...input, id: makeId('section'), createdAt: Date.now() };
    await db.sections.add(record);
    set({ sections: [record, ...get().sections] });
    return record.id;
  },

  updateSection: async (id, patch) => {
    await db.sections.update(id, patch);
    set({ sections: get().sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  },

  addAnalysis: async (input) => {
    const siblings = get().analysis.filter((a) => a.sampleId === input.sampleId);
    // 首条检测直接成为当前判据；复测先作为待确认结果，确认后才取代旧版
    const status: AnalysisRecord['status'] = siblings.length === 0 ? 'current' : 'pending';
    const record: AnalysisRecord = {
      ...input,
      id: makeId('analysis'),
      createdAt: Date.now(),
      status,
      version: nextVersion(siblings),
    };
    await db.analysis.add(record);
    set({ analysis: [record, ...get().analysis] });
    return record;
  },

  confirmAnalysis: async (id, reviewReason) => {
    const reason = reviewReason.trim();
    if (!reason) return false;
    const all = get().analysis;
    const target = all.find((a) => a.id === id);
    if (!target || target.status !== 'pending') return false;
    const reviewedAt = Date.now();
    const oldCurrent = all.find(
      (a) => a.sampleId === target.sampleId && a.status === 'current',
    );
    await db.transaction('rw', db.analysis, async () => {
      if (oldCurrent) {
        await db.analysis.update(oldCurrent.id, { status: 'superseded' });
      }
      await db.analysis.update(id, {
        status: 'current',
        reviewReason: reason,
        reviewedAt,
        supersedesId: oldCurrent?.id,
      });
    });
    set({
      analysis: get().analysis.map((a) => {
        if (oldCurrent && a.id === oldCurrent.id) {
          return { ...a, status: 'superseded' as const };
        }
        if (a.id === id) {
          return {
            ...a,
            status: 'current' as const,
            reviewReason: reason,
            reviewedAt,
            supersedesId: oldCurrent?.id,
          };
        }
        return a;
      }),
    });
    return true;
  },

  nextSampleSeq: () => {
    const year = new Date().getFullYear();
    const prefix = `MET-${year}-`;
    const used = get()
      .samples.map((s) => s.sampleNo)
      .filter((no) => no.startsWith(prefix))
      .map((no) => Number(no.slice(prefix.length)))
      .filter((n) => Number.isFinite(n));
    const max = used.length ? Math.max(...used) : 0;
    return max + 1;
  },
}));
