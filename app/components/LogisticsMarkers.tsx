'use client';

import {
  logisticsMarkerTooltip,
  storeShortName,
  type ReminderMarker,
  type StoreLogisticsDisplay,
} from '@/lib/storeOrderReminders';

type LogisticsMarkersProps = {
  markers: ReminderMarker[];
  className?: string;
  interactive?: boolean;
};

const GROUP_RING: Record<ReminderMarker['group'], string> = {
  fresh: 'ring-emerald-700/35',
  normal: 'ring-indigo-700/35',
};

export default function LogisticsMarkers({
  markers,
  className = '',
  interactive = true,
}: LogisticsMarkersProps) {
  if (markers.length === 0) return null;

  const fresh = markers.filter((m) => m.group === 'fresh');
  const normal = markers.filter((m) => m.group === 'normal');

  return (
    <div
      className={`flex max-w-full flex-wrap items-center gap-0.5 ${interactive ? 'pointer-events-auto' : 'pointer-events-none'} ${className}`}
      aria-label="Logistik-Hinweise"
    >
      {fresh.length > 0 ? (
        <span className="inline-flex flex-wrap gap-0.5">{fresh.map(renderBadge)}</span>
      ) : null}
      {fresh.length > 0 && normal.length > 0 ? (
        <span className="mx-0.5 text-[8px] font-bold text-gray-400" aria-hidden>
          |
        </span>
      ) : null}
      {normal.length > 0 ? (
        <span className="inline-flex flex-wrap gap-0.5">{normal.map(renderBadge)}</span>
      ) : null}
    </div>
  );

  function renderBadge(marker: ReminderMarker) {
    return (
      <span
        key={marker.code}
        className={`inline-flex items-center rounded border px-1 py-px text-[9px] font-bold leading-none shadow-sm ring-1 ${GROUP_RING[marker.group]}`}
        style={{
          backgroundColor: marker.bgColor,
          color: marker.textColor,
          borderColor: 'rgba(255,255,255,0.55)',
        }}
        title={marker.title}
        aria-label={marker.title}
      >
        {marker.code}
      </span>
    );
  }
}

export type LogisticsMarkerBarProps = {
  display: StoreLogisticsDisplay | null;
  storeColor?: string;
  className?: string;
  /** Show store name row even when there are no markers for this weekday. */
  showStoreWhenEmpty?: boolean;
  interactive?: boolean;
};

type CornerPosition = 'top-left' | 'top-right';

const CORNER_POSITION_CLASS: Record<CornerPosition, string> = {
  'top-left': 'left-0.5 top-0.5',
  'top-right': 'right-0.5 top-0.5',
};

/** BF/L/B/LB badges in the corner of a shift cell (no duplicate store name row). */
export function LogisticsMarkerCorner({
  display,
  className = '',
  position = 'top-left',
  interactive = true,
}: {
  display: StoreLogisticsDisplay | null;
  className?: string;
  position?: CornerPosition;
  interactive?: boolean;
}) {
  if (!display || display.markers.length === 0) return null;

  return (
    <div
      className={`pointer-events-none absolute z-[5] flex max-w-[calc(100%-6px)] flex-wrap items-start gap-0.5 ${CORNER_POSITION_CLASS[position]} ${className}`}
      aria-label={`Logistik ${display.storeName}`}
    >
      <LogisticsMarkers
        markers={display.markers.map((m) => ({
          ...m,
          title: logisticsMarkerTooltip(display.storeName, m),
        }))}
        interactive={interactive}
        className="pointer-events-auto"
      />
    </div>
  );
}

/** Store name + BF/L/B/LB badges for one shift block. */
export function LogisticsMarkerBar({
  display,
  storeColor = '#9ca3af',
  className = '',
  showStoreWhenEmpty = true,
  interactive = true,
}: LogisticsMarkerBarProps) {
  if (!display) return null;
  const hasMarkers = display.markers.length > 0;
  if (!hasMarkers && !showStoreWhenEmpty) return null;

  const shortName = storeShortName(display.storeName);

  return (
    <div
      className={`mb-0.5 w-full rounded border border-black/10 bg-white/90 px-1 py-0.5 shadow-sm ${className}`}
    >
      <div
        className="flex min-w-0 items-center gap-1"
        title={display.storeName}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full border border-white/80 shadow-sm"
          style={{ backgroundColor: storeColor }}
          aria-hidden
        />
        <span className="min-w-0 truncate text-[9px] font-bold leading-tight text-gray-900">
          {shortName}
        </span>
      </div>
      {hasMarkers ? (
        <div className="mt-0.5">
          <LogisticsMarkers
            markers={display.markers.map((m) => ({
              ...m,
              title: logisticsMarkerTooltip(display.storeName, m),
            }))}
            interactive={interactive}
          />
        </div>
      ) : null}
    </div>
  );
}
