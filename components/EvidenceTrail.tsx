import React from 'react';
import { Fingerprint, UserCheck } from 'lucide-react';

interface EvidenceTrailProps {
  resolvedFromEvidence?: string;
  userOverride?: boolean;
}

function parseEvidenceIds(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((e): e is string => typeof e === 'string');
    return [];
  } catch {
    return [];
  }
}

export const EvidenceTrail: React.FC<EvidenceTrailProps> = ({
  resolvedFromEvidence,
  userOverride,
}) => {
  const evidenceIds = parseEvidenceIds(resolvedFromEvidence);
  const hasSources = evidenceIds.length > 0;

  if (!hasSources && !userOverride) {
    return null;
  }

  if (userOverride) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-surface-border/60 px-2 py-0.5 text-xs text-slate-400"
        title="This entry was manually confirmed or overridden."
      >
        <UserCheck className="h-3 w-3" />
        <span>Manually confirmed</span>
      </span>
    );
  }

  const label = evidenceIds.length === 1 ? '1 source' : `${evidenceIds.length} sources`;
  const tooltip = evidenceIds.join(', ');

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-surface-border/60 px-2 py-0.5 text-xs text-slate-400"
      title={tooltip}
    >
      <Fingerprint className="h-3 w-3" />
      <span>{label}</span>
    </span>
  );
};
