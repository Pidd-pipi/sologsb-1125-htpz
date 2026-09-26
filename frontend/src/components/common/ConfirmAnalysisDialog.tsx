import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useSampleStore } from '../../stores/sampleStore';
import { useToastStore } from '../../stores/uiStore';
import { ANALYSIS_METHOD_LABELS, type AnalysisRecord } from '../../types/analysis';
import { classifyByAnalysis } from '../../utils/classify';
import { formatDate, formatNumber } from '../../utils/format';

interface ConfirmAnalysisDialogProps {
  /** 待确认的复测记录；为 null 时对话框关闭 */
  record: AnalysisRecord | null;
  /** 该样本的当前判据（将被取代的旧版） */
  current?: AnalysisRecord;
  sampleNo?: string;
  onClose: () => void;
}

function valuesLine(a: AnalysisRecord): string {
  return `Fa ${formatNumber(a.fa, 2, ' mol%')} · Fs ${formatNumber(a.fs, 2, ' mol%')} · Ni ${formatNumber(
    a.ni,
    2,
    ' wt%',
  )} · 带宽 ${formatNumber(a.kamaciteBandwidth, 3, ' mm')}`;
}

/** 确认复测对话框：填写复核原因后，待确认版本取代当前判据 */
export function ConfirmAnalysisDialog({
  record,
  current,
  sampleNo,
  onClose,
}: ConfirmAnalysisDialogProps) {
  const confirmAnalysis = useSampleStore((s) => s.confirmAnalysis);
  const notify = useToastStore((s) => s.notify);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (record) {
      setReason('');
      setError(null);
    }
  }, [record]);

  if (!record) return null;

  const pendingAdvice = classifyByAnalysis(record);

  const submit = async () => {
    if (!reason.trim()) {
      setError('请填写复核原因，确认后该版本将取代当前判据');
      return;
    }
    const ok = await confirmAnalysis(record.id, reason);
    if (ok) {
      notify(`v${record.version} 已确认为当前判据，旧版本转入历史`);
      onClose();
    } else {
      setError('确认失败：该记录可能已被处理，请刷新后重试');
    }
  };

  return (
    <Dialog open={!!record} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        确认复测结果{sampleNo ? `：${sampleNo}` : ''}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          <Box sx={{ border: '1px solid', borderColor: 'warning.main', borderRadius: 2, p: 1.5 }}>
            <Typography variant="subtitle2">
              新版本 v{record.version} · {ANALYSIS_METHOD_LABELS[record.method]} ·{' '}
              {formatDate(record.testedAt)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {valuesLine(record)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {pendingAdvice.summary}
            </Typography>
          </Box>

          {current ? (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                p: 1.5,
                opacity: 0.75,
              }}
            >
              <Typography variant="subtitle2">
                将被取代的当前判据 v{current.version} · {ANALYSIS_METHOD_LABELS[current.method]} ·{' '}
                {formatDate(current.testedAt)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {valuesLine(current)}
              </Typography>
            </Box>
          ) : (
            <Alert severity="info">该样本暂无当前判据，确认后此版本直接成为当前判据。</Alert>
          )}

          <Divider />
          <TextField
            id="confirm-review-reason"
            label="复核原因"
            placeholder="例如：复测排除制样污染，数值稳定，采纳新结果"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            multiline
            minRows={2}
            required
            error={!!error}
            helperText={error ?? '确认后旧版本保留为历史记录，不能再次成为当前判据。'}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={() => void submit()} id="confirm-analysis-submit">
          确认取代当前判据
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ConfirmAnalysisDialog;
