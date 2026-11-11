# -*- coding: utf-8 -*-
"""ET_STAMP_20261111. A build time, written the way a reader keeps time.

The hubs and matchup pages printed "Updated 2026-11-10 23:40 UTC". Every other
time on those pages is Eastern (first pitch, kickoff, the slate day), so the one
clock a visitor uses to judge freshness was the one they had to convert.

    et_stamp("2026-11-10T23:40:12Z") -> "Nov 10, 2026, 6:40 PM ET"

No timezone library: Eastern is UTC-4 from the second Sunday in March to the
first Sunday in November and UTC-5 otherwise, switching at 2 AM local.
"""
import datetime

_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _nth_sunday(year, month, n):
    d = datetime.date(year, month, 1)
    d += datetime.timedelta(days=(6 - d.weekday()) % 7)
    return d + datetime.timedelta(days=7 * (n - 1))


def _offset_hours(utc):
    """Hours Eastern is behind UTC at this UTC instant."""
    start = datetime.datetime.combine(_nth_sunday(utc.year, 3, 2), datetime.time(7, 0))   # 2 AM EST
    end = datetime.datetime.combine(_nth_sunday(utc.year, 11, 1), datetime.time(6, 0))    # 2 AM EDT
    return 4 if start <= utc < end else 5


def et_stamp(built_at):
    """ISO UTC time -> 'Nov 10, 2026, 6:40 PM ET'. Unreadable input is returned as it came."""
    raw = str(built_at or "")
    try:
        utc = datetime.datetime.strptime(raw[:16], "%Y-%m-%dT%H:%M")
    except ValueError:
        try:
            utc = datetime.datetime.strptime(raw[:16], "%Y-%m-%d %H:%M")
        except ValueError:
            return raw[:16].replace("T", " ") + " UTC" if raw else raw
    et = utc - datetime.timedelta(hours=_offset_hours(utc))
    hour = et.hour % 12 or 12
    return "%s %d, %d, %d:%02d %s ET" % (_MON[et.month - 1], et.day, et.year, hour, et.minute,
                                         "AM" if et.hour < 12 else "PM")


if __name__ == "__main__":
    assert et_stamp("2026-11-10T23:40:12Z") == "Nov 10, 2026, 6:40 PM ET"
    assert et_stamp("2026-07-04T16:05:00Z") == "Jul 4, 2026, 12:05 PM ET"
    assert et_stamp("2026-11-01T05:59:00Z") == "Nov 1, 2026, 1:59 AM ET"   # still EDT
    assert et_stamp("2026-11-01T06:00:00Z") == "Nov 1, 2026, 1:00 AM ET"   # fell back
    assert et_stamp("2026-03-08T06:59:00Z") == "Mar 8, 2026, 1:59 AM ET"   # still EST
    assert et_stamp("2026-03-08T07:00:00Z") == "Mar 8, 2026, 3:00 AM ET"   # sprang forward
    assert et_stamp("2026-01-01T04:30:00Z") == "Dec 31, 2025, 11:30 PM ET"
    assert et_stamp("") == ""
    print("et_stamp: OK")
