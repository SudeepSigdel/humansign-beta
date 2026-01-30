import numpy as np

def outlier_rate(values):
    if len(values) < 4:
        return 0.0

    arr = np.array(values)
    q1 = np.percentile(arr, 25)
    q3 = np.percentile(arr, 75)
    iqr = q3 - q1

    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr

    outliers = ((arr < lower) | (arr > upper)).sum()
    return outliers / len(arr)