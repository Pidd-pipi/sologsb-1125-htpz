import { create } from 'zustand';
import { db, makeId, seedIfEmpty } from '../db';
import type { AnalysisRecord } from '../types/analysis';
import type { FindRecord } from '../types/find';
import type { MeteoriteSample } from '../types/sample';
import type { ThinSection } from '../types/section';

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
  addAnalysis: (input: Omit<AnalysisRecord, 'id' | 'createdAt' | 'version' | 'status'>) => Promise<string>;
  confirmAnalysis: (id: string, reviewReason: string) => Promise<void>;
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
    // 复测记录先作为待确认版本进入版本链，确认后才取代旧判据
    const mine = get().analysis.filter((a) => a.sampleId === input.sampleId);
    const version = mine.reduce((max, a) => Math.max(max, a.version ?? 0), 0) + 1;
    const record: AnalysisRecord = {
      ...input,
      id: makeId('analysis'),
      createdAt: Date.now(),
      version,
      status: 'pending',
    };
    await db.analysis.add(record);
    set({ analysis: [record, ...get().analysis] });
    return record.id;
  },

  confirmAnalysis: async (id, reviewReason) => {
    const all = get().analysis;
    const target = all.find((a) => a.id === id);
    if (!target || target.status !== 'pending') return;
    const reason = reviewReason.trim();
    if (!reason) return;
    const confirmedAt = Date.now();
    // 单向链：旧当前版被取代后只能查看，不能再次成为当前判据
    const prevCurrent = all.find(
      (a) => a.sampleId === target.sampleId && a.status === 'current',
    );
    await db.transaction('rw', db.analysis, async () => {
      if (prevCurrent) {
        await db.analysis.update(prevCurrent.id, { status: 'superseded' });
      }
      await db.analysis.update(id, {
        status: 'current',
        reviewReason: reason,
        confirmedAt,
        supersedesId: prevCurrent?.id,
      });
    });
    set({
      analysis: get().analysis.map((a) => {
        if (prevCurrent && a.id === prevCurrent.id) {
          return { ...a, status: 'superseded' as const };
        }
        if (a.id === id) {
          return {
            ...a,
            status: 'current' as const,
            reviewReason: reason,
            confirmedAt,
            supersedesId: prevCurrent?.id,
          };
        }
        return a;
      }),
    });
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
