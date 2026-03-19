export {
  stripAnsi,
  parseValue,
  parseTimestamp,
  extractTimestamp,
  extractLogLevel,
  extractAction,
  extractKeyValuePairs,
  detectComponent,
  detectOperation,
  detectActivityPattern,
  extractSessionIdentifier,
  detectTrigger,
  getUniversalNodeStatus,
  openClawSessionIdToAgent,
} from './log-utils.js';

export type { LogActivity } from './log-utils.js';
