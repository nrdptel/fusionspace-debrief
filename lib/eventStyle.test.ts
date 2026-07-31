import { describe, it, expect } from 'vitest';
import { EVENT_COLOR } from './eventStyle';
import type { EventType } from './analyze/types';

describe('event marker colours', () => {
  it('gives every event its own colour', () => {
    // Drogue and main were both `#0ea5e9`. On screen that is survivable — the chips are
    // labelled — but a marker on an exported figure carries no label, and telling the drogue
    // from the main is the question a cert document is asked about a dual-deploy flight.
    const byColour = new Map<string, EventType[]>();
    for (const [type, colour] of Object.entries(EVENT_COLOR) as [EventType, string][]) {
      byColour.set(colour, [...(byColour.get(colour) ?? []), type]);
    }
    const shared = [...byColour.entries()].filter(([, types]) => types.length > 1);
    expect(shared.map(([c, t]) => `${c}: ${t.join(' + ')}`), 'events sharing a marker colour').toEqual([]);
  });

  it('states a colour for every event type there is', () => {
    // A missing entry renders `undefined` into an SVG `stroke`, which draws nothing at all —
    // an event silently absent from a figure rather than mis-coloured on it.
    const types: EventType[] = ['liftoff', 'burnout', 'apogee', 'drogue', 'main', 'landing'];
    for (const t of types) {
      expect(EVENT_COLOR[t], `${t} has a marker colour`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
