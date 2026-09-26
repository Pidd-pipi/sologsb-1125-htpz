import { Chip } from '@mui/material';
import { ANALYSIS_STATUS_LABELS, type AnalysisRecord } from '../../types/analysis';

interface AnalysisStatusChipProps {
  record: AnalysisRecord;
}

/** 版本链状态徽标：vN · 当前判据 / 待确认 / 历史版本 */
export function AnalysisStatusChip({ record }: AnalysisStatusChipProps) {
  const status = record.status ?? 'current';
  const color = status === 'current' ? 'success' : status === 'pending' ? 'warning' : 'default';
  return (
    <Chip
      size="small"
      color={color}
      variant={status === 'superseded' ? 'outlined' : 'filled'}
      label={`v${record.version ?? 1} · ${ANALYSIS_STATUS_LABELS[status]}`}
    />
  );
}

export default AnalysisStatusChip;
