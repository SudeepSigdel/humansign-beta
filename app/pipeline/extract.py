from typing import List, Tuple

Event = Tuple[int, str]  # (timestamp_ms, "keydown"/"keyup")

def extract_timings(events: List[Event]):
    hold_times = []
    dd_times = []
    ud_times = []

    last_keydown = None
    last_keyup = None
    active_keydown = None

    for ts, etype in events:
        if etype == "keydown":
            if last_keydown is not None:
                dd_times.append(ts - last_keydown)

            if last_keyup is not None:
                ud_times.append(ts - last_keyup)

            last_keydown = ts
            active_keydown = ts

        elif etype == "keyup" and active_keydown is not None:
            hold_times.append(ts - active_keydown)
            last_keyup = ts
            active_keydown = None

    return {
        "hold": hold_times,
        "dd": dd_times,
        "ud": ud_times
    }
