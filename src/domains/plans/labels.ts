import { MODULES, type ModuleKey } from '@/domains/modules/registry'

/** How a plan feature (a module) is named to people: the registry's name. One list. */
export const FEATURE_NAMES: Record<ModuleKey, string> = Object.fromEntries(Object.values(MODULES).map((m) => [m.key, m.name])) as Record<ModuleKey, string>
