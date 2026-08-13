import { EventEmitter } from 'node:events';

export interface RealtimeEvent {
  type: string; // monitor.status_changed, incident.created, incident.resolved, check.completed, ...
  organizationId: string;
  payload: Record<string, unknown>;
}

class RealtimeBus extends EventEmitter {
  publish(event: RealtimeEvent): void {
    this.emit('event', event);
  }
}

export const realtimeBus = new RealtimeBus();
