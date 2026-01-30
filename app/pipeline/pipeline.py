from .extract import extract_timings
from .aggregate import aggregate_features

def process_session(events, subject, session_index, rep):
    timings = extract_timings(events)
    features = aggregate_features(timings)

    return {
        "subject": subject,
        "sessionIndex": session_index,
        "rep": rep,
        **features
    }
