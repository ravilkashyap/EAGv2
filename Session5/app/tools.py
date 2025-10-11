from typing import Dict, Any, List, Tuple, Optional
import math
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from .artifacts import save_matplotlib_figure


def solve_quadratic(a: float, b: float, c: float) -> Dict[str, Any]:
    discriminant = b ** 2 - 4 * a * c
    if a == 0:
        if b == 0:
            raise ValueError("Invalid coefficients: a and b cannot both be zero")
        root = -c / b
        explanation = f"Linear equation since a=0. Root: x = {root:.6g}."
        return {"roots": [root], "discriminant": discriminant, "explanation": explanation}
    if discriminant > 0:
        r1 = (-b + math.sqrt(discriminant)) / (2 * a)
        r2 = (-b - math.sqrt(discriminant)) / (2 * a)
        nature = "two real roots"
        roots = [r1, r2]
    elif discriminant == 0:
        r = -b / (2 * a)
        nature = "one repeated real root"
        roots = [r]
    else:
        real = -b / (2 * a)
        imag = math.sqrt(-discriminant) / (2 * a)
        nature = "two complex roots"
        roots = [complex(real, imag), complex(real, -imag)]
    explanation = (
        f"Quadratic equation ax^2+bx+c=0 with a={a}, b={b}, c={c}. "
        f"Discriminant Δ={discriminant:.6g} ⇒ {nature}. Roots: {roots}."
    )
    return {"roots": roots, "discriminant": discriminant, "explanation": explanation}


def plot_histogram(numbers: List[float], bins: int = 10, title: str = "Histogram") -> Tuple[str, str]:
    arr = np.array(numbers, dtype=float)
    plt.figure(figsize=(6, 4))
    plt.hist(arr, bins=bins, color="#4f46e5", edgecolor="white")
    plt.title(title)
    plt.xlabel("Value")
    plt.ylabel("Frequency")
    url, _ = save_matplotlib_figure(plt, caption=title)
    caption = f"Histogram with {bins} bins. n={len(arr)}. mean={arr.mean():.4g}, std={arr.std(ddof=1) if len(arr)>1 else 0:.4g}"
    return url, caption


def plot_function(expr: str, x_min: float, x_max: float, points: int = 400, title: str = "f(x)") -> Tuple[str, str]:
    if x_max <= x_min:
        raise ValueError("x_max must be greater than x_min")
    x = np.linspace(x_min, x_max, points)
    safe_locals = {
        "x": x,
        "np": np,
        "sin": np.sin,
        "cos": np.cos,
        "tan": np.tan,
        "exp": np.exp,
        "log": np.log,
        "sqrt": np.sqrt,
        "pi": math.pi,
        "e": math.e,
    }
    y = eval(expr, {"__builtins__": {}}, safe_locals)
    if not isinstance(y, np.ndarray):
        y = np.array(y, dtype=float)
    plt.figure(figsize=(6, 4))
    plt.plot(x, y, color="#0ea5e9")
    plt.title(title)
    plt.xlabel("x")
    plt.ylabel("y")
    plt.grid(alpha=0.3)
    url, _ = save_matplotlib_figure(plt, caption=title)
    caption = f"Plot of y={expr} over [{x_min}, {x_max}] with {points} points."
    return url, caption


def plot_multi_functions(expressions: List[str], x_min: float, x_max: float, points: int = 400, labels: Optional[List[str]] = None, title: str = "Functions") -> Tuple[str, str]:
    if x_max <= x_min:
        raise ValueError("x_max must be greater than x_min")
    if not expressions:
        raise ValueError("expressions cannot be empty")
    x = np.linspace(x_min, x_max, points)
    safe_locals = {
        "x": x,
        "np": np,
        "sin": np.sin,
        "cos": np.cos,
        "tan": np.tan,
        "exp": np.exp,
        "log": np.log,
        "sqrt": np.sqrt,
        "pi": math.pi,
        "e": math.e,
    }
    colors = ["#0ea5e9", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#14b8a6"]
    plt.figure(figsize=(6, 4))
    used_labels = labels or []
    for idx, expr in enumerate(expressions):
        y = eval(str(expr), {"__builtins__": {}}, safe_locals)
        if not isinstance(y, np.ndarray):
            y = np.array(y, dtype=float)
        color = colors[idx % len(colors)]
        label = used_labels[idx] if idx < len(used_labels) else f"y={expr}"
        plt.plot(x, y, color=color, label=label)
    plt.title(title)
    plt.xlabel("x")
    plt.ylabel("y")
    plt.grid(alpha=0.3)
    plt.legend(loc="best")
    url, _ = save_matplotlib_figure(plt, caption=title)
    caption = f"Plot of {len(expressions)} function(s) over [{x_min}, {x_max}] with {points} points."
    return url, caption


def basic_stats(numbers: List[float]) -> Dict[str, Any]:
    arr = np.array(numbers, dtype=float)
    n = len(arr)
    mean = float(arr.mean()) if n else 0.0
    median = float(np.median(arr)) if n else 0.0
    std = float(arr.std(ddof=1)) if n > 1 else 0.0
    return {"count": n, "mean": mean, "median": median, "std": std}


# ---- New grouped-data helpers ----

def _parse_classes(classes: List[Any]) -> Tuple[List[float], float]:
    edges: List[float] = []
    for c in classes:
        if isinstance(c, str) and '-' in c:
            a, b = c.split('-', 1)
            edges.append(float(a))
        elif isinstance(c, (list, tuple)) and len(c) == 2:
            edges.append(float(c[0]))
        else:
            raise ValueError("Class must be 'a-b' string or [a,b] list")
    # Append last upper bound
    last = classes[-1]
    if isinstance(last, str) and '-' in last:
        edges.append(float(last.split('-', 1)[1]))
    else:
        edges.append(float(last[1]))
    h = edges[1] - edges[0]
    return edges, h


def plot_histogram_from_table(classes: List[Any], frequencies: List[int], title: str = "Histogram") -> Tuple[str, str]:
    if len(classes) != len(frequencies):
        raise ValueError("classes and frequencies length mismatch")
    edges, _ = _parse_classes(classes)
    heights = np.array(frequencies, dtype=float)
    plt.figure(figsize=(6, 4))
    plt.hist(
        bins=np.array(edges),
        x=np.repeat([(edges[i] + edges[i+1]) / 2 for i in range(len(heights))], heights.astype(int)),
        color="#4f46e5",
        edgecolor="white",
    )
    plt.title(title)
    plt.xlabel("Class interval")
    plt.ylabel("Frequency")
    url, _ = save_matplotlib_figure(plt, caption=title)
    caption = f"Histogram for grouped data with {len(heights)} classes."
    return url, caption


def grouped_mode(classes: List[Any], frequencies: List[int]) -> Dict[str, Any]:
    if len(classes) != len(frequencies):
        raise ValueError("classes and frequencies length mismatch")
    edges, h = _parse_classes(classes)
    freqs = list(map(int, frequencies))
    i = int(np.argmax(freqs))
    f1 = freqs[i]
    f0 = freqs[i - 1] if i - 1 >= 0 else 0
    f2 = freqs[i + 1] if i + 1 < len(freqs) else 0
    L = edges[i]
    if (2 * f1 - f0 - f2) == 0:
        mode_val = L
    else:
        mode_val = L + ((f1 - f0) / (2 * f1 - f0 - f2)) * h
    explanation = (
        f"Modal class: {classes[i]} with f1={f1}, neighbors f0={f0}, f2={f2}. "
        f"Mode ≈ L + ((f1-f0)/(2f1-f0-f2))*h = {mode_val:.4g} (L={L}, h={h})."
    )
    return {"mode": float(mode_val), "explanation": explanation}


# ---- Series and installment helpers ----

def sum_geometric_series(a: float, r: float, n: int) -> Dict[str, Any]:
    if r == 1:
        s = a * n
    else:
        s = a * (1 - r ** n) / (1 - r)
    return {"sum": float(s), "explanation": f"S_n = a*(1-r^n)/(1-r) = {s:.6g}"}


def sum_geometric_series_from_last(a: float, r: float, last: float) -> Dict[str, Any]:
    term = a
    n = 1
    while abs(term - last) > 1e-9 and n <= 1000:
        term *= r
        n += 1
    if abs(term - last) > 1e-6:
        raise ValueError("last term not on sequence with given a,r")
    return sum_geometric_series(a, r, n) | {"n": n}


def ap_nth(a: float, d: float, n: int) -> Dict[str, Any]:
    val = a + (n - 1) * d
    return {"value": float(val), "explanation": f"a_n = a+(n-1)d = {val:.6g}"}


def ap_sum(a: float, d: float, n: int) -> Dict[str, Any]:
    s = n / 2 * (2 * a + (n - 1) * d)
    return {"sum": float(s), "explanation": f"S_n = n/2*(2a+(n-1)d) = {s:.6g}"}


def loan_remaining(total: float, a: float, d: float, n: int) -> Dict[str, Any]:
    paid = ap_sum(a, d, n)["sum"]
    remaining = total - paid
    return {"paid": float(paid), "remaining": float(remaining)}
