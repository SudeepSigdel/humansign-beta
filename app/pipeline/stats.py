import numpy as np
from scipy.stats import skew

def safe_stats(values):
    if len(values) == 0:
        return None

    arr = np.array(values)

    return {
        "mean": arr.mean(),
        "std": arr.std(ddof=1) if len(arr) > 1 else 0.0,
        "median": np.median(arr),
        "variance": arr.var(ddof=1) if len(arr) > 1 else 0.0,
        "iqr": np.percentile(arr, 75) - np.percentile(arr, 25),
        "min": arr.min(),
        "max": arr.max(),
        "skew": skew(arr) if len(arr) > 2 else 0.0,
        "cv": (arr.std(ddof=1) / arr.mean()) if arr.mean() != 0 else 0.0
    }
