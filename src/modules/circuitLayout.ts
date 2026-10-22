/** Board coordinates: x across the PCB, y along the scroll journey. */
export interface BoardStop {
  x: number;
  y: number;
  side: number;
  name: string;
  label: string;
}
export type PartKind = 'qfp' | 'sensor' | 'bga' | 'dual' | 'soic' | 'resistor' | 'mlcc' | 'electrolytic' | 'inductor' | 'header' | 'usb';
export interface BoardPart {
  x: number;
  y: number;
  w: number;
  d: number;
  kind: PartKind;
  reference: string;
  label: string;
  station: number;
}
export const STATION_PITCH = 11.5;
export const COMPONENT_CLEARANCE = .18;

export function overlaps(a: BoardPart, b: BoardPart, clearance = COMPONENT_CLEARANCE): boolean {
  const tolerance = 1e-9; // Avoid treating floating-point roundoff as a collision.
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + clearance - tolerance &&
    Math.abs(a.y - b.y) < (a.d + b.d) / 2 + clearance - tolerance;
}

/** Footprints include leads and solder pads, not just package bodies. */
export function createBoardLayout(stops: BoardStop[]): BoardPart[] {
  const parts: BoardPart[] = [];
  function place(part: BoardPart): void {
    const collision = parts.find(other => overlaps(part, other));
    if (collision) throw new Error(`PCB clearance violation: ${part.reference} / ${collision.reference}`);
    parts.push(part);
  }
  // Reserve every chapter's main footprint before placing supporting circuitry.
  stops.forEach((stop, station) => {
    const kind = station === 1 ? 'sensor' : station === 2 ? 'bga' : station === 6 ? 'dual' : station === 7 ? 'header' : station === 8 ? 'usb' : 'qfp';
    place({ ...stop, w: 4.45, d: 4.45, kind, reference: `U${station + 1}`, label: stop.label, station });
  });
  stops.forEach((stop, station) => {
    let id = 0;
    const add = (kind: PartKind, dx: number, dy: number, w: number, d: number, label = ''): void => {
      const prefix = kind === 'resistor' ? 'R' : kind === 'mlcc' || kind === 'electrolytic' ? 'C' : kind === 'inductor' ? 'L' : kind === 'header' ? 'J' : 'U';
      place({ x: stop.x + dx, y: stop.y + dy, w, d, kind, label, station, reference: `${prefix}${station + 1}${String(++id).padStart(2, '0')}` });
    };
    // Decoupling banks are aligned to package edges with room for rework.
    for (const sign of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        add(i % 3 === 0 ? 'resistor' : 'mlcc', (i - 2.5) * .61, sign * 2.76, .43, .26, i % 3 === 0 ? '102' : '');
      }
      add('soic', sign * 5.5, .15, 1.85, 1.5, '74HC14');
      add('electrolytic', sign * 5.4, 2.75, .92, .92, '220');
      add('electrolytic', sign * 6.65, 2.75, .74, .74, '100');
      add('inductor', sign * 5.55, -2.45, 1.2, 1.2, '4R7');
      for (let j = 0; j < 4; j++) add('resistor', sign * 7.1, -.95 + j * .51, .46, .27, ['103', '472', '1001', '0'][j]);
      for (let j = 0; j < 3; j++) add('mlcc', sign * 4.8 + j * .6, 4.15, .42, .25);
      add('header', sign * 9.25, -.1, 1.1, 3.3, 'I/O');
      add('soic', sign * 10.7, 3.0, 1.7, 1.25, 'LM358');
    }
  });
  return parts;
}
