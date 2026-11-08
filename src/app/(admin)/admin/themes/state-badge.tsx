import { Badge } from '@/components/ui/badge'
import type { VersionState } from '@/domains/themes/release'

const LABEL: Record<VersionState, string> = { deployed: 'New', added: 'Not offered', staged: 'Staged', released: 'Released', recalled: 'Recalled', withdrawn: 'Withdrawn' }
const TONE = { deployed: 'info', added: 'neutral', staged: 'info', released: 'ok', recalled: 'warn', withdrawn: 'danger' } as const

export const StateBadge = ({ state }: { state: VersionState }) => <Badge tone={TONE[state]}>{LABEL[state]}</Badge>
