import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FIRST_DAY } from "@/lib/urlState.js";
import { PRESETS, activePreset, presetRange } from "@/lib/range.js";

// Calendar dates are local-midnight Date objects; the URL holds YYYY-MM-DD strings.
const isoToDate = (iso) =>
  new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const dateToIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function DateField({ label, value, min, max, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = isoToDate(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`${label}: ${value}`}
          className="px-2 tabular-nums sm:px-3"
        >
          <CalendarDays aria-hidden="true" className="hidden sm:block" />
          <span className="text-muted-foreground hidden sm:inline">{label}</span> {value}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          startMonth={isoToDate(min)}
          endMonth={isoToDate(max)}
          disabled={[{ before: isoToDate(min) }, { after: isoToDate(max) }]}
          onSelect={(d) => {
            if (!d) return;
            onChange(dateToIso(d));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * From / to pickers and quick presets. Bounds: 2003-01-01 to regions.json last_data_day.
 * Writes from/to to the URL through setUrl.
 */
export default function DateRangeBar({ url, setUrl, lastDataDay }) {
  if (!lastDataDay) return null;
  const range = { from: url.from, to: url.to ?? lastDataDay };
  const active = activePreset(range, lastDataDay);
  return (
    <div role="group" aria-label="Exact dates" className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
      <div className="flex items-center gap-1">
        <DateField
          label="From"
          value={range.from}
          min={FIRST_DAY}
          max={lastDataDay}
          onChange={(from) => setUrl(from > range.to ? { from, to: from } : { from })}
        />
        <span aria-hidden="true" className="sm:hidden">
          –
        </span>
        <DateField
          label="To"
          value={range.to}
          min={FIRST_DAY}
          max={lastDataDay}
          onChange={(to) => setUrl(to < range.from ? { from: to, to } : { to })}
        />
      </div>
      <div className="flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none]">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={active === p.id ? "secondary" : "ghost"}
            aria-pressed={active === p.id}
            className={`shrink-0 ${active === p.id ? "font-semibold underline underline-offset-4" : ""}`}
            onClick={() => setUrl(presetRange(p.id, lastDataDay))}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
