from .stats import safe_stats
from .outliers import outlier_rate
import numpy as np

def early_late_delta(values):
    if len(values) < 4:
        return 0.0

    mid = len(values) // 2
    early = np.mean(values[:mid])
    late = np.mean(values[mid:])

    return late - early


def aggregate_features(timings):
    features = {}

    for key in ["hold", "dd", "ud"]:
        stats = safe_stats(timings[key])
        if not stats:
            continue

        features[f"{key}_mean"] = stats["mean"]
        features[f"{key}_std"] = stats["std"]
        features[f"{key}_median"] = stats["median"]
        features[f"{key}_variance"] = stats["variance"]
        features[f"{key}_iqr"] = stats["iqr"]

        if key == "hold":
            features["hold_min"] = stats["min"]
            features["hold_max"] = stats["max"]
            features["hold_skew"] = stats["skew"]
            features["hold_cv"] = stats["cv"]

        features[f"{key}_outlier_rate"] = outlier_rate(timings[key])
        features[f"early_late_{key}_delta"] = early_late_delta(timings[key])

    # Rhythm & stability (global)
    all_timings = timings["dd"] + timings["ud"]
    if len(all_timings) > 1:
        arr = np.array(all_timings)
        features["rhythm_stability"] = arr.std() / arr.mean()
        features["tempo_consistency"] = 1 / (1 + arr.std())
        features["intra_session_variance"] = arr.var()

    return features
