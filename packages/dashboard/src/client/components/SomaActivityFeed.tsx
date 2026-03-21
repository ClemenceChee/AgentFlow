import { useEffect, useRef, useState } from 'react';

interface ActivityEvent {
  id: string;
  action: string;
  description: string;
  entityType?: string;
  entityId?: string;
  timestamp: string;
}

const ACTION_ICONS: Record<string, string> = {
  harvest: '\u{1F33E}',
  synthesize: '\u{1F9EA}',
  promote: '\u{2705}',
  reject: '\u{274C}',
  decay: '\u{1F342}',
  reconcile: '\u{1F527}',
  'policy-change': '\u{1F6E1}',
};

export function SomaActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const eventsRef = useRef<ActivityEvent[]>([]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'soma-activity' && msg.data) {
          const event: ActivityEvent = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            action: msg.data.action ?? 'unknown',
            description: msg.data.description ?? msg.data.entity ?? '',
            entityType: msg.data.entityType,
            entityId: msg.data.entityId,
            timestamp: msg.data.timestamp ?? new Date().toISOString(),
          };
          eventsRef.current = [event, ...eventsRef.current].slice(0, 100);
          setEvents([...eventsRef.current]);
        }
      } catch {
        /* ignore malformed messages */
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="soma-activity">
      <div className="soma-activity__header">
        <h3>Activity Feed</h3>
        <span className="soma-activity__status">
          {events.length > 0 ? `${events.length} events` : 'Waiting for events...'}
        </span>
      </div>
      <div className="soma-activity__list">
        {events.length === 0 && (
          <div className="soma-activity__empty">
            <p>
              No activity yet. Events will appear here in real-time as SOMA workers harvest,
              synthesize, and manage knowledge.
            </p>
          </div>
        )}
        {events.map((e) => (
          <div key={e.id} className="soma-activity__event">
            <span className="soma-activity__icon">{ACTION_ICONS[e.action] ?? '\u{1F4AC}'}</span>
            <span className="soma-activity__time">{formatTime(e.timestamp)}</span>
            <span className="soma-activity__action">{e.action}</span>
            <span className="soma-activity__desc">{e.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
